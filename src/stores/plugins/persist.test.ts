import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { createApp, ref, nextTick } from 'vue'
import { persistPlugin, flushPersistedStores } from './persist'
import { initPersistentStorage, readItem } from '@/utils/persistentStorage'
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
    expect(isObfuscated(await readItem('test-secret'))).toBe(true)
    expect(JSON.parse((await readItem('test-plain'))!)).toEqual({ count: 3 })

    // 模擬重新開啟 App
    await initPersistentStorage(KEYS, factory)
    freshPinia()
    expect(useSecretStore().items).toEqual(['x'])
    expect(usePlainStore().count).toBe(3)
    expect(smartDecode((await readItem('test-secret'))!)).toEqual({ items: ['x'] })
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
