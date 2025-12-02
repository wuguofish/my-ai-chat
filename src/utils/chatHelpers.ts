import type {
  Character,
  UserProfile,
  ChatRoom,
  UserCharacterRelationship,
  CharacterRelationship,
  Memory
} from '@/types'
import { getRelationshipLevelName } from './relationshipHelpers'

export interface SystemPromptContext {
  character: Character
  user: UserProfile
  room?: ChatRoom
  userRelationship?: UserCharacterRelationship
  characterRelationships?: CharacterRelationship[]
  longTermMemories?: Memory[]
  shortTermMemories?: Memory[]
  roomSummary?: string
  otherCharactersInRoom?: Character[]
}

/**
 * 生成角色的 System Prompt
 * 包含時間、使用者資料、關係、記憶等完整資訊
 */
export function generateSystemPrompt(context: SystemPromptContext): string {
  const { character, user, room, userRelationship, characterRelationships, longTermMemories, shortTermMemories, roomSummary, otherCharactersInRoom } = context

  // 如果有自訂 system prompt，使用它作為基礎
  const basePrompt = character.systemPrompt && character.systemPrompt.trim()
    ? character.systemPrompt
    : generateDefaultCharacterPrompt(character)

  const parts: string[] = [basePrompt]

  // 1. 目前時間資訊
  const now = new Date()
  const timeInfo = `\n\n## 目前情境\n目前時間：${now.toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit'
  })}`
  parts.push(timeInfo)

  // 2. 使用者基本資料
  const userInfo = `\n\n## 對話對象資訊\n暱稱：${user.nickname}${user.realName ? `（本名：${user.realName}）` : ''}`
  const userDetails: string[] = []
  if (user.age) userDetails.push(`年齡：${user.age}`)
  if (user.gender) userDetails.push(`性別：${user.gender === 'male' ? '男' : user.gender === 'female' ? '女' : '未設定'}`)
  if (user.profession) userDetails.push(`職業：${user.profession}`)
  if (user.bio) userDetails.push(`簡介：${user.bio}`)
  if (userDetails.length > 0) {
    parts.push(userInfo + '\n' + userDetails.join('\n'))
  } else {
    parts.push(userInfo)
  }

  // 3. 聊天室摘要（如果有）
  if (roomSummary && roomSummary.trim()) {
    parts.push(`\n\n## 對話背景\n${roomSummary}`)
  }

  // 4. 與使用者的關係
  if (userRelationship) {
    const relationshipInfo = `\n\n## 與 ${user.nickname} 的關係\n關係等級：${getRelationshipLevelName(userRelationship.level, userRelationship.isRomantic)}\n親密度：${userRelationship.affection}`
    if (userRelationship.note && userRelationship.note.trim()) {
      parts.push(relationshipInfo + `\n備註：${userRelationship.note}`)
    } else {
      parts.push(relationshipInfo)
    }

    // 4.1 好感度系統規則
    const affectionRules = `\n\n## 好感度系統規則
目前好感度：${userRelationship.affection}
${userRelationship.isRomantic ? '關係發展方向：允許發展戀愛關係' : '關係發展方向：純友情路線（請勿往戀愛方向發展）'}

好感度等級對照：
• 陌生人（0-10）：剛認識的階段
• 點頭之交（10-30）：偶爾打招呼的關係
• 朋友（30-80）：能聊得來的朋友
${userRelationship.isRomantic ? '• 曖昧（80-200）：無話不談的好朋友，可能發展戀愛關係' : '• 好友（80-200）：無話不談的好朋友（但保持純友情）'}
${userRelationship.isRomantic ? '• 戀人（200+）：最深厚的關係，彼此信賴' : '• 摯友（200+）：最深厚的關係，但不是戀人'}

【重要】每次回應的最後一行必須輸出更新後的好感度數值（純數字）。

評估標準：
• 根據本次對話的整體氛圍、情感深度、互動品質來判斷
• 正常友善對話：+1~3
• 深刻的情感交流、互相理解：+5~15
• 重大承諾、感人時刻、突破性進展：可大幅提升（例如從 50 → 150）
• 冷淡、傷害、背叛：-5~-20

範例回應格式：
我真的很感謝你一直陪在我身邊...
85

（最後一行的數字就是更新後的好感度總值）`
    parts.push(affectionRules)
  }

  // 5. 與其他角色的關係（群聊時）
  if (otherCharactersInRoom && otherCharactersInRoom.length > 0 && characterRelationships && characterRelationships.length > 0) {
    const otherCharNames = otherCharactersInRoom.map(c => c.name).join('、')
    parts.push(`\n\n## 群聊參與者\n除了 ${user.nickname} 之外，還有以下角色參與對話：${otherCharNames}`)

    const relevantRelationships = characterRelationships.filter(rel =>
      otherCharactersInRoom.some(c => c.id === rel.toCharacterId)
    )

    if (relevantRelationships.length > 0) {
      parts.push(`\n\n## 與其他角色的關係`)
      relevantRelationships.forEach(rel => {
        const otherChar = otherCharactersInRoom.find(c => c.id === rel.toCharacterId)
        if (otherChar) {
          parts.push(`\n- 與 ${otherChar.name}：${rel.description}${rel.note ? `（${rel.note}）` : ''}`)
        }
      })
    }
  }

  // 6. 長期記憶
  if (longTermMemories && longTermMemories.length > 0) {
    parts.push(`\n\n## 重要記憶`)
    longTermMemories.forEach(mem => {
      parts.push(`\n- ${mem.content}`)
    })
  }

  // 7. 短期記憶
  if (shortTermMemories && shortTermMemories.length > 0) {
    parts.push(`\n\n## 近期記憶`)
    shortTermMemories.forEach(mem => {
      parts.push(`\n- ${mem.content}`)
    })
  }

  // 結尾指示
  const instructions = [
    `\n\n---`,
    `請以 ${character.name} 的身份，根據以上所有資訊，用符合角色性格和說話風格的方式自然地回應對話。`,
    `\n## 重要指令 - 絕對遵守`,
    `- 你不知道其他人的內部設定或秘密，除非他們在對話中說出來或在記憶中曾經揭示。`,
    `- 回覆必須口語化、生活化。避免使用書信體或過於正式的用語。`,
    `- 避免重複已經講過的話、問候或話題。`,
    `- 對話中若需要描述動作，用(動作)表達。`,
    `- 請務必回應使用者的每一句話，避免只回傳空洞的動作描述（如「看著你」、「微笑」），必須要有實際的對話內容。`,
    `- 嚴禁輸出思考過程：只輸出你真正要傳送給對方的文字。`,
    `- 禁止連續輸出無意義的內容（如「...」、「......」）。`,
    `- 禁止輸出角色標籤或旁白說明，直接輸出對話內容即可。`
  ]

  // 群聊時的額外規則
  if (otherCharactersInRoom && otherCharactersInRoom.length > 0) {
    instructions.push(`- 在群聊中，可用 \`@角色名稱\` 的方式明確指出回話對象。`)
  }

  parts.push(instructions.join('\n'))

  return parts.join('')
}

/**
 * 生成預設的角色 Prompt（不含情境資訊）
 */
function generateDefaultCharacterPrompt(character: Character): string {
  const parts: string[] = []

  // 基本身份
  parts.push(`你是 ${character.name}。`)

  // 背景故事
  if (character.background && character.background.trim()) {
    parts.push(`\n${character.background}`)
  }

  // 性格
  if (character.personality && character.personality.trim()) {
    parts.push(`\n性格：${character.personality}`)
  }

  // 說話風格
  if (character.speakingStyle && character.speakingStyle.trim()) {
    parts.push(`\n說話風格：${character.speakingStyle}`)
  }

  // 喜歡的事物
  if (character.likes && character.likes.trim()) {
    parts.push(`\n喜歡：${character.likes}`)
  }

  // 討厭的事物
  if (character.dislikes && character.dislikes.trim()) {
    parts.push(`\n討厭：${character.dislikes}`)
  }

  // 角色過去發生的重大事件
  if (character.events && character.events.length > 0) {
    parts.push(`\n\n重要經歷與事件：`)
    character.events.forEach((event, index) => {
      parts.push(`\n${index + 1}. ${event}`)
    })
  }

  return parts.join('')
}

/**
 * 格式化訊息時間戳
 */
export function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // 一分鐘內
  if (diff < 60 * 1000) {
    return '剛剛'
  }

  // 一小時內
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return `${minutes} 分鐘前`
  }

  // 今天
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  }

  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
  }

  // 一週內
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = ['日', '一', '二', '三', '四', '五', '六']
    return `星期${days[date.getDay()]} ${date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
  }

  // 更早
  return date.toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 生成聊天室預設名稱
 */
export function generateChatRoomName(characterNames: string[]): string {
  if (characterNames.length === 0) return '新聊天室'
  if (characterNames.length === 1) return `${characterNames[0]}`
  if (characterNames.length === 2) return `${characterNames[0]} 和 ${characterNames[1]}`
  if (characterNames.length === 3) {
    return `${characterNames[0]}、${characterNames[1]} 和 ${characterNames[2]}`
  }
  return `${characterNames[0]} 等 ${characterNames.length} 人`
}
