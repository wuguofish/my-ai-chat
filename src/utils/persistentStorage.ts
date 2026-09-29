/**
 * 持久化儲存層（IndexedDB 為主，localStorage 為備援）
 *
 * localStorage 只有約 5MB，存檔一大就寫不下，所以改用 IndexedDB：
 * - App 啟動時（Pinia 初始化之前）呼叫 initPersistentStorage()，一次把資料讀進記憶體快取
 * - Pinia persist plugin 從快取同步取得資料來還原 store
 * - 之後的寫入是非同步的，寫進 IndexedDB
 *
 * 第一次啟動時會把舊的 localStorage 資料搬進 IndexedDB，確認寫入成功後才刪除 localStorage 的舊資料
 * 如果瀏覽器不支援 IndexedDB（或開啟失敗），會退回使用 localStorage，行為與舊版相同
 * 但已經用過 IndexedDB 的玩家，資料只存在 IndexedDB 裡，這時開啟失敗會拋出 StorageUnavailableError，
 * 不能退回 localStorage 用空資料啟動（玩家會以為存檔不見，之後的操作也會寫到錯的地方）
 */

import { safeStorage } from '@/utils/dataObfuscation'

const DB_NAME = 'ai-chat'
const DB_VERSION = 1
const KV_STORE = 'kv'

/** 開啟 IndexedDB 的逾時（舊版 iOS Safari 有 open 永遠不回應的問題） */
const OPEN_TIMEOUT_MS = 10_000

/** 記錄「這個瀏覽器的存檔已經放在 IndexedDB」的 localStorage key */
const BACKEND_MARKER_KEY = 'ai-chat-storage-backend'

/** 存檔在 IndexedDB 裡，但這次開不起來 */
export class StorageUnavailableError extends Error {
  /** 開啟失敗的原因 */
  readonly reason: unknown

  constructor(reason: unknown) {
    super('存檔資料庫暫時無法開啟')
    this.name = 'StorageUnavailableError'
    this.reason = reason
  }
}

/** 由 Pinia persist 管理的 key（需要從 localStorage 搬到 IndexedDB 的資料） */
export const PERSISTED_KEYS = [
  'ai-chat-user',
  'ai-chat-characters',
  'ai-chat-rooms',
  'ai-chat-memories',
  'ai-chat-relationships',
  'ai-chat-feed',
  'ai-chat-settings'
] as const

export type StorageBackendName = 'indexeddb' | 'localStorage'

interface StorageBackend {
  name: StorageBackendName
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

// ==========================================
// IndexedDB 後端
// ==========================================

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDatabase(factory: IDBFactory, timeoutMs: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      reject(new Error(`IndexedDB 開啟逾時（${timeoutMs}ms）`))
    }, timeoutMs)

    const request = factory.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE)
      }
    }
    request.onsuccess = () => {
      clearTimeout(timer)
      // 已經逾時放棄了，就把晚到的連線關掉
      if (settled) request.result.close()
      else resolve(request.result)
      settled = true
    }
    request.onerror = () => {
      clearTimeout(timer)
      settled = true
      reject(request.error)
    }
    // blocked 代表其他分頁還開著舊版資料庫，等它關閉後仍會觸發 success，所以只提示不中斷
    request.onblocked = () => console.warn('⚠️ IndexedDB 升級等待其他分頁關閉中')
  })
}

function createIndexedDbBackend(db: IDBDatabase): StorageBackend {
  return {
    name: 'indexeddb',
    async getItem(key) {
      const tx = db.transaction(KV_STORE, 'readonly')
      const value = await promisifyRequest(tx.objectStore(KV_STORE).get(key))
      return typeof value === 'string' ? value : null
    },
    setItem(key, value) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(KV_STORE, 'readwrite')
        tx.objectStore(KV_STORE).put(value, key)
        // 等 transaction 完成才算真的寫入
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    }
  }
}

// ==========================================
// localStorage 後端（備援）
// ==========================================

const localStorageBackend: StorageBackend = {
  name: 'localStorage',
  async getItem(key) {
    return localStorage.getItem(key)
  },
  async setItem(key, value) {
    // safeStorage 在容量不足時會退回明文格式
    safeStorage.setItem(key, value)
  }
}

// ==========================================
// 對外 API
// ==========================================

let backend: StorageBackend = localStorageBackend

/**
 * 啟動時預先讀取的存檔，只給 store 還原用一次（讀取後就移除）
 * 存檔經過混淆後體積很大，不能一直留在記憶體裡
 */
const preloaded = new Map<string, string>()

/** 各 key 目前存檔的大小（字元數），給容量統計用 */
const sizes = new Map<string, number>()

function hasLegacyData(keys: readonly string[]): boolean {
  return keys.some(key => localStorage.getItem(key) !== null)
}

export interface InitResult {
  backend: StorageBackendName
  /** 這次從 localStorage 搬到 IndexedDB 的 key */
  migrated: string[]
}

/**
 * 初始化持久化儲存：開啟 IndexedDB、搬移舊資料、預先讀取所有資料到記憶體
 * 必須在 Pinia store 被使用之前 await
 */
export async function initPersistentStorage(
  keys: readonly string[] = PERSISTED_KEYS,
  factory: IDBFactory | undefined = globalThis.indexedDB,
  openTimeoutMs: number = OPEN_TIMEOUT_MS
): Promise<InitResult> {
  preloaded.clear()
  sizes.clear()
  const migrated: string[] = []

  let db: IDBDatabase | null = null
  if (factory) {
    try {
      db = await openDatabase(factory, openTimeoutMs)
    } catch (error) {
      // 存檔已經搬進 IndexedDB（localStorage 沒有舊資料）時，退回 localStorage 等於用空資料啟動
      if (localStorage.getItem(BACKEND_MARKER_KEY) === 'indexeddb' && !hasLegacyData(keys)) {
        throw new StorageUnavailableError(error)
      }
      console.warn('⚠️ IndexedDB 無法使用，改用 localStorage 儲存:', error)
    }
  }

  if (!db) {
    backend = localStorageBackend
    for (const key of keys) {
      const value = localStorage.getItem(key)
      if (value !== null) {
        preloaded.set(key, value)
        sizes.set(key, value.length)
      }
    }
    return { backend: backend.name, migrated }
  }

  backend = createIndexedDbBackend(db)
  try {
    localStorage.setItem(BACKEND_MARKER_KEY, 'indexeddb')
  } catch {
    // 記不起來也不影響這次使用
  }

  for (const key of keys) {
    let value = await backend.getItem(key)

    // IndexedDB 還沒有這筆資料，但 localStorage 有 → 搬過去
    if (value === null) {
      const legacy = localStorage.getItem(key)
      if (legacy !== null) {
        try {
          await backend.setItem(key, legacy)
          // 讀回來確認一致才刪除舊資料，避免搬到一半資料不見
          const verify = await backend.getItem(key)
          if (verify === legacy) {
            localStorage.removeItem(key)
            migrated.push(key)
            console.log(`✅ 已將 ${key} 搬移到 IndexedDB`)
          } else {
            console.error(`❌ ${key} 搬移後驗證不一致，保留 localStorage 舊資料`)
          }
        } catch (error) {
          console.error(`❌ ${key} 搬移到 IndexedDB 失敗，保留 localStorage 舊資料:`, error)
        }
        value = legacy
      }
    }

    if (value !== null) {
      preloaded.set(key, value)
      sizes.set(key, value.length)
    }
  }

  // 請求瀏覽器不要在空間不足時自動清掉資料（不支援或被拒絕都沒關係）
  globalThis.navigator?.storage?.persist?.()?.catch(() => { /* 忽略 */ })

  return { backend: backend.name, migrated }
}

/**
 * 取得啟動時預先讀取的資料（同步），供 Pinia store 還原用
 * 每個 key 只能取一次，取完就從記憶體移除
 */
export function getPreloadedItem(key: string): string | null {
  const value = preloaded.get(key) ?? null
  preloaded.delete(key)
  return value
}

/** 寫入資料 */
export async function writeItem(key: string, value: string): Promise<void> {
  // 還沒被 store 取走的預先讀取資料已經過時，一併移除
  preloaded.delete(key)
  sizes.set(key, value.length)
  await backend.setItem(key, value)
}

/** 直接從儲存空間讀取目前的資料（非同步） */
export async function readItem(key: string): Promise<string | null> {
  return backend.getItem(key)
}

/** 目前使用的儲存後端 */
export function getStorageBackendName(): StorageBackendName {
  return backend.name
}

export interface StorageUsage {
  backend: StorageBackendName
  /** 各 key 的大小（字元數） */
  items: { key: string; chars: number }[]
  /** 瀏覽器回報的已用量與上限（bytes），不支援時為 null */
  estimate: { usage: number; quota: number } | null
}

/** 取得儲存空間使用量 */
export async function getStorageUsage(keys: readonly string[] = PERSISTED_KEYS): Promise<StorageUsage> {
  const items = keys.map(key => ({ key, chars: key.length + (sizes.get(key) ?? 0) }))

  let estimate: StorageUsage['estimate'] = null
  try {
    const result = await globalThis.navigator?.storage?.estimate?.()
    if (result?.quota) {
      estimate = { usage: result.usage ?? 0, quota: result.quota }
    }
  } catch {
    // 不支援就算了
  }

  return { backend: backend.name, items, estimate }
}
