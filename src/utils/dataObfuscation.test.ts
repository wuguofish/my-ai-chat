import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  obfuscate,
  deobfuscate,
  isObfuscated,
  smartDecode,
  obfuscatedSerializer,
  encodeBackupData,
  decodeBackupData,
  migrateLocalStorage
} from './dataObfuscation'

describe('dataObfuscation', () => {
  describe('obfuscate / deobfuscate', () => {
    it('應該能正確編碼和解碼簡單字串', () => {
      const original = { name: 'test', value: 123 }
      const encoded = obfuscate(original)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(original)
    })

    it('應該能正確編碼和解碼中文字串', () => {
      const original = {
        name: '測試角色',
        personality: '溫柔、善良、有點傲嬌',
        speakingStyle: '會用「呢」、「喔」等語助詞'
      }
      const encoded = obfuscate(original)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(original)
    })

    it('應該能正確編碼和解碼複雜巢狀物件', () => {
      const original = {
        user: {
          id: 'user-123',
          profile: {
            nickname: '阿童',
            age: 25
          }
        },
        characters: [
          { id: '1', name: '角色A', personality: '開朗' },
          { id: '2', name: '角色B', personality: '內向' }
        ],
        settings: {
          theme: 'dark',
          notifications: true
        }
      }
      const encoded = obfuscate(original)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(original)
    })

    it('應該能正確編碼和解碼包含特殊字元的資料', () => {
      const original = {
        content: '這是一段包含 emoji 😀🎉 和特殊字元 <>&"\' 的文字',
        code: 'function test() { return "hello"; }',
        unicode: '日本語テスト한국어'
      }
      const encoded = obfuscate(original)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(original)
    })

    it('應該能正確編碼和解碼陣列', () => {
      const original = [1, 2, 3, 'a', 'b', { nested: true }]
      const encoded = obfuscate(original)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(original)
    })

    it('應該能正確編碼和解碼空物件', () => {
      const original = {}
      const encoded = obfuscate(original)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(original)
    })

    it('應該能正確編碼和解碼 null 值', () => {
      const original = { value: null, nested: { also: null } }
      const encoded = obfuscate(original)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(original)
    })

    it('編碼後的結果應該以版本前綴開頭', () => {
      const encoded = obfuscate({ test: true })
      expect(encoded.startsWith('AICHAT_V1:')).toBe(true)
    })

    it('編碼後的結果不應該包含明文', () => {
      const original = {
        secretPersonality: '這是一個非常機密的角色設定',
        speakingStyle: '說話風格是很特別的'
      }
      const encoded = obfuscate(original)

      expect(encoded).not.toContain('secretPersonality')
      expect(encoded).not.toContain('這是一個非常機密的角色設定')
      expect(encoded).not.toContain('speakingStyle')
      expect(encoded).not.toContain('說話風格是很特別的')
    })

    it('解碼無效格式應該拋出錯誤', () => {
      expect(() => deobfuscate('invalid-data')).toThrow()
      expect(() => deobfuscate('AICHAT_V1:invalid')).toThrow()
    })
  })

  describe('isObfuscated', () => {
    it('應該正確識別編碼過的資料', () => {
      const encoded = obfuscate({ test: true })
      expect(isObfuscated(encoded)).toBe(true)
    })

    it('應該正確識別未編碼的 JSON 字串', () => {
      const json = JSON.stringify({ test: true })
      expect(isObfuscated(json)).toBe(false)
    })

    it('應該正確處理非字串輸入', () => {
      expect(isObfuscated(null)).toBe(false)
      expect(isObfuscated(undefined)).toBe(false)
      expect(isObfuscated(123)).toBe(false)
      expect(isObfuscated({ test: true })).toBe(false)
      expect(isObfuscated(['array'])).toBe(false)
    })

    it('應該正確處理空字串', () => {
      expect(isObfuscated('')).toBe(false)
    })

    it('應該正確處理類似但非有效前綴的字串', () => {
      expect(isObfuscated('AICHAT_V2:something')).toBe(false)
      expect(isObfuscated('AICHAT_V1')).toBe(false) // 缺少冒號
      expect(isObfuscated('aichat_v1:lowercase')).toBe(false) // 小寫
    })
  })

  describe('smartDecode', () => {
    it('應該能解碼編碼過的資料', () => {
      const original = { name: '測試' }
      const encoded = obfuscate(original)
      const decoded = smartDecode(encoded)

      expect(decoded).toEqual(original)
    })

    it('應該能解析舊版明文 JSON', () => {
      const original = { name: '測試', legacy: true }
      const json = JSON.stringify(original)
      const decoded = smartDecode(json)

      expect(decoded).toEqual(original)
    })

    it('應該在無法解析時拋出錯誤', () => {
      expect(() => smartDecode('not-valid-json-or-encoded')).toThrow()
    })
  })

  describe('obfuscatedSerializer', () => {
    it('serialize 應該產生編碼字串', () => {
      const state = { characters: [], user: null }
      const serialized = obfuscatedSerializer.serialize(state)

      expect(typeof serialized).toBe('string')
      expect(isObfuscated(serialized)).toBe(true)
    })

    it('deserialize 應該能解碼編碼字串', () => {
      const original = { characters: [{ id: '1', name: '測試' }] }
      const serialized = obfuscatedSerializer.serialize(original)
      const deserialized = obfuscatedSerializer.deserialize(serialized)

      expect(deserialized).toEqual(original)
    })

    it('deserialize 應該能解析舊版明文 JSON（向下相容）', () => {
      const original = { characters: [], legacyData: true }
      const legacyJson = JSON.stringify(original)
      const deserialized = obfuscatedSerializer.deserialize(legacyJson)

      expect(deserialized).toEqual(original)
    })

    it('serialize 和 deserialize 應該可以來回轉換', () => {
      const original = {
        characters: [
          { id: '1', name: '角色A', personality: '開朗活潑' },
          { id: '2', name: '角色B', personality: '沉穩內斂' }
        ],
        settings: { theme: 'dark' }
      }

      const serialized = obfuscatedSerializer.serialize(original)
      const deserialized = obfuscatedSerializer.deserialize(serialized)

      expect(deserialized).toEqual(original)
    })
  })

  describe('encodeBackupData / decodeBackupData', () => {
    it('應該能正確編碼和解碼備份資料', () => {
      const backupData = {
        user: { nickname: '測試使用者' },
        characters: [{ id: '1', name: '角色' }],
        chatRooms: [],
        memories: {}
      }

      const encoded = encodeBackupData(backupData)
      const decoded = decodeBackupData(encoded)

      expect(decoded).toEqual(backupData)
    })

    it('decodeBackupData 應該支援舊版明文 JSON', () => {
      const backupData = {
        user: { nickname: '舊版使用者' },
        characters: [],
        legacy: true
      }
      const legacyJson = JSON.stringify(backupData)
      const decoded = decodeBackupData(legacyJson)

      expect(decoded).toEqual(backupData)
    })

    it('decodeBackupData 應該在非物件資料時拋出錯誤', () => {
      const encodedArray = obfuscate([1, 2, 3])
      expect(() => decodeBackupData(encodedArray)).toThrow('備份資料格式錯誤')

      const encodedString = obfuscate('just a string')
      expect(() => decodeBackupData(encodedString)).toThrow('備份資料格式錯誤')
    })
  })

  describe('migrateLocalStorage', () => {
    // Mock localStorage
    let mockStorage: Record<string, string> = {}

    beforeEach(() => {
      mockStorage = {}

      // Mock localStorage
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, value: string) => { mockStorage[key] = value },
        removeItem: (key: string) => { delete mockStorage[key] },
        clear: () => { mockStorage = {} }
      })

      // Suppress console logs during tests
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('應該遷移舊版明文 JSON 到編碼格式', () => {
      const legacyData = { characters: [{ id: '1', name: '測試' }] }
      mockStorage['ai-chat-characters'] = JSON.stringify(legacyData)

      const result = migrateLocalStorage()

      expect(result.migrated).toBeGreaterThan(0)
      expect(isObfuscated(mockStorage['ai-chat-characters'])).toBe(true)

      // 驗證資料完整性
      const decoded = deobfuscate(mockStorage['ai-chat-characters'])
      expect(decoded).toEqual(legacyData)
    })

    it('應該跳過已經編碼的資料', () => {
      const data = { characters: [] }
      const encoded = obfuscate(data)
      mockStorage['ai-chat-characters'] = encoded

      const result = migrateLocalStorage()

      expect(result.skipped).toBeGreaterThan(0)
      expect(result.migrated).toBe(0)
      // 資料應該保持不變
      expect(mockStorage['ai-chat-characters']).toBe(encoded)
    })

    it('應該將舊的 relationships key 遷移到新 key', () => {
      const relationshipData = {
        userToCharacter: [{ id: '1', affection: 50 }],
        characterToCharacter: []
      }
      mockStorage['relationships'] = JSON.stringify(relationshipData)

      migrateLocalStorage()

      // 舊 key 應該被移除
      expect(mockStorage['relationships']).toBeUndefined()
      // 新 key 應該存在且已編碼
      expect(mockStorage['ai-chat-relationships']).toBeDefined()
      expect(isObfuscated(mockStorage['ai-chat-relationships'])).toBe(true)

      // 驗證資料完整性
      const decoded = deobfuscate(mockStorage['ai-chat-relationships'])
      expect(decoded).toEqual(relationshipData)
    })

    it('當新舊 key 都存在時，應該移除舊 key 保留新 key', () => {
      const oldData = { old: true }
      const newData = { new: true }
      mockStorage['relationships'] = JSON.stringify(oldData)
      mockStorage['ai-chat-relationships'] = obfuscate(newData)

      migrateLocalStorage()

      // 舊 key 應該被移除
      expect(mockStorage['relationships']).toBeUndefined()
      // 新 key 應該保持不變
      const decoded = deobfuscate(mockStorage['ai-chat-relationships'])
      expect(decoded).toEqual(newData)
    })

    it('應該處理空的 localStorage', () => {
      const result = migrateLocalStorage()

      expect(result.migrated).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.failed).toBe(0)
    })

    it('應該遷移多個 keys', () => {
      mockStorage['ai-chat-characters'] = JSON.stringify({ characters: [] })
      mockStorage['ai-chat-user'] = JSON.stringify({ nickname: '測試' })
      mockStorage['ai-chat-rooms'] = JSON.stringify({ rooms: [] })

      const result = migrateLocalStorage()

      expect(result.migrated).toBe(3)

      // 驗證所有都已編碼
      expect(isObfuscated(mockStorage['ai-chat-characters'])).toBe(true)
      expect(isObfuscated(mockStorage['ai-chat-user'])).toBe(true)
      expect(isObfuscated(mockStorage['ai-chat-rooms'])).toBe(true)
    })
  })

  describe('字元替換一致性', () => {
    it('多次編碼相同資料應該產生相同結果', () => {
      const data = { test: '一致性測試' }
      const encoded1 = obfuscate(data)
      const encoded2 = obfuscate(data)

      expect(encoded1).toBe(encoded2)
    })

    it('不同資料應該產生不同編碼結果', () => {
      const data1 = { test: 'A' }
      const data2 = { test: 'B' }
      const encoded1 = obfuscate(data1)
      const encoded2 = obfuscate(data2)

      expect(encoded1).not.toBe(encoded2)
    })
  })

  describe('邊界情況', () => {
    it('應該能處理非常長的字串', () => {
      const longString = 'a'.repeat(100000)
      const original = { content: longString }
      const encoded = obfuscate(original)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(original)
    })

    it('應該能處理深度巢狀的物件', () => {
      const deepNested: Record<string, unknown> = { level: 0 }
      let current = deepNested
      for (let i = 1; i <= 50; i++) {
        current.nested = { level: i }
        current = current.nested as Record<string, unknown>
      }

      const encoded = obfuscate(deepNested)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(deepNested)
    })

    it('應該能處理 boolean 值', () => {
      const original = { active: true, disabled: false }
      const encoded = obfuscate(original)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(original)
    })

    it('應該能處理數字（包含負數和小數）', () => {
      const original = {
        positive: 42,
        negative: -17,
        decimal: 3.14159,
        zero: 0,
        large: 999999999999
      }
      const encoded = obfuscate(original)
      const decoded = deobfuscate(encoded)

      expect(decoded).toEqual(original)
    })
  })
})
