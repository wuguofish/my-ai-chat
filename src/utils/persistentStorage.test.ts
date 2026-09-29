import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  initPersistentStorage,
  getPreloadedItem,
  writeItem,
  readItem,
  getStorageBackendName,
  getStorageUsage,
  StorageUnavailableError
} from './persistentStorage'

/** 簡易的 localStorage 模擬（測試環境是 node） */
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
  return data
}

const KEYS = ['ai-chat-user', 'ai-chat-rooms']

describe('initPersistentStorage', () => {
  let factory: IDBFactory

  beforeEach(() => {
    factory = new IDBFactory()
  })

  it('應把 localStorage 舊資料搬到 IndexedDB，並刪除舊資料', async () => {
    const ls = installLocalStorage({ 'ai-chat-user': 'AICHAT_V1:abc', 'ai-chat-rooms': '{"a":1}' })

    const result = await initPersistentStorage(KEYS, factory)

    expect(result.backend).toBe('indexeddb')
    expect(result.migrated).toEqual(KEYS)
    expect(ls.has('ai-chat-user')).toBe(false)
    expect(ls.has('ai-chat-rooms')).toBe(false)
    expect(getPreloadedItem('ai-chat-user')).toBe('AICHAT_V1:abc')
    expect(getPreloadedItem('ai-chat-rooms')).toBe('{"a":1}')
  })

  it('重新啟動後應從 IndexedDB 讀到資料', async () => {
    installLocalStorage({ 'ai-chat-user': 'first' })
    await initPersistentStorage(KEYS, factory)
    await writeItem('ai-chat-user', 'updated')

    installLocalStorage()
    const result = await initPersistentStorage(KEYS, factory)

    expect(result.migrated).toEqual([])
    expect(getPreloadedItem('ai-chat-user')).toBe('updated')
    expect(getPreloadedItem('ai-chat-rooms')).toBeNull()
  })

  it('IndexedDB 已有資料時，不應被 localStorage 殘留的舊資料覆蓋', async () => {
    installLocalStorage()
    await initPersistentStorage(KEYS, factory)
    await writeItem('ai-chat-user', 'idb-data')

    const ls = installLocalStorage({ 'ai-chat-user': 'stale' })
    await initPersistentStorage(KEYS, factory)

    expect(getPreloadedItem('ai-chat-user')).toBe('idb-data')
    expect(ls.get('ai-chat-user')).toBe('stale')
  })

  it('沒有 IndexedDB 時應退回 localStorage', async () => {
    const ls = installLocalStorage({ 'ai-chat-user': 'local' })

    const result = await initPersistentStorage(KEYS, undefined)

    expect(result.backend).toBe('localStorage')
    expect(getStorageBackendName()).toBe('localStorage')
    expect(getPreloadedItem('ai-chat-user')).toBe('local')

    await writeItem('ai-chat-rooms', '{"b":2}')
    expect(ls.get('ai-chat-rooms')).toBe('{"b":2}')
  })

  it('IndexedDB 開啟失敗時應退回 localStorage，且不刪除舊資料', async () => {
    const ls = installLocalStorage({ 'ai-chat-user': 'local' })
    const broken = {
      open: () => { throw new Error('boom') }
    } as unknown as IDBFactory

    const result = await initPersistentStorage(KEYS, broken)

    expect(result.backend).toBe('localStorage')
    expect(ls.get('ai-chat-user')).toBe('local')
    expect(getPreloadedItem('ai-chat-user')).toBe('local')
  })

  it('已經用過 IndexedDB 的瀏覽器，開啟失敗時應拋錯，不可用空資料啟動', async () => {
    const ls = installLocalStorage({ 'ai-chat-user': 'local' })
    await initPersistentStorage(KEYS, factory)
    expect(ls.has('ai-chat-user')).toBe(false)

    const broken = {
      open: () => { throw new Error('boom') }
    } as unknown as IDBFactory
    await expect(initPersistentStorage(KEYS, broken)).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  it('IndexedDB 開啟沒有回應時應逾時，並依是否用過 IndexedDB 決定退回或拋錯', async () => {
    const hanging = {
      open: () => ({}) // 永遠不會觸發 success / error
    } as unknown as IDBFactory

    // 沒用過 IndexedDB：退回 localStorage
    installLocalStorage({ 'ai-chat-user': 'local' })
    const result = await initPersistentStorage(KEYS, hanging, 20)
    expect(result.backend).toBe('localStorage')
    expect(getPreloadedItem('ai-chat-user')).toBe('local')

    // 用過 IndexedDB、資料都在 IndexedDB 裡：拋錯
    installLocalStorage()
    await initPersistentStorage(KEYS, factory)
    await expect(initPersistentStorage(KEYS, hanging, 20)).rejects.toBeInstanceOf(StorageUnavailableError)
  })
})

describe('預先讀取的資料', () => {
  it('每個 key 只能取一次，取完就從記憶體移除', async () => {
    installLocalStorage({ 'ai-chat-user': 'data' })
    await initPersistentStorage(KEYS, new IDBFactory())

    expect(getPreloadedItem('ai-chat-user')).toBe('data')
    expect(getPreloadedItem('ai-chat-user')).toBeNull()
    // 資料仍在儲存空間裡
    expect(await readItem('ai-chat-user')).toBe('data')
  })

  it('取走預先讀取的資料後，容量統計仍正確', async () => {
    installLocalStorage({ 'ai-chat-user': 'abcd' })
    await initPersistentStorage(KEYS, new IDBFactory())
    getPreloadedItem('ai-chat-user')

    let usage = await getStorageUsage(KEYS)
    expect(usage.items.find(i => i.key === 'ai-chat-user')?.chars).toBe('ai-chat-user'.length + 4)

    await writeItem('ai-chat-rooms', '123456')
    usage = await getStorageUsage(KEYS)
    expect(usage.items.find(i => i.key === 'ai-chat-rooms')?.chars).toBe('ai-chat-rooms'.length + 6)
  })
})
