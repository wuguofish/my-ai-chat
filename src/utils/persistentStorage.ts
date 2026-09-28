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
 */

import { safeStorage } from '@/utils/dataObfuscation'

const DB_NAME = 'ai-chat'
const DB_VERSION = 1
const KV_STORE = 'kv'

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

/**
 * 子 key 的分隔符號
 * 例如聊天訊息依聊天室分開存：`ai-chat-rooms/messages/<roomId>`
 */
export const SUB_KEY_SEPARATOR = '/'

interface StorageBackend {
  name: StorageBackendName
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
  /** 讀取所有以 prefix 開頭的 key */
  getItemsWithPrefix(prefix: string): Promise<[string, string][]>
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

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE)
      }
    }
    request.onsuccess = () => {
      const db = request.result
      // 其他分頁要升級資料庫時，主動關閉連線，避免卡住對方
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error)
    // blocked 代表其他分頁還開著舊版資料庫，等它關閉後仍會觸發 success，所以只提示不中斷
    request.onblocked = () => console.warn('⚠️ IndexedDB 升級等待其他分頁關閉中')
  })
}

function runWriteTransaction(db: IDBDatabase, action: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KV_STORE, 'readwrite')
    action(tx.objectStore(KV_STORE))
    // 等 transaction 完成才算真的寫入
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
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
      return runWriteTransaction(db, store => store.put(value, key))
    },
    removeItem(key) {
      return runWriteTransaction(db, store => store.delete(key))
    },
    async getItemsWithPrefix(prefix) {
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff')
      const tx = db.transaction(KV_STORE, 'readonly')
      const store = tx.objectStore(KV_STORE)
      const [keys, values] = await Promise.all([
        promisifyRequest(store.getAllKeys(range)),
        promisifyRequest(store.getAll(range))
      ])
      const result: [string, string][] = []
      keys.forEach((key, i) => {
        if (typeof key === 'string' && typeof values[i] === 'string') {
          result.push([key, values[i]])
        }
      })
      return result
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
  },
  async removeItem(key) {
    localStorage.removeItem(key)
  },
  async getItemsWithPrefix(prefix) {
    const result: [string, string][] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const value = localStorage.getItem(key)
        if (value !== null) result.push([key, value])
      }
    }
    return result
  }
}

/** 預先讀取各 key 底下的子 key（例如各聊天室的訊息） */
async function preloadSubKeys(keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    for (const [subKey, value] of await backend.getItemsWithPrefix(key + SUB_KEY_SEPARATOR)) {
      cache.set(subKey, value)
    }
  }
}

// ==========================================
// 對外 API
// ==========================================

let backend: StorageBackend = localStorageBackend
const cache = new Map<string, string>()

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
  factory: IDBFactory | null | undefined = globalThis.indexedDB
): Promise<InitResult> {
  cache.clear()
  const migrated: string[] = []

  let db: IDBDatabase | null = null
  if (factory) {
    try {
      db = await openDatabase(factory)
    } catch (error) {
      console.warn('⚠️ IndexedDB 無法使用，改用 localStorage 儲存:', error)
    }
  }

  if (!db) {
    backend = localStorageBackend
    for (const key of keys) {
      const value = localStorage.getItem(key)
      if (value !== null) cache.set(key, value)
    }
    await preloadSubKeys(keys)
    return { backend: backend.name, migrated }
  }

  backend = createIndexedDbBackend(db)

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

    if (value !== null) cache.set(key, value)
  }

  await preloadSubKeys(keys)

  // 請求瀏覽器不要在空間不足時自動清掉資料（不支援或被拒絕都沒關係）
  globalThis.navigator?.storage?.persist?.()?.catch(() => { /* 忽略 */ })

  return { backend: backend.name, migrated }
}

/** 取得啟動時預先讀取的資料（同步），供 Pinia store 還原用 */
export function getPreloadedItem(key: string): string | null {
  return cache.get(key) ?? null
}

/** 取得啟動時預先讀取、以 prefix 開頭的所有資料 */
export function getPreloadedItemsWithPrefix(prefix: string): [string, string][] {
  return [...cache.entries()].filter(([key]) => key.startsWith(prefix))
}

/** 寫入資料 */
export async function writeItem(key: string, value: string): Promise<void> {
  cache.set(key, value)
  await backend.setItem(key, value)
}

/** 刪除資料 */
export async function removeItem(key: string): Promise<void> {
  cache.delete(key)
  await backend.removeItem(key)
}

/** 目前使用的儲存後端 */
export function getStorageBackendName(): StorageBackendName {
  return backend.name
}

export interface StorageUsage {
  backend: StorageBackendName
  /** 各 key 的大小（字元數，包含其子 key） */
  items: { key: string; chars: number }[]
  /** 瀏覽器回報的已用量與上限（bytes），不支援時為 null */
  estimate: { usage: number; quota: number } | null
}

/** 取得儲存空間使用量 */
export async function getStorageUsage(keys: readonly string[] = PERSISTED_KEYS): Promise<StorageUsage> {
  const items = keys.map(key => {
    let chars = 0
    for (const [k, v] of cache) {
      if (k === key || k.startsWith(key + SUB_KEY_SEPARATOR)) chars += k.length + v.length
    }
    return { key, chars }
  })

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
