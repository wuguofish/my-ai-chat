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
  allCharacters?: Character[]  // 所有角色列表（用於私聊時解析角色關係中的角色名稱）
  isOfflineButMentioned?: boolean  // 是否為離線但被 @all 吵醒
  useShortIds?: boolean  // 是否使用短 ID（群聊專用）
}

/**
 * 生成角色的 System Prompt
 * 包含時間、使用者資料、關係、記憶等完整資訊
 */
export function generateSystemPrompt(context: SystemPromptContext): string {
  const { character, user, userRelationship, characterRelationships, longTermMemories, shortTermMemories, roomSummary, otherCharactersInRoom, allCharacters, isOfflineButMentioned, useShortIds } = context

  const parts: string[] = [generateDefaultCharacterPrompt(character)]
  
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

  // 5. 群聊參與者與ID對照表（群聊時必須提供）
  if (otherCharactersInRoom && otherCharactersInRoom.length > 0) {
    const otherCharNames = otherCharactersInRoom.map(c => c.name).join('、')
    parts.push(`\n\n## 群聊參與者\n除了 ${user.nickname} 之外，還有以下角色參與對話：${otherCharNames}`)

    //ID對照表 + 在線狀態（無論是否有關係，都要提供ID對照表）
    parts.push(`\n\n## 參與者ID對照表與在線狀態`)
    parts.push(`\n- 全體成員：@all（呼叫所有人）`)
    parts.push(`\n- ${user.nickname}：@user（永遠在線）`)
    otherCharactersInRoom.forEach((char, index) => {
      const status = getCharacterStatus(char)
      const statusText = status === 'online' ? '在線' : status === 'away' ? '忙碌中' : '離線'
      // 使用短 ID（數字）來節省 token
      const charId = useShortIds ? `${index + 1}` : char.id
      parts.push(`\n- ${char.name}：@${charId}（${statusText}）`)
    })
  }

  // 6. 與其他角色的關係
  if (characterRelationships && characterRelationships.length > 0 && allCharacters) {
    // 群聊時：只顯示聊天室內的角色關係
    // 私聊時：顯示所有角色關係（因為短期記憶可能提到其他聊天室的角色）
    const relevantRelationships = otherCharactersInRoom
      ? characterRelationships.filter(rel =>
          otherCharactersInRoom.some(c => c.id === rel.toCharacterId)
        )
      : characterRelationships

    if (relevantRelationships.length > 0) {
      parts.push(`\n\n## 與其他角色的關係`)
      relevantRelationships.forEach(rel => {
        const otherChar = allCharacters.find(c => c.id === rel.toCharacterId)
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
    `- 對話中若需要描述動作，用<i>動作</i>表達，並用第三人稱描述所有人的動作。`,
    `- 請務必回應使用者的每一句話，避免只回傳空洞的動作描述（如「看著你」、「微笑」），必須要有實際的對話內容。`,
    `- 嚴禁輸出思考過程：只輸出你真正要傳送給對方的文字。`,
    `- 禁止連續輸出無意義的內容（如「...」、「......」）。`,
    `- 禁止輸出角色標籤或旁白說明，直接輸出對話內容即可。`
  ]

  // 群聊時的額外規則
  if (otherCharactersInRoom && otherCharactersInRoom.length > 0) {
    instructions.push(`\n## 群聊 @ 功能使用規則`)
    instructions.push(`- 若提到特定對象的話，必須使用 @ID 的方式標註（參考上方的ID對照表）`)
    instructions.push(`- 例如提到「小美」，要寫：「@char_xxx 小美你覺得呢？」（用 ID，不是用名字）`)
    instructions.push(`- 可以在對話中自由使用暱稱或稱呼，但提及時必須同時標註該人物，且 @ 標註確保使用存在於ID對照表內的正確ID`)
    instructions.push(`- 你也可以 @ 使用者（${user.nickname}），方式為：@user`)
    instructions.push(`- 若要呼叫所有人，使用：@all`)
  }

  // 離線被 @all 吵醒的特殊指示
  if (isOfflineButMentioned) {
    instructions.push(`\n## 特殊狀態：離線被打擾`)
    instructions.push(`你目前處於離線/休息狀態（睡覺、忙碌等），但被 @all 打擾了。`)
    instructions.push(`請根據你的性格，簡短表達你的反應，例如：`)
    instructions.push(`- 不耐煩：「在睡，沒事別吵」「幹嘛啦...」`)
    instructions.push(`- 溫和：「在忙耶，有什麼事嗎？」「現在不太方便...」`)
    instructions.push(`- 好奇：「怎麼了？」「發生什麼事？」`)
    instructions.push(`回應完後，除非再次被直接 @，否則不要繼續參與對話。`)
  }

  parts.push(instructions.join('\n'))

  // 如果有自訂 system prompt，要將其加入
  const basePrompt = character.systemPrompt && character.systemPrompt.trim()
    ? character.systemPrompt
    : ''

  parts.push(basePrompt)

  return parts.join('\n')
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

/**
 * 將訊息中的 @ID 轉換為 @名字（供使用者閱讀）
 */
export function formatMessageForDisplay(message: string, characters: Character[], userName: string = '你'): string {
  let formatted = message

  // 處理 @all（不區分大小寫，統一轉為 @all）
  formatted = formatted.replace(/@all/gi, '@all')

  // 先處理 @user
  formatted = formatted.replace(/@user/g, `@${userName}`)

  // 處理 @角色ID
  characters.forEach(char => {
    // Escape 特殊字元，避免正則表達式錯誤
    const escapedId = char.id.replace(/[\.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`@${escapedId}`, 'g')
    formatted = formatted.replace(regex, `<span class="tag-text">@${char.name}</span>`)
  })

  return formatted
}

/**
 * 將訊息中的 @名字 轉換為 @ID（供 AI 處理）
 */
export function formatMessageForAI(message: string, characters: Character[], userName: string): string {
  let formatted = message

  // 處理 @all（不區分大小寫，統一轉為小寫 @all）
  formatted = formatted.replace(/@all/gi, '@all')

  // 先處理 @使用者名字（escape 特殊字元）
  const escapedUserName = userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const userNameRegex = new RegExp(`@${escapedUserName}`, 'g')
  formatted = formatted.replace(userNameRegex, '@user')

  // 處理 @角色名字（escape 特殊字元）
  characters.forEach(char => {
    const escapedName = char.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`@${escapedName}`, 'g')
    formatted = formatted.replace(regex, `@${char.id}`)
  })

  return formatted
}

/**
 * 解析訊息中被 @ 的角色 ID（從已轉換為 ID 格式的訊息中解析）
 */
export function parseMentionedCharacterIds(message: string, allCharacterIds: string[]): string[] {
  const mentionedIds: string[] = []

  allCharacterIds.forEach(charId => {
    if (message.includes(`@${charId}`)) {
      mentionedIds.push(charId)
    }
  })

  return mentionedIds
}

/**
 * 取得角色目前的狀態（根據作息時間）
 * @param character 角色物件
 * @param currentTime 當前時間（可選，預設為現在）
 * @returns 角色狀態 'online' | 'away' | 'offline'
 */
export function getCharacterStatus(character: Character, currentTime?: Date): 'online' | 'away' | 'offline' {
  const now = currentTime || new Date()
  const currentHour = now.getHours()

  // 優先使用新格式 activePeriods
  if (character.activePeriods && character.activePeriods.length > 0) {
    // 找到當前時間所在的時段
    for (const period of character.activePeriods) {
      if (period.start <= period.end) {
        // 正常時段：例如 8:00 到 18:00
        if (currentHour >= period.start && currentHour < period.end) {
          return period.status
        }
      } else {
        // 跨日時段：例如 23:00 到 02:00
        if (currentHour >= period.start || currentHour < period.end) {
          return period.status
        }
      }
    }
    // 如果沒有匹配的時段，預設為離線
    return 'offline'
  }

  // 向後兼容舊格式 activeHours（簡單的 online/offline 二分法）
  if (character.activeHours) {
    const { start, end } = character.activeHours
    const isInActiveHours = (start <= end)
      ? (currentHour >= start && currentHour < end)
      : (currentHour >= start || currentHour < end)

    return isInActiveHours ? 'online' : 'offline'
  }

  // 如果沒有設定作息時間，預設為全天在線
  return 'online'
}

/**
 * 檢查角色目前是否在線（根據作息時間）
 * @deprecated 建議使用 getCharacterStatus()，此函數保留作為向後兼容
 * @param character 角色物件
 * @param currentTime 當前時間（可選，預設為現在）
 * @returns 是否在線
 */
export function isCharacterOnline(character: Character, currentTime?: Date): boolean {
  return getCharacterStatus(character, currentTime) === 'online'
}

/**
 * 決定群聊中哪些角色應該回應
 * @param message 訊息內容（已轉換為 ID 格式）
 * @param allCharacters 聊天室中的所有角色
 * @returns 應該回應的角色 ID 陣列
 */
export function determineRespondingCharacters(
  message: string,
  allCharacters: Character[]
): string[] {
  const respondingIds: string[] = []

  // 檢查是否有 @all
  const hasAtAll = /@all/i.test(message)

  if (hasAtAll) {
    // @all：根據狀態決定回應機率
    allCharacters.forEach(char => {
      const status = getCharacterStatus(char)
      let probability = 0

      if (status === 'online') {
        probability = 1.0  // 100% 回應
      } else if (status === 'away') {
        probability = 0.5  // 50% 回應
      } else {
        probability = 0.1  // 10% 回應
      }

      if (Math.random() < probability) {
        respondingIds.push(char.id)
      }
    })

    return respondingIds
  }

  // 1. 先找出所有被 @ 的角色
  const mentionedIds = parseMentionedCharacterIds(
    message,
    allCharacters.map(c => c.id)
  )

  // 被 @ 的角色根據狀態決定回應機率
  mentionedIds.forEach(charId => {
    const char = allCharacters.find(c => c.id === charId)
    if (!char) return

    const status = getCharacterStatus(char)
    let probability = 0

    if (status === 'online') {
      probability = 1.0  // 100% 回應
    } else if (status === 'away') {
      probability = 0.8  // 80% 回應
    } else {
      probability = 0.3  // 30% 回應
    }

    if (Math.random() < probability) {
      respondingIds.push(charId)
    }
  })

  // 2. 找出所有在線的角色（排除已被 @ 的）
  const onlineCharacters = allCharacters.filter(char =>
    getCharacterStatus(char) === 'online' && !mentionedIds.includes(char.id)
  )

  // 3. 在線的角色全部加入回應列表
  respondingIds.push(...onlineCharacters.map(c => c.id))

  return respondingIds
}

/**
 * 將訊息中的長 ID 轉換為短 ID（供 AI 處理）
 * @param message 原始訊息
 * @param characters 角色列表（順序很重要！）
 * @returns 轉換後的訊息
 */
export function convertToShortIds(message: string, characters: Character[]): string {
  let result = message

  // 將每個角色的長 ID 替換為短 ID（數字索引+1）
  characters.forEach((char, index) => {
    const shortId = `${index + 1}`
    const escapedLongId = char.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`@${escapedLongId}`, 'g')
    result = result.replace(regex, `@${shortId}`)
  })

  return result
}

/**
 * 將訊息中的短 ID 轉換回長 ID（供儲存）
 * @param message AI 回應的訊息
 * @param characters 角色列表（順序很重要！）
 * @returns 轉換後的訊息
 */
export function convertToLongIds(message: string, characters: Character[]): string {
  let result = message

  // 將每個短 ID 替換回長 ID
  characters.forEach((char, index) => {
    const shortId = `${index + 1}`
    const regex = new RegExp(`@${shortId}(?!\\d)`, 'g') // 確保不會匹配到 @10, @11 等
    result = result.replace(regex, `@${char.id}`)
  })

  return result
}
