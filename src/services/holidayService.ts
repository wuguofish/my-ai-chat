/**
 * 台灣假日 API 服務
 * 資料來源：https://github.com/doggy8088/holidaybook
 *
 * 用於判斷今天是「上班日」還是「放假日」
 * 包含國定假日、補班日的正確判斷
 */

// API Base URL（GitHub Pages 靜態 JSON）
const API_BASE_URL = 'https://holiday.gh.miniasp.com'

// 快取 key
const CACHE_KEY = 'holiday-cache'

interface HolidayData {
  date: string
  isHoliday: number  // 0: 上班日, 1: 放假日
  name?: string      // 假日名稱（如：農曆新年）
}

interface HolidayCache {
  date: string       // 快取的日期 (YYYY-MM-DD)
  isHoliday: boolean
  fetchedAt: number  // 快取時間戳
}

/**
 * 取得今天的日期字串 (YYYY-MM-DD)
 */
function getTodayString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 從 LocalStorage 取得快取
 */
function getCache(): HolidayCache | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    return JSON.parse(cached) as HolidayCache
  } catch {
    return null
  }
}

/**
 * 儲存快取到 LocalStorage
 */
function setCache(data: HolidayCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (error) {
    console.warn('無法儲存假日快取:', error)
  }
}

/**
 * 從 API 取得指定日期是否為假日
 */
async function fetchHolidayFromAPI(dateString: string): Promise<boolean> {
  try {
    const url = `${API_BASE_URL}/${dateString}.json`
    const response = await fetch(url)

    if (!response.ok) {
      console.warn(`假日 API 回應異常: ${response.status}`)
      // API 失敗時，fallback 到週末判斷
      return isWeekend(new Date(dateString))
    }

    const data: HolidayData = await response.json()
    return data.isHoliday === 1
  } catch (error) {
    console.warn('假日 API 請求失敗:', error)
    // 網路錯誤時，fallback 到週末判斷
    return isWeekend(new Date(dateString))
  }
}

/**
 * 簡單的週末判斷（作為 fallback）
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6  // 週日 = 0, 週六 = 6
}

/**
 * 檢查今天是否為假日（主要 API）
 *
 * 判斷流程：
 * 1. 檢查快取是否有效（當天的快取）
 * 2. 如果快取有效，直接回傳快取結果
 * 3. 如果快取無效，呼叫 API 取得結果並更新快取
 * 4. API 失敗時，fallback 到週末判斷
 *
 * @returns Promise<boolean> true = 今天是假日, false = 今天是上班日
 */
export async function isTodayHoliday(): Promise<boolean> {
  const today = getTodayString()

  // 檢查快取
  const cache = getCache()
  if (cache && cache.date === today) {
    console.log(`📅 使用快取的假日資料: ${today} -> ${cache.isHoliday ? '假日' : '上班日'}`)
    return cache.isHoliday
  }

  // 快取無效，呼叫 API
  console.log(`📅 從 API 取得假日資料: ${today}`)
  const isHoliday = await fetchHolidayFromAPI(today)

  // 更新快取
  setCache({
    date: today,
    isHoliday,
    fetchedAt: Date.now()
  })

  console.log(`📅 今天 (${today}) 是${isHoliday ? '假日' : '上班日'}`)
  return isHoliday
}

/**
 * 檢查指定日期是否為假日
 * 注意：此 API 會呼叫網路請求，建議只在需要時使用
 *
 * @param date 要檢查的日期
 * @returns Promise<boolean> true = 假日, false = 上班日
 */
export async function isDateHoliday(date: Date): Promise<boolean> {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const dateString = `${year}-${month}-${day}`

  // 如果是今天，使用快取機制
  if (dateString === getTodayString()) {
    return isTodayHoliday()
  }

  // 其他日期直接呼叫 API
  return fetchHolidayFromAPI(dateString)
}

/**
 * 清除假日快取
 * 用於測試或強制重新取得資料
 */
export function clearHolidayCache(): void {
  localStorage.removeItem(CACHE_KEY)
  console.log('📅 已清除假日快取')
}

/**
 * 預熱假日快取
 * 建議在應用程式啟動時呼叫，確保假日資料已載入
 */
export async function warmupHolidayCache(): Promise<void> {
  await isTodayHoliday()
}
