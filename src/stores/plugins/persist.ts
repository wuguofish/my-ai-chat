/**
 * Pinia 持久化 plugin（取代 pinia-plugin-persistedstate）
 *
 * - store 建立時，從 persistentStorage 預先讀好的快取還原資料
 * - store 變動時節流寫入（避免 AI 串流回應時每個字都寫一次）
 * - 頁面隱藏或關閉時立即寫入尚未存檔的變更
 */

import type { PiniaPluginContext } from 'pinia'
import { obfuscate, smartDecode } from '@/utils/dataObfuscation'
import { getPreloadedItem, writeItem } from '@/utils/persistentStorage'

export interface PersistOptions {
  /** 儲存用的 key */
  key: string
  /** 是否以混淆編碼儲存（預設 false） */
  obfuscate?: boolean
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

export function persistPlugin({ store, options }: PiniaPluginContext): void {
  const persist = options.persist
  if (!persist) return

  // 還原資料
  const raw = getPreloadedItem(persist.key)
  if (raw) {
    try {
      const data = smartDecode(raw)
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        store.$patch(data as Record<string, unknown>)
      }
    } catch (error) {
      console.error(`❌ 還原 ${persist.key} 失敗:`, error)
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = async () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    try {
      const serialized = persist.obfuscate ? obfuscate(store.$state) : JSON.stringify(store.$state)
      await writeItem(persist.key, serialized)
    } catch (error) {
      console.error(`❌ 儲存 ${persist.key} 失敗:`, error)
    }
  }

  flushers.add(flush)

  store.$subscribe(() => {
    if (timer === null) {
      timer = setTimeout(() => { void flush() }, WRITE_THROTTLE_MS)
    }
  }, { detached: true })
}
