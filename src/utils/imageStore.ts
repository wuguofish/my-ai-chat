/**
 * 聊天圖片儲存（IndexedDB）
 *
 * 圖片原本以 Base64 data URL 存在訊息裡，體積會膨脹約 1/3，還會跟著訊息一起整包序列化
 * 改成把圖片的二進位資料存在獨立的 IndexedDB 資料庫，訊息裡只留圖片 id
 *
 * - 用獨立資料庫（不和主存檔共用），之後調整主資料庫版本時不會互相影響
 * - 存 ArrayBuffer 而不是 Blob，避開舊版 Safari 在 IndexedDB 存 Blob 的問題
 * - 無法使用 IndexedDB 時 isImageStoreAvailable() 為 false，圖片維持存在訊息裡（舊行為）
 */

import { reactive } from 'vue'
import type { ImageAttachment } from '@/types'

const DB_NAME = 'ai-chat-images'
const DB_VERSION = 1
const IMAGE_STORE = 'images'

interface StoredImage {
  mimeType: string
  buffer: ArrayBuffer
}

let db: IDBDatabase | null = null

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runWriteTransaction(action: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('圖片儲存空間尚未初始化'))
      return
    }
    const tx = db.transaction(IMAGE_STORE, 'readwrite')
    action(tx.objectStore(IMAGE_STORE))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** 開啟圖片資料庫，失敗時回傳 false（圖片會維持存在訊息裡） */
export async function initImageStore(factory: IDBFactory | null | undefined = globalThis.indexedDB): Promise<boolean> {
  db = null
  urlCache.forEach(url => URL.revokeObjectURL(url))
  urlCache.clear()
  loading.clear()
  if (!factory) return false

  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(IMAGE_STORE)) {
          request.result.createObjectStore(IMAGE_STORE)
        }
      }
      request.onsuccess = () => {
        const opened = request.result
        opened.onversionchange = () => opened.close()
        resolve(opened)
      }
      request.onerror = () => reject(request.error)
    })
    return true
  } catch (error) {
    console.warn('⚠️ 圖片儲存空間無法使用，圖片將維持存在訊息中:', error)
    return false
  }
}

export function isImageStoreAvailable(): boolean {
  return db !== null
}

// ==========================================
// data URL 與二進位資料互轉
// ==========================================

export function dataUrlToStoredImage(dataUrl: string): StoredImage {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) throw new Error('無效的 data URL')
  const mimeType = match[1] || 'application/octet-stream'
  const payload = match[3] ?? ''
  const binary = match[2] ? atob(payload) : decodeURIComponent(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { mimeType, buffer: bytes.buffer }
}

export function storedImageToDataUrl({ mimeType, buffer }: StoredImage): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // 分段轉換，避免 String.fromCharCode 參數過多
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

// ==========================================
// 讀寫
// ==========================================

/** 儲存圖片（data URL），成功回傳 true */
export async function saveImage(id: string, dataUrl: string): Promise<boolean> {
  if (!db) return false
  try {
    const image = dataUrlToStoredImage(dataUrl)
    await runWriteTransaction(store => store.put(image, id))
    return true
  } catch (error) {
    console.error(`❌ 儲存圖片 ${id} 失敗:`, error)
    return false
  }
}

async function loadImage(id: string): Promise<StoredImage | null> {
  if (!db) return null
  const tx = db.transaction(IMAGE_STORE, 'readonly')
  const result = await promisifyRequest(tx.objectStore(IMAGE_STORE).get(id))
  return result && typeof result === 'object' ? result as StoredImage : null
}

/** 取得圖片的 data URL（匯出/備份用），找不到時回傳 null */
export async function getImageDataUrl(id: string): Promise<string | null> {
  const image = await loadImage(id)
  return image ? storedImageToDataUrl(image) : null
}

/** 刪除所有不在 keepIds 裡的圖片，回傳刪除數量 */
export async function deleteImagesExcept(keepIds: Set<string>): Promise<number> {
  if (!db) return 0
  const tx = db.transaction(IMAGE_STORE, 'readonly')
  const allIds = await promisifyRequest(tx.objectStore(IMAGE_STORE).getAllKeys())
  const toDelete = allIds.filter(id => typeof id === 'string' && !keepIds.has(id)) as string[]
  if (toDelete.length > 0) {
    await runWriteTransaction(store => toDelete.forEach(id => store.delete(id)))
    toDelete.forEach(id => {
      const url = urlCache.get(id)
      if (url) URL.revokeObjectURL(url)
      urlCache.delete(id)
    })
  }
  return toDelete.length
}

/** 所有圖片佔用的大小（bytes） */
export function getImagesTotalBytes(): Promise<number> {
  if (!db) return Promise.resolve(0)
  const tx = db.transaction(IMAGE_STORE, 'readonly')
  // 用 cursor 逐筆累加，不要一次把所有圖片的二進位讀進記憶體
  const request = tx.objectStore(IMAGE_STORE).openCursor()
  let total = 0
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(total)
        return
      }
      total += (cursor.value as StoredImage | undefined)?.buffer?.byteLength ?? 0
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}

// ==========================================
// 顯示用：圖片 id → object URL（reactive，載入完成後畫面自動更新）
// ==========================================

const urlCache = reactive(new Map<string, string>())
const loading = new Set<string>()

/**
 * 取得圖片可顯示的網址
 * - 圖片還在訊息裡（有 data）：直接用 data URL
 * - 圖片存在 IndexedDB：回傳 object URL；第一次呼叫會開始載入並先回傳空字串，載入完成後畫面自動更新
 */
export function getImageSrc(image: ImageAttachment): string {
  if (image.data) return image.data

  const cached = urlCache.get(image.id)
  if (cached) return cached

  if (!loading.has(image.id) && db) {
    loading.add(image.id)
    loadImage(image.id)
      .then(stored => {
        if (stored) {
          const blob = new Blob([stored.buffer], { type: stored.mimeType })
          urlCache.set(image.id, URL.createObjectURL(blob))
        }
      })
      .catch(error => console.error(`❌ 讀取圖片 ${image.id} 失敗:`, error))
      .finally(() => loading.delete(image.id))
  }
  return ''
}
