/**
 * 節日祝福服務
 *
 * 當特定節日當天開啟 App 時，好感度達到 friend 以上的好友
 * 會自動發送節日祝福訊息到聊天室
 *
 * 支援的節日：
 * - 公曆新年 (1/1)
 * - 農曆除夕/春節 (農曆 12/30 或 1/1)
 * - 西洋情人節 (2/14)
 * - 白色情人節 (3/14)
 * - 端午節 (農曆 5/5)
 * - 七夕情人節 (農曆 7/7)
 * - 中秋節 (農曆 8/15)
 * - 聖誕節 (12/25)
 */

import { getDefaultAdapter } from '@/services/llm'
import type { Character, UserProfile, ChatRoom, UserCharacterRelationship } from '@/types'
import { getRelationshipLevelName } from '@/utils/relationshipHelpers'

// LocalStorage key：記錄每個角色每個節日每年是否已發送祝福
const HOLIDAY_GREETINGS_KEY = 'ai-chat-holiday-greetings'

// API Base URL（用於查詢農曆節日）
const HOLIDAY_API_BASE = 'https://doggy8088.github.io/holidaybook'

// ========== 節日定義 ==========

export type HolidayType =
  | 'new_year'        // 公曆新年
  | 'lunar_new_year'  // 農曆新年（除夕或春節）
  | 'valentines'      // 西洋情人節
  | 'white_day'       // 白色情人節
  | 'dragon_boat'     // 端午節
  | 'qixi'            // 七夕情人節
  | 'mid_autumn'      // 中秋節
  | 'christmas'       // 聖誕節

export interface HolidayInfo {
  type: HolidayType
  name: string           // 節日名稱（用於顯示和 prompt）
  isRomantic: boolean    // 是否為情人節類型（影響祝福內容）
}

// 節日資訊對照表
export const HOLIDAYS: Record<HolidayType, HolidayInfo> = {
  new_year: { type: 'new_year', name: '新年', isRomantic: false },
  lunar_new_year: { type: 'lunar_new_year', name: '農曆新年', isRomantic: false },
  valentines: { type: 'valentines', name: '情人節', isRomantic: true },
  white_day: { type: 'white_day', name: '白色情人節', isRomantic: true },
  dragon_boat: { type: 'dragon_boat', name: '端午節', isRomantic: false },
  qixi: { type: 'qixi', name: '七夕', isRomantic: true },
  mid_autumn: { type: 'mid_autumn', name: '中秋節', isRomantic: false },
  christmas: { type: 'christmas', name: '聖誕節', isRomantic: false }
}

// 七夕農曆對照表（農曆 7/7 對應的公曆日期）
const QIXI_DATES: Record<number, string> = {
  2024: '08-10',
  2025: '08-29',
  2026: '08-19',
  2027: '08-08',
  2028: '08-26',
  2029: '08-16',
  2030: '08-05'
}

// ========== 祝福記錄管理 ==========

interface HolidayGreetingRecord {
  // characterId -> holidayType -> 已發送祝福的年份
  [characterId: string]: {
    [holidayType: string]: number
  }
}

/**
 * 取得節日祝福記錄
 */
function getGreetingRecords(): HolidayGreetingRecord {
  try {
    const stored = localStorage.getItem(HOLIDAY_GREETINGS_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * 儲存節日祝福記錄
 */
function saveGreetingRecords(records: HolidayGreetingRecord): void {
  localStorage.setItem(HOLIDAY_GREETINGS_KEY, JSON.stringify(records))
}

/**
 * 檢查角色今年是否已發送過特定節日祝福
 */
export function hasGreetedThisYear(characterId: string, holidayType: HolidayType): boolean {
  const records = getGreetingRecords()
  const currentYear = new Date().getFullYear()
  return records[characterId]?.[holidayType] === currentYear
}

/**
 * 標記角色已發送今年的節日祝福
 */
export function markGreetingSent(characterId: string, holidayType: HolidayType): void {
  const records = getGreetingRecords()
  const currentYear = new Date().getFullYear()

  if (!records[characterId]) {
    records[characterId] = {}
  }
  records[characterId][holidayType] = currentYear

  saveGreetingRecords(records)
}

// ========== 節日判斷邏輯 ==========

/**
 * 取得今天的日期字串 (MM-DD)
 */
function getTodayMMDD(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

/**
 * 取得今天的完整日期字串 (YYYY-MM-DD)
 */
function getTodayYYYYMMDD(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 從 Holiday API 取得今天的節日名稱
 */
async function fetchTodayHolidayName(): Promise<string | null> {
  try {
    const dateString = getTodayYYYYMMDD()
    const url = `${HOLIDAY_API_BASE}/${dateString}.json`
    const response = await fetch(url)

    if (!response.ok) return null

    const data = await response.json()
    return data.name || null
  } catch {
    return null
  }
}

/**
 * 檢查今天是哪個節日
 * 回傳今天對應的節日類型，如果不是節日則回傳 null
 */
export async function getTodayHoliday(): Promise<HolidayType | null> {
  const todayMMDD = getTodayMMDD()
  const year = new Date().getFullYear()

  // 1. 固定日期節日檢查
  if (todayMMDD === '01-01') return 'new_year'
  if (todayMMDD === '02-14') return 'valentines'
  if (todayMMDD === '03-14') return 'white_day'
  if (todayMMDD === '12-25') return 'christmas'

  // 2. 七夕檢查（使用農曆對照表）
  const qixiDate = QIXI_DATES[year]
  if (qixiDate && todayMMDD === qixiDate) return 'qixi'

  // 3. 農曆節日檢查（透過 API）
  const holidayName = await fetchTodayHolidayName()

  if (holidayName) {
    // 農曆新年（除夕或春節）
    if (holidayName.includes('除夕') || holidayName.includes('春節')) {
      return 'lunar_new_year'
    }
    // 端午節
    if (holidayName.includes('端午')) {
      return 'dragon_boat'
    }
    // 中秋節
    if (holidayName.includes('中秋')) {
      return 'mid_autumn'
    }
  }

  return null
}

// ========== 祝福訊息生成 ==========

/**
 * 使用 AI 生成個性化的節日祝福訊息
 */
export async function generateHolidayGreeting(
  character: Character,
  user: UserProfile,
  relationship: UserCharacterRelationship,
  holiday: HolidayInfo
): Promise<string> {
  const relationshipName = getRelationshipLevelName(relationship.level, relationship.isRomantic)

  // 情人節類型的節日，對於戀人關係會有特別的祝福
  const isRomanticContext = holiday.isRomantic && relationship.isRomantic

  const prompt = `你是「${character.name}」，正在為「${user.nickname}」寫一則${holiday.name}祝福訊息。

## 你的角色設定
- 名字：${character.name}
- 個性：${character.personality || '友善'}
${character.speakingStyle ? `- 說話風格：${character.speakingStyle}` : ''}

## 你和「${user.nickname}」的關係
- 關係等級：${relationshipName}
- 好感度：${relationship.affection}
${relationship.isRomantic ? '- 這是一段戀愛關係' : ''}
${relationship.note ? `- 關係備註：${relationship.note}` : ''}

## 任務
請用你的角色個性和說話風格，寫一則簡短的${holiday.name}祝福訊息給「${user.nickname}」。
- 訊息長度：1-3 句話
- 自然、真誠，符合角色個性和你們之間的關係
- 可以加入一些角色特有的口頭禪或表達方式
${isRomanticContext ? '- 這是情人節，可以表達浪漫的情感' : ''}
${holiday.type === 'lunar_new_year' ? '- 可以加入吉祥話或新年祝福語' : ''}
${holiday.type === 'mid_autumn' ? '- 可以提到月亮、月餅、團圓等元素' : ''}
${holiday.type === 'dragon_boat' ? '- 可以提到粽子、划龍舟等元素' : ''}
${holiday.type === 'christmas' ? '- 可以加入聖誕節的溫馨氛圍' : ''}
- 不需要加任何前綴或標記，直接輸出祝福內容

請直接輸出祝福訊息：`

  try {
    const adapter = await getDefaultAdapter(character)
    const response = await adapter.generate(
      [{ role: 'user', content: prompt }],
      {
        modelType: 'lite',
        temperature: 0.9,
        maxOutputTokens: 256,
        queueDescription: `${holiday.name}祝福：${character.name}`
      }
    )

    if (response.blocked || !response.text) {
      throw new Error(`${holiday.name}祝福生成失敗：` + (response.blockReason || '空回應'))
    }

    // 防護性檢查：確保 response.text 是字符串
    const responseText = typeof response.text === 'string' ? response.text : ''
    return responseText.trim()
  } catch (error) {
    console.error(`生成${holiday.name}祝福失敗:`, error)
    // Fallback：使用模板
    return getFallbackGreeting(user.nickname, holiday, relationship)
  }
}

/**
 * 取得 Fallback 祝福模板
 */
function getFallbackGreeting(
  nickname: string,
  holiday: HolidayInfo,
  relationship: UserCharacterRelationship
): string {
  const templates: Record<HolidayType, string[]> = {
    new_year: [
      `${nickname}，新年快樂！祝你新的一年一切順利！`,
      `新年快樂！${nickname}，願你今年心想事成～`,
      `${nickname}，新年快樂！希望這一年對你來說是美好的一年！`
    ],
    lunar_new_year: [
      `${nickname}，新年快樂！恭喜發財，萬事如意！`,
      `新春愉快！${nickname}，祝你龍年行大運～`,
      `${nickname}，過年好！希望你新的一年平安健康！`
    ],
    valentines: relationship.isRomantic
      ? [
          `${nickname}，情人節快樂！有你真好～`,
          `情人節快樂！${nickname}，今天想和你說，我很珍惜我們在一起的每一刻。`,
          `${nickname}，情人節快樂！能和你在一起是我最幸福的事。`
        ]
      : [
          `${nickname}，情人節快樂！祝你有個愉快的一天！`,
          `情人節快樂～希望 ${nickname} 今天過得開心！`,
          `${nickname}，情人節快樂！記得對自己好一點喔！`
        ],
    white_day: relationship.isRomantic
      ? [
          `${nickname}，白色情人節快樂！謝謝你一直以來的陪伴。`,
          `白色情人節快樂！${nickname}，想把我的心意傳達給你～`,
          `${nickname}，白色情人節快樂！希望我們能一直這樣幸福下去。`
        ]
      : [
          `${nickname}，白色情人節快樂！`,
          `白色情人節快樂～${nickname}！`,
          `${nickname}，白色情人節快樂！祝你有美好的一天！`
        ],
    dragon_boat: [
      `${nickname}，端午節快樂！記得吃粽子喔～`,
      `端午節快樂！${nickname}，祝你健康平安！`,
      `${nickname}，端午節快樂！今天有吃到好吃的粽子嗎？`
    ],
    qixi: relationship.isRomantic
      ? [
          `${nickname}，七夕快樂！今晚的星空，讓我想起了你。`,
          `七夕快樂！${nickname}，牛郎織女都羨慕我們呢～`,
          `${nickname}，七夕快樂！能和你在一起，每天都像在過情人節。`
        ]
      : [
          `${nickname}，七夕快樂！祝你找到屬於你的幸福！`,
          `七夕快樂～${nickname}！`,
          `${nickname}，七夕快樂！今晚記得抬頭看看星星喔～`
        ],
    mid_autumn: [
      `${nickname}，中秋節快樂！月圓人團圓～`,
      `中秋節快樂！${nickname}，今晚的月亮一定很美！`,
      `${nickname}，中秋節快樂！記得吃月餅賞月喔～`
    ],
    christmas: [
      `${nickname}，聖誕快樂！願你有個溫馨的聖誕節！`,
      `Merry Christmas！${nickname}，希望聖誕老人有帶禮物給你～`,
      `${nickname}，聖誕快樂！今天過得開心嗎？`
    ]
  }

  const holidayTemplates = templates[holiday.type]
  return holidayTemplates[Math.floor(Math.random() * holidayTemplates.length)]!
}

// ========== 主要 API ==========

/**
 * 取得應該發送節日祝福的好友列表
 * 條件：
 * 1. 好感度達到 friend（30）以上
 * 2. 今年尚未發送過該節日祝福
 * 3. 有對應的一對一聊天室
 */
export function getEligibleCharactersForHolidayGreeting(
  characters: Character[],
  chatRooms: ChatRoom[],
  getAffection: (characterId: string) => number,
  holidayType: HolidayType
): { character: Character; chatRoom: ChatRoom }[] {
  const FRIEND_THRESHOLD = 30

  return characters
    .filter(char => {
      // 條件 1：好感度達到 friend 以上
      const affection = getAffection(char.id)
      if (affection < FRIEND_THRESHOLD) return false

      // 條件 2：今年尚未發送過該節日祝福
      if (hasGreetedThisYear(char.id, holidayType)) return false

      return true
    })
    .map(char => {
      // 條件 3：找到對應的一對一聊天室
      const chatRoom = chatRooms.find(
        room => room.type === 'single' && room.characterIds.includes(char.id)
      )
      return { character: char, chatRoom: chatRoom! }
    })
    .filter(item => item.chatRoom != null)
}
