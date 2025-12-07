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
  const { character, user, userRelationship, characterRelationships, longTermMemories, shortTermMemories, roomSummary,
    otherCharactersInRoom, allCharacters, isOfflineButMentioned, useShortIds } = context

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

好感度等級對照（支援負數）：
• 仇敵（-100 以下）：關係極差，互相敵視
• 不爽（-100 ~ -30）：關係不好，但還不到仇敵
• 陌生人（-30 ~ 10）：陌生或淡淡的不滿
• 點頭之交（10 ~ 30）：會打招呼的關係
• 朋友（30 ~ 80）：能聊得來的朋友
${userRelationship.isRomantic ? '• 曖昧（80 ~ 200）：無話不談的好朋友，可能發展戀愛關係' : '• 好友（80 ~ 200）：無話不談的好朋友（但保持純友情）'}
${userRelationship.isRomantic ? '• 戀人（200+）：最深厚的關係，彼此信賴' : '• 摯友（200+）：最深厚的關係，但不是戀人'}

【重要】每次回應的最後一行必須輸出更新後的好感度數值（純數字，可以是負數）。

評估標準：
• 根據本次對話的整體氛圍、情感深度、互動品質來判斷
• 正常友善對話：+1 ~ +3
• 深刻的情感交流、互相理解：+5 ~ +15
• 重大承諾、感人時刻、突破性進展：可大幅提升（例如從 50 → 150）
• 冷淡回應：-1 ~ -3
• 傷害、冒犯、誤會：-5 ~ -20
• 重大背叛、嚴重衝突：可大幅下降（例如從 50 → -50）

範例回應格式：
我真的很感謝你一直陪在我身邊...
85

（最後一行的數字就是更新後的好感度總值，可以是負數）`
    parts.push(affectionRules)
  }

  // 5. 群聊參與者與ID對照表（群聊時必須提供）
  if (otherCharactersInRoom && otherCharactersInRoom.length > 0) {
  
    const otherCharNames = otherCharactersInRoom.map(c => c.name).join('、')
    parts.push(`\n\n## 群聊參與者\n`)
    
    if (context.room?.name) { 
      parts.push(`### 群組名稱：${context.room?.name}\n`)
    }
    
    parts.push(`除了 ${ user.nickname } 之外，還有以下角色參與對話：${ otherCharNames }`)

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
          parts.push(`\n- 與 ${otherChar.name}：${rel.description}；${rel.note ? `（${rel.note}）` : ''}`)
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
    `- 對話中若需要描述動作，用 *動作* 表達（Markdown 斜體語法），並用第三人稱描述所有人的動作。`,
    `- 如須描述動作，動作和對話間須換行，要一句動作、一句對話，不要寫在同一行內。`,
    `- 請務必回應使用者的每一句話，避免只回傳空洞的動作描述（如「看著你」、「微笑」），必須要有實際的對話內容。`,
    `- 嚴禁輸出思考過程：只輸出你真正要傳送給對方的文字。`,
    `- 禁止輸出空字串。`,
    `- 禁止輸出角色標籤或旁白說明，直接輸出對話內容即可。`
  ]

  // 群聊時的額外規則
  if (otherCharactersInRoom && otherCharactersInRoom.length > 0) {
    instructions.push(`\n## 群聊 @ 功能使用規則`)
    instructions.push(`- 若提到特定對象的話，必須使用 @ID 的方式標註（參考上方的ID對照表）`)
    instructions.push(`- 例如提到「小美」，要寫：「@char_xxx 小美你覺得呢？」（用 ID，不是用名字）`)
    instructions.push(`- 可以在對話中自由使用暱稱或稱呼，但第一次提及時必須在對話中@ 標註該人物，且確保使用存在於ID對照表內的正確ID`)
    instructions.push(`- 你也可以 @ 使用者（${user.nickname}），方式為：@user`)
    instructions.push(`- 若要呼叫所有人，使用：@all`)
    instructions.push(`- 同一則對話內禁止重複使用@標註同一個人，請在回覆前檢查此次回覆內容是否有重複的ID，若有，請保留第一次呼叫。`)
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
 * 同時將 *動作* 轉換為 <i>動作</i>
 */
export function formatMessageForDisplay(message: string, characters: Character[], userName: string = '你'): string {
  let formatted = message

  // 處理 @all（不區分大小寫，統一轉為 @all）
  formatted = formatted.replace(/@all/gi, '<span class="tag-text">@all</span>')

  // 先處理 @user
  formatted = formatted.replace(/@user/g, `<span class="tag-text">@${userName}</span>`)

  // 處理 @角色ID
  characters.forEach(char => {
    // Escape 特殊字元，避免正則表達式錯誤
    const escapedId = char.id.replace(/[\.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`@${escapedId}`, 'g')
    formatted = formatted.replace(regex, `<span class="tag-text">@${char.name}</span>`)
  })

  // 處理粗體標記：**粗體** → <b>粗體</b>（必須先處理，避免被單星號規則誤判）
  // 使用 [\s\S] 來匹配包括換行在內的所有字元
  formatted = formatted.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')

  // 處理動作標記：*動作* → <i>動作</i>
  // 使用 [\s\S] 來匹配包括換行在內的所有字元，+? 表示非貪婪匹配
  formatted = formatted.replace(/\*([\s\S]+?)\*/g, '<i>$1</i>')

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
 * 無法回應的角色資訊
 */
export interface UnableToRespondInfo {
  characterId: string
  characterName: string
  reason: 'away' | 'offline'
}

/**
 * 決定回應角色的結果
 */
export interface RespondingCharactersResult {
  respondingIds: string[]
  unableToRespond: UnableToRespondInfo[]
}

/**
 * 決定群聊中哪些角色應該回應
 * @param message 訊息內容（已轉換為 ID 格式）
 * @param allCharacters 聊天室中的所有角色
 * @returns 應該回應的角色 ID 陣列與無法回應的角色資訊
 */
export function determineRespondingCharacters(
  message: string,
  allCharacters: Character[]
): RespondingCharactersResult {
  const respondingIds: string[] = []
  const unableToRespond: UnableToRespondInfo[] = []

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
      } else {
        // 未回應的角色記錄原因
        if (status === 'away') {
          unableToRespond.push({
            characterId: char.id,
            characterName: char.name,
            reason: 'away'
          })
        } else if (status === 'offline') {
          unableToRespond.push({
            characterId: char.id,
            characterName: char.name,
            reason: 'offline'
          })
        }
      }
    })

    return { respondingIds, unableToRespond }
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
    } else {
      // 被 @ 但未回應的角色記錄原因
      if (status === 'away') {
        unableToRespond.push({
          characterId: char.id,
          characterName: char.name,
          reason: 'away'
        })
      } else if (status === 'offline') {
        unableToRespond.push({
          characterId: char.id,
          characterName: char.name,
          reason: 'offline'
        })
      }
    }
  })

  // 2. 找出所有在線的角色（排除已被 @ 的）
  const onlineCharacters = allCharacters.filter(char =>
    getCharacterStatus(char) === 'online' && !mentionedIds.includes(char.id)
  )

  // 3. 在線的角色全部加入回應列表
  respondingIds.push(...onlineCharacters.map(c => c.id))

  // 4. 處理未被 @ 的 away 和 offline 角色
  const notMentionedCharacters = allCharacters.filter(char => !mentionedIds.includes(char.id))

  notMentionedCharacters.forEach(char => {
    const status = getCharacterStatus(char)

    // 已經是 online 的角色已經在上面處理過了，跳過
    if (status === 'online') return

    // away 角色：20% 機率回應
    if (status === 'away') {
      const probability = 0.2
      if (Math.random() < probability) {
        respondingIds.push(char.id)
      } else {
        // 只有當角色確定不回應時，才加入 unableToRespond 清單
        unableToRespond.push({
          characterId: char.id,
          characterName: char.name,
          reason: 'away'
        })
      }
    }

    // offline 角色：加入 unableToRespond 清單（不會回應）
    if (status === 'offline') {
      unableToRespond.push({
        characterId: char.id,
        characterName: char.name,
        reason: 'offline'
      })
    }
  })

  return { respondingIds, unableToRespond }
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

/**
 * 洗牌
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  let currentIndex: number = result.length;
  let randomIndex: number;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    if (result[currentIndex] && result[randomIndex]) {
      [result[currentIndex], result[randomIndex]] = [
        result[randomIndex]!,
        result[currentIndex]!
      ];
    }

  }

  return result;
}

/**
 * 生成角色狀態訊息的上下文資訊
 */
export interface StatusMessageContext {
  shortTermMemories?: Array<{ content: string }>
  mood?: string  // 心情描述（例如：開心、煩躁）
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
}

/**
 * 為角色生成狀態訊息（類似 LINE 的個人狀態）
 * @param character 角色資料
 * @param context 生成上下文（短期記憶、心情、時間等）
 * @param apiKey Gemini API Key
 * @returns 生成的狀態訊息（30 字以內）
 */
export async function generateStatusMessage(
  character: Character,
  context: StatusMessageContext = {},
  apiKey: string
): Promise<string> {
  const { shortTermMemories = [], mood, timeOfDay } = context

  // 判斷當前時間（如果沒有提供）
  const currentTimeOfDay = timeOfDay || (() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 17) return 'afternoon'
    if (hour >= 17 && hour < 21) return 'evening'
    return 'night'
  })()

  const timeDescriptions = {
    morning: '早上',
    afternoon: '下午',
    evening: '傍晚',
    night: '晚上'
  }

  // 組裝 Prompt
  let prompt = `你是 ${character.name}，請根據以下資訊，生成一則符合你個性的狀態訊息（類似 LINE 的個人狀態）。

## 你的個性
${character.personality}

## 你的說話風格
${character.speakingStyle || '自然隨性'}

## 當前時間
${timeDescriptions[currentTimeOfDay]}`

  // 加入短期記憶
  if (shortTermMemories.length > 0) {
    prompt += `\n\n## 最近的經歷\n`
    shortTermMemories.forEach((mem, index) => {
      prompt += `${index + 1}. ${mem.content}\n`
    })
  }

  // 加入心情
  if (mood) {
    prompt += `\n\n## 目前心情\n${mood}`
  }

  prompt += `\n\n請生成一則 **30 字以內** 的狀態訊息，要：
- 符合你的個性和說話風格
- 反映當前時間和最近經歷
- 簡短有趣，像是你真的在更新個人狀態
- 不要加引號或任何說明文字，直接輸出狀態訊息內容

範例：
- 「今天心情不錯，來杯咖啡 ☕」
- 「忙碌的一天終於結束了...」
- 「正在思考人生的意義 🤔」

你的狀態訊息：`

  // 呼叫 Gemini API
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.9,  // 提高創意
      maxOutputTokens: 100,
    }
  })

  const result = await model.generateContent(prompt)
  const statusMessage = result.response.text().trim()

  // 確保不超過 30 字
  return statusMessage.length > 30 ? statusMessage.substring(0, 30) + '...' : statusMessage
}

/**
 * 作息狀態監控系統
 * 用於偵測角色的在線狀態變化，並在狀態從 offline/away → online 時觸發狀態訊息生成
 */
interface CharacterStatusCache {
  [characterId: string]: 'online' | 'away' | 'offline'
}

let statusCache: CharacterStatusCache = {}
let monitoringIntervalId: number | null = null

/**
 * 檢查並更新所有角色的狀態
 */
async function checkAndUpdateAllCharacterStatus() {
  try {
    const { useCharacterStore } = await import('@/stores/characters')
    const characterStore = useCharacterStore()
    const characters = characterStore.characters

    for (const character of characters) {
      const currentStatus = getCharacterStatus(character)
      const previousStatus = statusCache[character.id]

      // 第一次檢查，初始化 cache
      if (!previousStatus) {
        statusCache[character.id] = currentStatus
        continue
      }

      // 檢查是否從 offline/away 變成 online
      if (previousStatus !== 'online' && currentStatus === 'online') {
        console.log(`✨ ${character.name} 剛上線了！(${previousStatus} → ${currentStatus})`)

        // 檢查好感度是否達到「朋友」等級
        const shouldNotify = await checkIfShouldNotify(character.id)

        if (shouldNotify) {
          // 顯示 Toast 通知
          showCharacterOnlineNotification(character)
        }

        // 觸發狀態訊息生成
        triggerStatusUpdateOnStatusChange(character.id).catch((err: unknown) => {
          console.warn(`${character.name} 上線時自動生成狀態訊息失敗:`, err)
        })
      }

      // 更新 cache
      statusCache[character.id] = currentStatus
    }
  } catch (error) {
    console.error('作息監控執行錯誤:', error)
  }
}

/**
 * 計算距離下一個整點還有多少毫秒
 */
function getMillisecondsUntilNextHour(): number {
  const now = new Date()
  const nextHour = new Date(now)
  nextHour.setHours(now.getHours() + 1, 0, 0, 0)
  return nextHour.getTime() - now.getTime()
}

/**
 * 啟動作息狀態監控
 * 建議在應用程式啟動時呼叫（例如：App.vue 的 onMounted）
 *
 * 檢查時機：
 * 1. 應用程式載入時（立即執行）
 * 2. 每個整點（因為作息時段精確度只到小時）
 */
export function startStatusMonitoring() {
  // 避免重複啟動
  if (monitoringIntervalId) {
    console.warn('作息監控已在執行中')
    return
  }

  console.log('✅ 啟動作息狀態監控系統')

  // 1. 應用載入時立即檢查一次
  checkAndUpdateAllCharacterStatus()

  // 2. 設定在下一個整點執行
  const msUntilNextHour = getMillisecondsUntilNextHour()
  console.log(`⏰ 下次檢查時間：${Math.round(msUntilNextHour / 1000 / 60)} 分鐘後（整點）`)

  setTimeout(() => {
    // 到達整點，立即檢查
    checkAndUpdateAllCharacterStatus()

    // 然後每小時檢查一次（每個整點）
    monitoringIntervalId = window.setInterval(() => {
      console.log('⏰ 整點到了，檢查角色作息狀態...')
      checkAndUpdateAllCharacterStatus()
    }, 60 * 60 * 1000) // 每小時（3600秒）
  }, msUntilNextHour)
}

/**
 * 停止作息狀態監控
 */
export function stopStatusMonitoring() {
  if (monitoringIntervalId) {
    clearInterval(monitoringIntervalId)
    monitoringIntervalId = null
    statusCache = {}
    console.log('⏹️ 已停止作息狀態監控系統')
  }
}

/**
 * 檢查是否應該顯示角色上線通知
 * 條件：好感度達到「朋友」等級以上
 */
async function checkIfShouldNotify(characterId: string): Promise<boolean> {
  try {
    const { useRelationshipsStore } = await import('@/stores/relationships')
    const relationshipsStore = useRelationshipsStore()

    const relationship = relationshipsStore.getUserCharacterRelationship(characterId)

    // 如果沒有關係資料，不通知
    if (!relationship) return false

    // 只有「朋友」等級以上才通知（friend, close_friend, soulmate）
    return ['friend', 'close_friend', 'soulmate'].includes(relationship.level)
  } catch (error) {
    console.error('檢查通知條件時發生錯誤:', error)
    return false
  }
}

/**
 * 顯示角色上線 Toast 通知
 */
function showCharacterOnlineNotification(character: Character) {
  // 動態載入 useToast（避免在模組載入時就執行）
  import('@/composables/useToast').then(({ useToast }) => {
    const { characterOnline } = useToast()

    characterOnline(
      character.id,
      character.name,
      character.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(character.name)}&background=764ba2&color=fff`,
      5000  // 5 秒後自動消失
    )
  }).catch((err: unknown) => {
    console.error('顯示上線通知時發生錯誤:', err)
  })
}

/**
 * 觸發狀態訊息更新（作息變化時）
 */
async function triggerStatusUpdateOnStatusChange(characterId: string): Promise<void> {
  try {
    const { useCharacterStore } = await import('@/stores/characters')
    const { useUserStore } = await import('@/stores/user')
    const { useMemoriesStore } = await import('@/stores/memories')

    const characterStore = useCharacterStore()
    const userStore = useUserStore()
    const memoriesStore = useMemoriesStore()

    // 檢查 API key
    if (!userStore.apiKey) return

    // 取得角色
    const character = characterStore.getCharacterById(characterId)
    if (!character) return

    // 取得短期記憶
    const shortTermMemories = memoriesStore.getCharacterShortTermMemories(characterId)

    // 生成狀態訊息
    const statusMessage = await generateStatusMessage(
      character,
      { shortTermMemories },
      userStore.apiKey
    )

    // 更新
    characterStore.updateCharacterStatus(characterId, statusMessage)
    console.log(`✨ 已為 ${character.name} 因上線生成狀態訊息: ${statusMessage}`)
  } catch (error) {
    console.error('作息變化時生成狀態訊息失敗:', error)
    throw error
  }
}
