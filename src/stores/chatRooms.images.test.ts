import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { persistPlugin, flushPersistedStores } from './plugins/persist'
import { initPersistentStorage, writeItem } from '@/utils/persistentStorage'
import {
  initImageStore,
  getImageDataUrl,
  getImagesTotalBytes,
  dataUrlToStoredImage,
  storedImageToDataUrl
} from '@/utils/imageStore'
import { obfuscate } from '@/utils/dataObfuscation'
import { useChatRoomsStore } from './chatRooms'
import type { ImageAttachment } from '@/types'

// 1x1 透明 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function installLocalStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  globalThis.localStorage = {
    get length() { return data.size },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
    clear: () => data.clear()
  } as Storage
}

function freshPinia() {
  const pinia = createPinia()
  pinia.use(persistPlugin)
  createApp({}).use(pinia)
  setActivePinia(pinia)
}

const image = (id: string): ImageAttachment => ({ id, data: PNG, mimeType: 'image/png', width: 1, height: 1 })

/** 等待背景的圖片搬移完成 */
const settle = () => new Promise(resolve => setTimeout(resolve, 50))

describe('data URL 與二進位資料互轉', () => {
  it('轉換後再轉回應相同', () => {
    expect(storedImageToDataUrl(dataUrlToStoredImage(PNG))).toBe(PNG)
  })
})

describe('聊天圖片存進 IndexedDB', () => {
  let dataFactory: IDBFactory
  let imageFactory: IDBFactory

  beforeEach(async () => {
    dataFactory = new IDBFactory()
    imageFactory = new IDBFactory()
    installLocalStorage()
    await initPersistentStorage(['ai-chat-rooms'], dataFactory)
    await initImageStore(imageFactory)
    freshPinia()
  })

  it('新訊息的圖片應搬進 IndexedDB，訊息裡只留 id', async () => {
    const store = useChatRoomsStore()
    const roomId = store.createChatRoom('測試', ['c1'])
    const sent = [image('img-1')]
    store.addMessage(roomId, { roomId, senderId: 'user', senderName: '我', content: '看圖', images: sent })
    await settle()

    const saved = store.getMessages(roomId)[0]!
    expect(saved.images?.[0]).toEqual({ id: 'img-1', mimeType: 'image/png', width: 1, height: 1 })
    expect(await getImageDataUrl('img-1')).toBe(PNG)
    // 呼叫端手上的圖片（要送給 AI 的）不應被改掉
    expect(sent[0]!.data).toBe(PNG)
  })

  it('匯出時應補回圖片的 Base64', async () => {
    const store = useChatRoomsStore()
    const roomId = store.createChatRoom('測試', ['c1'])
    store.addMessage(roomId, { roomId, senderId: 'user', senderName: '我', content: '', images: [image('img-2')] })
    await settle()

    const exported = await store.getMessagesWithImageData(roomId)
    expect(exported[0]!.images?.[0]?.data).toBe(PNG)
    const all = await store.getMessagesWithImageData()
    expect(all[roomId]![0]!.images?.[0]?.data).toBe(PNG)
    // 匯出的是副本，store 裡仍不含 Base64
    expect(store.getMessages(roomId)[0]!.images?.[0]?.data).toBeUndefined()
  })

  it('舊存檔裡的 Base64 圖片應被搬進 IndexedDB', async () => {
    await writeItem('ai-chat-rooms', obfuscate({
      chatRooms: [{ id: 'r1', name: '舊', type: 'single', characterIds: [], settings: {}, createdAt: '', lastMessageAt: '' }],
      messages: { r1: [{ id: 'm1', roomId: 'r1', senderId: 'user', senderName: '我', content: '', timestamp: '', images: [image('old-img')] }] }
    }))
    await initPersistentStorage(['ai-chat-rooms'], dataFactory)
    freshPinia()
    const store = useChatRoomsStore()

    expect(await store.migrateInlineImages()).toBe(1)
    expect(store.getMessages('r1')[0]!.images?.[0]?.data).toBeUndefined()
    expect(await getImageDataUrl('old-img')).toBe(PNG)

    // 存檔後重新啟動，圖片仍能讀到
    await nextTick()
    await flushPersistedStores()
    await initPersistentStorage(['ai-chat-rooms'], dataFactory)
    freshPinia()
    expect(useChatRoomsStore().getMessages('r1')[0]!.images?.[0]).toEqual(
      { id: 'old-img', mimeType: 'image/png', width: 1, height: 1 }
    )
  })

  it('刪除訊息後，清理時應刪掉沒人用的圖片', async () => {
    const store = useChatRoomsStore()
    const roomId = store.createChatRoom('測試', ['c1'])
    store.addMessage(roomId, { roomId, senderId: 'user', senderName: '我', content: '', images: [image('keep')] })
    const removed = store.addMessage(roomId, { roomId, senderId: 'user', senderName: '我', content: '', images: [image('drop')] })
    await settle()
    const bytesBefore = await getImagesTotalBytes()

    store.deleteMessage(roomId, removed.id)
    expect(await store.cleanupOrphanImages()).toBe(1)
    expect(await getImageDataUrl('keep')).toBe(PNG)
    expect(await getImageDataUrl('drop')).toBeNull()
    expect(await getImagesTotalBytes()).toBeLessThan(bytesBefore)
  })

  it('聊天室存檔還原失敗時，不應清理圖片', async () => {
    const store = useChatRoomsStore()
    const roomId = store.createChatRoom('測試', ['c1'])
    store.addMessage(roomId, { roomId, senderId: 'user', senderName: '我', content: '', images: [image('precious')] })
    await settle()
    await nextTick()
    await flushPersistedStores()
    await writeItem(`ai-chat-rooms/messages/${roomId}`, 'AICHAT_V1:!!!壞掉')

    await initPersistentStorage(['ai-chat-rooms'], dataFactory)
    freshPinia()
    expect(await useChatRoomsStore().cleanupOrphanImages()).toBe(0)
    expect(await getImageDataUrl('precious')).toBe(PNG)
  })

  it('圖片儲存空間無法使用時，圖片維持存在訊息裡', async () => {
    await initImageStore(null)
    const store = useChatRoomsStore()
    const roomId = store.createChatRoom('測試', ['c1'])
    store.addMessage(roomId, { roomId, senderId: 'user', senderName: '我', content: '', images: [image('inline')] })
    await settle()
    expect(store.getMessages(roomId)[0]!.images?.[0]?.data).toBe(PNG)
  })
})
