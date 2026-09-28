import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { createApp, ref, nextTick } from 'vue'
import { persistPlugin, flushPersistedStores, getHydrationStatus } from './persist'
import { initPersistentStorage, getPreloadedItem, getPreloadedItemsWithPrefix, writeItem } from '@/utils/persistentStorage'
import { obfuscate, isObfuscated, smartDecode } from '@/utils/dataObfuscation'

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

const useSecretStore = defineStore('secret', () => {
  const items = ref<string[]>([])
  return { items }
}, { persist: { key: 'test-secret', obfuscate: true } })

const usePlainStore = defineStore('plain', {
  state: () => ({ count: 0 }),
  persist: { key: 'test-plain' }
})

const KEYS = ['test-secret', 'test-plain']

function freshPinia() {
  const pinia = createPinia()
  pinia.use(persistPlugin)
  // Pinia plugin 要在掛到 app 之後才會套用到 store
  createApp({}).use(pinia)
  setActivePinia(pinia)
}

describe('persistPlugin', () => {
  let factory: IDBFactory

  beforeEach(() => {
    factory = new IDBFactory()
  })

  it('應從舊的 localStorage 混淆資料還原 store', async () => {
    installLocalStorage({ 'test-secret': obfuscate({ items: ['a', 'b'] }) })
    await initPersistentStorage(KEYS, factory)
    freshPinia()

    expect(useSecretStore().items).toEqual(['a', 'b'])
  })

  it('也能讀取明文 JSON 格式', async () => {
    installLocalStorage({ 'test-plain': JSON.stringify({ count: 7 }) })
    await initPersistentStorage(KEYS, factory)
    freshPinia()

    expect(usePlainStore().count).toBe(7)
  })

  it('變更後應寫入 IndexedDB，重新啟動可還原', async () => {
    installLocalStorage()
    await initPersistentStorage(KEYS, factory)
    freshPinia()

    const secret = useSecretStore()
    const plain = usePlainStore()
    secret.items.push('x')
    plain.count = 3
    await nextTick()
    await flushPersistedStores()

    // 依設定決定是否混淆
    expect(isObfuscated(getPreloadedItem('test-secret'))).toBe(true)
    expect(JSON.parse(getPreloadedItem('test-plain')!)).toEqual({ count: 3 })

    // 模擬重新開啟 App
    await initPersistentStorage(KEYS, factory)
    freshPinia()
    expect(useSecretStore().items).toEqual(['x'])
    expect(usePlainStore().count).toBe(3)
    expect(smartDecode(getPreloadedItem('test-secret')!)).toEqual({ items: ['x'] })
  })

  it('連續多次變更後應保存最後狀態', async () => {
    installLocalStorage()
    await initPersistentStorage(KEYS, factory)
    freshPinia()

    const plain = usePlainStore()
    for (let i = 1; i <= 50; i++) {
      plain.count = i
      await nextTick()
    }
    await flushPersistedStores()

    await initPersistentStorage(KEYS, factory)
    freshPinia()
    expect(usePlainStore().count).toBe(50)
  })
})

describe('persistPlugin（splitBy：依子項目分開存）', () => {
  const useRoomsStore = defineStore('rooms', () => {
    const rooms = ref<string[]>([])
    const messages = ref<Record<string, string[]>>({})
    return { rooms, messages }
  }, { persist: { key: 'test-rooms', obfuscate: true, splitBy: 'messages' } })

  const ROOM_KEYS = ['test-rooms']
  const PREFIX = 'test-rooms/messages/'
  let factory: IDBFactory

  beforeEach(() => {
    factory = new IDBFactory()
  })

  const writtenParts = () => Object.fromEntries(
    getPreloadedItemsWithPrefix(PREFIX).map(([k, v]) => [k.slice(PREFIX.length), smartDecode(v)])
  )

  it('舊格式（訊息包在主資料裡）應還原，並立刻改寫成分開存', async () => {
    installLocalStorage({ 'test-rooms': obfuscate({ rooms: ['a', 'b'], messages: { a: ['hi'], b: ['yo'] } }) })
    await initPersistentStorage(ROOM_KEYS, factory)
    freshPinia()

    const store = useRoomsStore()
    expect(store.messages).toEqual({ a: ['hi'], b: ['yo'] })

    await flushPersistedStores()
    expect(writtenParts()).toEqual({ a: ['hi'], b: ['yo'] })
    expect(smartDecode(getPreloadedItem('test-rooms')!)).toEqual({ rooms: ['a', 'b'] })

    // 重新啟動後仍完整
    await initPersistentStorage(ROOM_KEYS, factory)
    freshPinia()
    expect(useRoomsStore().messages).toEqual({ a: ['hi'], b: ['yo'] })
  })

  it('只改一個聊天室時，只重寫那個聊天室', async () => {
    installLocalStorage()
    await initPersistentStorage(ROOM_KEYS, factory)
    freshPinia()
    const store = useRoomsStore()
    store.messages = { a: ['1'], b: ['2'] }
    await nextTick()
    await flushPersistedStores()

    // 重新啟動，記錄 b 目前存的內容
    await initPersistentStorage(ROOM_KEYS, factory)
    freshPinia()
    const reloaded = useRoomsStore()
    const bBefore = getPreloadedItem(PREFIX + 'b')

    reloaded.messages.a!.push('3')
    await nextTick()
    await flushPersistedStores()

    expect(writtenParts()).toEqual({ a: ['1', '3'], b: ['2'] })
    expect(getPreloadedItem(PREFIX + 'b')).toBe(bBefore)
  })

  it('刪除聊天室時應刪除對應的存檔', async () => {
    installLocalStorage()
    await initPersistentStorage(ROOM_KEYS, factory)
    freshPinia()
    const store = useRoomsStore()
    store.messages = { a: ['1'], b: ['2'] }
    await nextTick()
    await flushPersistedStores()

    delete store.messages.b
    await nextTick()
    await flushPersistedStores()
    expect(writtenParts()).toEqual({ a: ['1'] })

    await initPersistentStorage(ROOM_KEYS, factory)
    expect(getPreloadedItem(PREFIX + 'b')).toBeNull()
  })

  it('某個聊天室存檔解析失敗時，不應被刪除或覆寫，並回報 failed', async () => {
    installLocalStorage()
    await initPersistentStorage(ROOM_KEYS, factory)
    freshPinia()
    const store = useRoomsStore()
    store.messages = { a: ['1'] }
    await nextTick()
    await flushPersistedStores()
    await writeItem(PREFIX + 'broken', 'AICHAT_V1:!!!壞掉的資料')

    await initPersistentStorage(ROOM_KEYS, factory)
    freshPinia()
    const reloaded = useRoomsStore()
    expect(getHydrationStatus('test-rooms')).toBe('failed')
    expect(reloaded.messages).toEqual({ a: ['1'] })

    reloaded.messages.a!.push('2')
    await nextTick()
    await flushPersistedStores()
    expect(getPreloadedItem(PREFIX + 'broken')).toBe('AICHAT_V1:!!!壞掉的資料')
  })
})
