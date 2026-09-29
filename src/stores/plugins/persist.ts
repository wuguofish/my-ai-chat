/**
 * Pinia 持久化 plugin（取代 pinia-plugin-persistedstate）
 *
 * - store 建立時，從 persistentStorage 預先讀好的快取還原資料
 * - store 變動時節流寫入（避免 AI 串流回應時每個字都寫一次）
 * - 頁面隱藏或關閉時立即寫入尚未存檔的變更
 * - 可用 splitBy 把某個物件欄位拆成多筆分開存（例如依聊天室分開存訊息），
 *   寫入時只寫有變動的那幾筆，不用每次整包重寫
 */

import type { PiniaPluginContext, StateTree } from 'pinia'
import { obfuscate, smartDecode } from '@/utils/dataObfuscation'
import {
  SUB_KEY_SEPARATOR,
  getPreloadedItem,
  getPreloadedItemsWithPrefix,
  removeItem,
  writeItem
} from '@/utils/persistentStorage'

export interface PersistOptions {
  /** 儲存用的 key */
  key: string
  /** 是否以混淆編碼儲存（預設 false） */
  obfuscate?: boolean
  /**
   * 要拆開存的 state 欄位（值必須是物件，例如 Record<roomId, Message[]>）
   * 每個子項目存在 `${key}/${splitBy}/${子項目 key}`
   */
  splitBy?: string
}

declare module 'pinia' {
  export interface DefineStoreOptionsBase<S, Store> {
    persist?: PersistOptions
  }
}

/** 寫入節流間隔（毫秒） */
const WRITE_THROTTLE_MS = 300

/** 各 store 的「立即寫入」函數 */
const flushers = new Set<() => Promise<void>>()

/** 各 key 的還原結果 */
export type HydrationStatus = 'restored' | 'empty' | 'failed'
const hydrationStatus = new Map<string, HydrationStatus>()

/**
 * 取得 store 的還原結果
 * 'failed' 代表存檔解析失敗，此時 store 內容不完整，不應依據它刪除其他資料
 */
export function getHydrationStatus(key: string): HydrationStatus | undefined {
  return hydrationStatus.get(key)
}

/**
 * 立即寫入所有尚未存檔的變更
 * 在 reload 或離開頁面前呼叫，確保資料已寫入
 */
export async function flushPersistedStores(): Promise<void> {
  await Promise.all([...flushers].map(flush => flush()))
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { void flushPersistedStores() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPersistedStores()
  })
}

/**
 * 子項目內容的指紋（長度 + 53-bit 雜湊），用來判斷有沒有變動
 * 不保留整份 JSON，避免同一份訊息在記憶體裡多存一份
 */
function fingerprint(json: string): string {
  // cyrb53：碰撞機率極低，再加上長度一起比對
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `${json.length}:${4294967296 * (2097151 & h2) + (h1 >>> 0)}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function persistPlugin({ store, options }: PiniaPluginContext): void {
  const persist = options.persist
  if (!persist) return

  const { key, splitBy } = persist
  const encode = (value: unknown) => persist.obfuscate ? obfuscate(value) : JSON.stringify(value)
  const subPrefix = splitBy ? `${key}${SUB_KEY_SEPARATOR}${splitBy}${SUB_KEY_SEPARATOR}` : ''

  /** 上次寫入的子項目指紋（用來判斷哪些子項目有變動） */
  const lastWrittenParts = new Map<string, string>()
  /** 還原時發現舊格式（子項目還包在主資料裡），需要立即改寫成拆開的格式 */
  let needsSplitMigration = false
  /** 有子項目解析失敗 */
  let partFailed = false

  // ===== 還原資料 =====
  try {
    const raw = getPreloadedItem(key)
    const data = raw ? smartDecode(raw) : {}
    if (!isPlainObject(data)) throw new Error('存檔格式錯誤')

    if (splitBy) {
      // 舊格式：子項目包在主資料裡
      const legacyParts = isPlainObject(data[splitBy]) ? data[splitBy] as Record<string, unknown> : null
      needsSplitMigration = legacyParts !== null
      const parts: Record<string, unknown> = { ...legacyParts }

      // 新格式：子項目分開存（優先於主資料裡的舊資料）
      for (const [subKey, value] of getPreloadedItemsWithPrefix(subPrefix)) {
        const partKey = subKey.slice(subPrefix.length)
        try {
          parts[partKey] = smartDecode(value)
          lastWrittenParts.set(partKey, fingerprint(JSON.stringify(parts[partKey])))
        } catch (error) {
          // 解析失敗的子項目不載入也不追蹤，之後既不會覆寫也不會刪除它
          partFailed = true
          console.error(`❌ 還原 ${subKey} 失敗:`, error)
        }
      }

      if (raw || Object.keys(parts).length > 0) {
        data[splitBy] = parts
      }
    }

    if (Object.keys(data).length > 0) {
      store.$patch(data as StateTree)
    }
    hydrationStatus.set(key, partFailed ? 'failed' : Object.keys(data).length > 0 ? 'restored' : 'empty')
  } catch (error) {
    hydrationStatus.set(key, 'failed')
    console.error(`❌ 還原 ${key} 失敗:`, error)
  }

  // ===== 寫入資料 =====
  let timer: ReturnType<typeof setTimeout> | null = null

  const writeSplitState = async () => {
    const state = store.$state as Record<string, unknown>
    const parts = (isPlainObject(state[splitBy!]) ? state[splitBy!] : {}) as Record<string, unknown>

    // 1. 只寫有變動的子項目
    const writes: Promise<void>[] = []
    for (const [partKey, value] of Object.entries(parts)) {
      const json = JSON.stringify(value)
      const print = fingerprint(json)
      if (lastWrittenParts.get(partKey) === print) continue
      lastWrittenParts.set(partKey, print)
      writes.push(writeItem(subPrefix + partKey, persist.obfuscate ? obfuscate(value) : json))
    }
    await Promise.all(writes)

    // 2. 寫主資料（不含拆開的欄位）
    const { [splitBy!]: _omitted, ...rest } = state
    await writeItem(key, encode(rest))
    needsSplitMigration = false

    // 3. 刪除已不存在的子項目
    const removals: Promise<void>[] = []
    for (const partKey of [...lastWrittenParts.keys()]) {
      if (!(partKey in parts)) {
        lastWrittenParts.delete(partKey)
        removals.push(removeItem(subPrefix + partKey))
      }
    }
    await Promise.all(removals)
  }

  const flush = async () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    try {
      if (splitBy) {
        await writeSplitState()
      } else {
        await writeItem(key, encode(store.$state))
      }
    } catch (error) {
      console.error(`❌ 儲存 ${key} 失敗:`, error)
    }
  }

  const scheduleWrite = () => {
    if (timer === null) {
      timer = setTimeout(() => { void flush() }, WRITE_THROTTLE_MS)
    }
  }

  flushers.add(flush)
  store.$subscribe(scheduleWrite, { detached: true })

  // 舊格式存檔立刻改寫成拆開的格式
  if (needsSplitMigration) scheduleWrite()
}
