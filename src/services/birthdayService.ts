/**
 * 生日祝福服務
 *
 * 當使用者生日當天開啟 App 時，好感度達到 friend 以上的好友
 * 會自動發送生日祝福訊息到聊天室
 */

import { getDefaultAdapter } from '@/services/llm'
import type { Character, UserProfile, ChatRoom, UserCharacterRelationship } from '@/types'
import { getRelationshipLevelName } from '@/utils/relationshipHelpers'

// LocalStorage key：記錄每個角色每年是否已發送生日祝福
const BIRTHDAY_WISHES_KEY = 'ai-chat-birthday-wishes'

interface BirthdayWishRecord {
  [characterId: string]: number  // characterId -> 已發送祝福的年份
}

/**
 * 檢查今天是否為使用者生日
 */
export function isUserBirthdayToday(birthday?: string): boolean {
  if (!birthday) return false

  const today = new Date()
  const todayMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return birthday === todayMMDD
}

/**
 * 取得生日祝福記錄
 */
function getBirthdayWishRecords(): BirthdayWishRecord {
  try {
    const stored = localStorage.getItem(BIRTHDAY_WISHES_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * 儲存生日祝福記錄
 */
function saveBirthdayWishRecords(records: BirthdayWishRecord): void {
  localStorage.setItem(BIRTHDAY_WISHES_KEY, JSON.stringify(records))
}

/**
 * 檢查角色今年是否已發送過生日祝福
 */
export function hasWishedThisYear(characterId: string): boolean {
  const records = getBirthdayWishRecords()
  const currentYear = new Date().getFullYear()
  return records[characterId] === currentYear
}

/**
 * 標記角色已發送今年的生日祝福
 */
export function markWishSent(characterId: string): void {
  const records = getBirthdayWishRecords()
  const currentYear = new Date().getFullYear()
  records[characterId] = currentYear
  saveBirthdayWishRecords(records)
}

/**
 * 使用 AI 生成個性化的生日祝福訊息
 */
export async function generateBirthdayWish(
  character: Character,
  user: UserProfile,
  relationship: UserCharacterRelationship,
  apiKey: string
): Promise<string> {
  // 取得關係等級名稱
  const relationshipName = getRelationshipLevelName(relationship.level, relationship.isRomantic)

  const prompt = `你是「${character.name}」，正在為「${user.nickname}」寫一則生日祝福訊息。

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
請用你的角色個性和說話風格，寫一則簡短的生日祝福訊息給「${user.nickname}」。
- 訊息長度：1-3 句話
- 自然、真誠，符合角色個性和你們之間的關係
- 可以加入一些角色特有的口頭禪或表達方式
- 不需要加任何前綴或標記，直接輸出祝福內容

請直接輸出祝福訊息：`

  try {
    // 透過 LLM adapter 發送請求
    const adapter = await getDefaultAdapter()
    const response = await adapter.generate(
      apiKey,
      [{ role: 'user', content: prompt }],
      {
        modelType: 'lite',
        temperature: 0.9,
        maxOutputTokens: 256,
        queueDescription: `生日祝福：${character.name}`
      }
    )

    if (response.blocked || !response.text) {
      throw new Error('生日祝福生成失敗：' + (response.blockReason || '空回應'))
    }

    return response.text.trim()
  } catch (error) {
    console.error('生成生日祝福失敗:', error)
    // Fallback：根據關係等級選擇不同的模板
    const name = user.nickname

    // 戀人模板（soulmate + isRomantic）
    const romanticTemplates = [
      `${name}，生日快樂！今天是屬於你的特別日子，我會一直陪在你身邊的。`,
      `親愛的 ${name}，生日快樂！能遇見你是我最幸運的事。`
    ]

    // 摯友/好友模板（close_friend, soulmate 非戀愛）
    const closeFriendTemplates = [
      `${name}，生日快樂！認識你真的太好了，希望我們能一直當好朋友！`,
      `生日快樂 ${name}！謝謝你一直以來的陪伴，今年也請多多指教～`,
      `${name} 生日快樂！有你這個朋友真好，祝你心想事成！`
    ]

    // 朋友模板（friend）
    const friendTemplates = [
      `${name}，生日快樂！祝你今天過得開心！`,
      `生日快樂！${name}，願你有美好的一天～`,
      `${name} 生日快樂！希望你今年一切順利！`,
      `今天是 ${name} 的生日呢！祝你生日快樂！`,
      `生日快樂～希望 ${name} 今天能收到滿滿的祝福！`,
      `${name}，祝你生日快樂，天天開心！`
    ]

    // 根據關係選擇模板
    let templates: string[]
    if (relationship.isRomantic && relationship.level === 'soulmate') {
      templates = romanticTemplates
    } else if (relationship.level === 'close_friend' || relationship.level === 'soulmate') {
      templates = closeFriendTemplates
    } else {
      templates = friendTemplates
    }

    return templates[Math.floor(Math.random() * templates.length)]!
  }
}

/**
 * 取得應該發送生日祝福的好友列表
 * 條件：
 * 1. 好感度達到 friend（30）以上
 * 2. 今年尚未發送過祝福
 * 3. 有對應的一對一聊天室
 */
export function getEligibleCharactersForBirthdayWish(
  characters: Character[],
  chatRooms: ChatRoom[],
  getAffection: (characterId: string) => number
): { character: Character; chatRoom: ChatRoom }[] {
  const FRIEND_THRESHOLD = 30  // friend 等級的好感度門檻

  return characters
    .filter(char => {
      // 條件 1：好感度達到 friend 以上
      const affection = getAffection(char.id)
      if (affection < FRIEND_THRESHOLD) return false

      // 條件 2：今年尚未發送過祝福
      if (hasWishedThisYear(char.id)) return false

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
