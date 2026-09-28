import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { initPersistentStorage, getPreloadedItem, writeItem, getStorageBackendName } from './persistentStorage'

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

    const result = await initPersistentStorage(KEYS, null)

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
})
