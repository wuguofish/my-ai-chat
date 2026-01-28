/**
 * 資料混淆工具
 *
 * 用於將敏感資料進行輕度混淆編碼，防止被輕易閱讀
 * 注意：這不是加密！只是增加閱讀難度，防止 casual user
 *
 * 編碼流程：JSON → Base64 → 字元替換 → 加版本前綴
 */

// 版本前綴，用於識別編碼格式和未來升級
const VERSION_PREFIX = 'AICHAT_V1:'

// 字元替換表（讓 Base64 結果看起來不像標準 Base64）
// 標準 Base64 字元：A-Z a-z 0-9 + / =
// 替換後的結果會混入一些其他字元，增加混淆效果
const CHAR_MAP: Record<string, string> = {
  'A': '7', 'B': 'K', 'C': '2', 'D': 'X', 'E': 'P',
  'F': '9', 'G': 'L', 'H': '3', 'I': 'Y', 'J': 'Q',
  'K': 'A', 'L': 'M', 'M': '4', 'N': 'Z', 'O': 'R',
  'P': 'B', 'Q': 'N', 'R': '5', 'S': 'W', 'T': 'S',
  'U': 'C', 'V': 'O', 'W': '6', 'X': 'D', 'Y': 'T',
  'Z': 'E', 'a': 'p', 'b': 'k', 'c': 'r', 'd': 'x',
  'e': 'j', 'f': 'q', 'g': 'l', 'h': 's', 'i': 'y',
  'j': 'a', 'k': 'm', 'l': 't', 'm': 'z', 'n': 'b',
  'o': 'n', 'p': 'u', 'q': 'o', 'r': 'v', 's': 'w',
  't': 'c', 'u': 'g', 'v': 'f', 'w': 'd', 'x': 'e',
  'y': 'h', 'z': 'i', '0': 'H', '1': 'J', '2': 'F',
  '3': 'I', '4': 'G', '5': 'U', '6': 'V', '7': '0',
  '8': '1', '9': '8', '+': '_', '/': '-', '=': '~'
}

// 反向替換表
const REVERSE_CHAR_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(CHAR_MAP).map(([k, v]) => [v, k])
)

/**
 * 將字串進行字元替換
 */
function substituteChars(str: string, map: Record<string, string>): string {
  return str.split('').map(char => map[char] ?? char).join('')
}

/**
 * 將資料編碼（混淆）
 * @param data 任何可 JSON 序列化的資料
 * @returns 混淆後的字串
 */
export function obfuscate(data: unknown): string {
  try {
    // 1. JSON 序列化
    const json = JSON.stringify(data)

    // 2. Base64 編碼
    const base64 = btoa(unescape(encodeURIComponent(json)))

    // 3. 字元替換
    const substituted = substituteChars(base64, CHAR_MAP)

    // 4. 加上版本前綴
    return VERSION_PREFIX + substituted
  } catch (error) {
    console.error('資料混淆失敗:', error)
    throw new Error('資料混淆失敗')
  }
}

/**
 * 將混淆的資料解碼
 * @param encoded 混淆後的字串
 * @returns 原始資料
 */
export function deobfuscate(encoded: string): unknown {
  try {
    // 1. 檢查並移除版本前綴
    if (!encoded.startsWith(VERSION_PREFIX)) {
      throw new Error('無效的編碼格式')
    }
    const withoutPrefix = encoded.slice(VERSION_PREFIX.length)

    // 2. 字元還原
    const base64 = substituteChars(withoutPrefix, REVERSE_CHAR_MAP)

    // 3. Base64 解碼
    const json = decodeURIComponent(escape(atob(base64)))

    // 4. JSON 解析
    return JSON.parse(json)
  } catch (error) {
    console.error('資料解碼失敗:', error)
    throw new Error('資料解碼失敗')
  }
}

/**
 * 檢測資料是否已經過混淆編碼
 * @param data 要檢測的資料
 * @returns 是否為混淆編碼的資料
 */
export function isObfuscated(data: unknown): boolean {
  if (typeof data !== 'string') return false
  return data.startsWith(VERSION_PREFIX)
}

/**
 * 智慧解碼：自動判斷是明文還是編碼，返回解碼後的資料
 * 用於向下相容舊版明文資料
 * @param data 可能是明文 JSON 字串或混淆編碼的字串
 * @returns 解碼後的資料
 */
export function smartDecode(data: string): unknown {
  // 如果是混淆編碼，進行解碼
  if (isObfuscated(data)) {
    return deobfuscate(data)
  }

  // 否則嘗試作為 JSON 解析（向下相容舊版明文資料）
  try {
    return JSON.parse(data)
  } catch {
    throw new Error('無法解析資料：既不是有效的編碼格式，也不是有效的 JSON')
  }
}

/**
 * 建立 Pinia persist 用的 serializer
 * 會自動處理向下相容（舊明文資料可以正常讀取）
 */
export const obfuscatedSerializer = {
  serialize: (state: unknown): string => {
    return obfuscate(state)
  },
  deserialize: (value: string): Record<string, unknown> => {
    const result = smartDecode(value)
    // 確保返回的是物件（Pinia StateTree 需要）
    if (typeof result === 'object' && result !== null) {
      return result as Record<string, unknown>
    }
    // 如果不是物件，包裝成物件
    return { value: result }
  }
}

/**
 * 匯出/備份用的編碼函數
 * 將整個備份物件編碼
 */
export function encodeBackupData(data: Record<string, unknown>): string {
  return obfuscate(data)
}

/**
 * 匯入/還原用的解碼函數
 * 自動處理向下相容（可以讀取舊版明文備份）
 */
export function decodeBackupData(encoded: string): Record<string, unknown> {
  const result = smartDecode(encoded)
  // 檢查是否為物件（排除 null 和陣列）
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new Error('備份資料格式錯誤')
  }
  return result as Record<string, unknown>
}

// ============================================
// LocalStorage 遷移功能
// ============================================

// 需要遷移的 LocalStorage keys
const STORAGE_KEYS_TO_MIGRATE = [
  'ai-chat-characters',
  'ai-chat-user',
  'ai-chat-rooms',
  'ai-chat-memories',
  'ai-chat-feed',
  'ai-chat-relationships',  // 新 key（之前可能是 'relationships'）
  'relationships'           // 舊 key
] as const

/**
 * 檢查 LocalStorage 值是否為舊版明文 JSON 格式
 */
function isLegacyFormat(value: string | null): boolean {
  if (!value) return false
  // 如果已經是編碼格式，不需要遷移
  if (isObfuscated(value)) return false
  // 嘗試解析為 JSON，如果成功則是舊版明文格式
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

/**
 * 遷移單一 LocalStorage key 從舊格式到新格式
 * @returns 是否成功遷移
 */
function migrateStorageKey(key: string): boolean {
  try {
    const value = localStorage.getItem(key)
    if (!isLegacyFormat(value)) {
      return false // 不需要遷移
    }

    // 解析舊資料
    const data = JSON.parse(value!)

    // 編碼並存回
    const encoded = obfuscate(data)
    localStorage.setItem(key, encoded)

    console.log(`✅ 已遷移 LocalStorage key: ${key}`)
    return true
  } catch (error) {
    console.error(`❌ 遷移 LocalStorage key 失敗: ${key}`, error)
    return false
  }
}

/**
 * 遷移所有 LocalStorage 舊格式資料到新編碼格式
 * 應在應用啟動時呼叫（Pinia 初始化之前）
 *
 * @returns 遷移結果統計
 */
export function migrateLocalStorage(): { migrated: number; skipped: number; failed: number } {
  const result = { migrated: 0, skipped: 0, failed: 0 }

  console.log('🔄 開始檢查 LocalStorage 資料格式...')

  for (const key of STORAGE_KEYS_TO_MIGRATE) {
    const value = localStorage.getItem(key)

    if (!value) {
      // key 不存在，跳過
      continue
    }

    if (isObfuscated(value)) {
      // 已經是新格式，跳過
      result.skipped++
      continue
    }

    // 嘗試遷移
    if (migrateStorageKey(key)) {
      result.migrated++
    } else {
      result.failed++
    }
  }

  // 處理舊的 'relationships' key 遷移到新的 'ai-chat-relationships'
  const oldRelationshipsKey = 'relationships'
  const newRelationshipsKey = 'ai-chat-relationships'
  const oldRelationshipsValue = localStorage.getItem(oldRelationshipsKey)

  if (oldRelationshipsValue && !localStorage.getItem(newRelationshipsKey)) {
    // 舊 key 存在但新 key 不存在，進行遷移
    try {
      const data = isObfuscated(oldRelationshipsValue)
        ? deobfuscate(oldRelationshipsValue)
        : JSON.parse(oldRelationshipsValue)

      const encoded = obfuscate(data)
      localStorage.setItem(newRelationshipsKey, encoded)
      localStorage.removeItem(oldRelationshipsKey)
      console.log(`✅ 已將 '${oldRelationshipsKey}' 遷移到 '${newRelationshipsKey}' 並移除舊 key`)
      result.migrated++
    } catch (error) {
      console.error(`❌ 遷移 relationships key 失敗:`, error)
      result.failed++
    }
  } else if (oldRelationshipsValue && localStorage.getItem(newRelationshipsKey)) {
    // 兩個 key 都存在，移除舊的
    localStorage.removeItem(oldRelationshipsKey)
    console.log(`🗑️ 已移除舊的 '${oldRelationshipsKey}' key（新 key 已存在）`)
  }

  if (result.migrated > 0) {
    console.log(`✅ LocalStorage 遷移完成：${result.migrated} 個 key 已遷移`)
  } else {
    console.log('ℹ️ LocalStorage 不需要遷移（已是新格式或無資料）')
  }

  return result
}
