/**
 * 動態牆服務
 * 處理 AI 生成動態/留言、事件觸發、角色互動等邏輯
 */

import type { Character, Post, PostComment, PostTriggerEvent, RelationshipLevel } from '@/types'
import {
  FEED_POST_PROBABILITY,
  FEED_EVENT_COOLDOWN,
  FEED_INTERACTION_PROBABILITY,
  FEED_INTERACTION_DELAY,
  FEED_COMMENT_REPLY
} from '@/utils/constants'
import { createGeminiModel, isAdultConversation, getGeminiResponseText } from '@/services/gemini'
import { enqueueGeminiRequest } from '@/services/apiQueue'
import { getRelationshipLevelName } from '@/utils/relationshipHelpers'
import { getCharacterStatus, getGenderText } from '@/utils/chatHelpers'
import { v4 as uuidv4 } from 'uuid'

// ==========================================
// 輔助函數
// ==========================================

/**
 * 產生指定範圍內的隨機延遲時間（毫秒）
 */
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * 檢查機率是否命中
 */
function rollProbability(probability: number): boolean {
  return Math.random() < probability
}

/**
 * 解析動態/留言內容中的 @mentions
 * 回傳被 @ 的角色 ID 列表
 *
 * @param content 動態或留言內容
 * @param characters 所有角色列表
 * @returns 被 @ 的角色 ID 列表
 */
export function parseMentionsInFeed(content: string, characters: Character[]): string[] {
  const mentionedIds: string[] = []

  // 檢查 @角色名
  for (const char of characters) {
    // Escape 特殊字元
    const escapedName = char.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`@${escapedName}(?![\\w])`, 'g')
    if (regex.test(content)) {
      mentionedIds.push(char.id)
    }
  }

  return mentionedIds
}

/**
 * 檢查內容是否包含 @all
 */
export function hasMentionAll(content: string): boolean {
  return /@all(?![\w])/i.test(content)
}

/**
 * 解析留言內容中的樓層回覆格式
 * 支援單一或多個樓層：
 * - 「回#3：」、「回 #3：」
 * - 「回#2和#3：」、「#1 #2 說的沒錯」
 *
 * @param content 留言內容
 * @returns 樓層編號陣列，如果沒有則回傳空陣列
 */
export function parseFloorReply(content: string): number[] {
  const floors: Set<number> = new Set()

  // 找出所有 #數字 的匹配
  const hashMatches = content.match(/#(\d+)/g)
  if (hashMatches) {
    for (const match of hashMatches) {
      const num = parseInt(match.slice(1), 10)
      if (num > 0) {
        floors.add(num)
      }
    }
  }

  // 也支援「回N樓」格式
  const floorMatches = content.match(/(\d+)\s*樓/g)
  if (floorMatches) {
    for (const match of floorMatches) {
      const numMatch = match.match(/(\d+)/)
      if (numMatch && numMatch[1]) {
        const num = parseInt(numMatch[1], 10)
        if (num > 0) {
          floors.add(num)
        }
      }
    }
  }

  return Array.from(floors).sort((a, b) => a - b)
}

/**
 * 移除留言內容開頭的樓層回覆格式（完整格式）
 * 用於清理顯示（如果需要的話）
 */
export function removeFloorReplyPrefix(content: string): string {
  const patterns = [
    /^回\s*#\d+\s*[：:,，]?\s*/,
    /^回\s*\d+\s*樓\s*[：:,，]?\s*/,
  ]

  let cleaned = content
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  return cleaned
}

/**
 * 移除 AI 打錯的不完整樓層回覆格式（如「回#：」「回 #：」「回#」）
 * 保留完整格式（如「回#7：」「回 #1：」）
 */
export function removeIncompleteFloorReply(content: string): string {
  // 只移除「回#」或「回 #」後面沒有數字的情況
  return content.replace(/^回\s*#\s*(?!\d)[：:,，]?\s*/, '')
}

/**
 * 將動態/留言內容中的 @mentions 轉換為 HTML 顯示格式
 *
 * @param content 動態或留言內容
 * @param characters 所有角色列表
 * @param userName 使用者暱稱
 * @returns 帶有 HTML 標籤的內容
 */
export function formatFeedContentForDisplay(
  content: string,
  characters: Character[],
  userName: string = '你'
): string {

  content = content.trim()

  if (content.startsWith('---')) {
    content = content.substring(3).trim()
  }

  // 先清理 AI 打錯的不完整樓層回覆格式（如「回#：」），保留完整格式（如「回#7：」）
  let formatted = removeIncompleteFloorReply(content)

  // 處理樓層回覆格式（如「回#7：」「回 #1：」「回#2和#3：」）轉成可點擊的樓層連結
  // 使用 data-floor 屬性，讓 Vue 可以綁定點擊事件
  formatted = formatted.replace(
    /回\s*((?:#\s*\d+[\s,，、和與及]*)+)[：:,，]?\s*/g,
    (match, floorsStr) => {
      // 解析所有樓層編號
      const floors = floorsStr.match(/#(\d+)/g)
      if (!floors || floors.length === 0) return match

      const floorLinks = floors.map((f: string) => {
        const num = f.slice(1) // 移除 #
        return `<span class="reply-floor-link" data-floor="${num}">#${num}</span>`
      }).join(' ')

      return `<span class="comment-reply-indicator">回 ${floorLinks}：</span>`
    }
  )

  // 處理 @all（不區分大小寫）
  formatted = formatted.replace(/@all(?![\w])/gi, '<span class="mention">@all</span>')

  // 處理 @角色名
  for (const char of characters) {
    const escapedName = char.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`@${escapedName}(?![\\w])`, 'g')
    formatted = formatted.replace(regex, `<span class="mention">@${char.name}</span>`)
  }

  // 處理 @user（使用者被提及）
  formatted = formatted.replace(/@user(?![\w])/gi, `<span class="mention mention-me">@${userName}</span>`)

  return formatted
}

// ==========================================
// 留言回覆會話狀態管理（延遲群聊模式）
// ==========================================

/**
 * 留言回覆會話狀態
 * 用於追蹤每篇動態的 AI 回覆輪次，防止無限循環
 */
interface PostCommentSession {
  round: number              // 目前輪次（0 開始）
  lastParticipants: string[] // 上一輪參與者 ID 列表（排序後用於比較）
}

/** 各動態的留言回覆會話狀態（不持久化，App 重啟後重置） */
const commentSessions: Map<string, PostCommentSession> = new Map()

/**
 * 取得或建立動態的留言會話
 */
function getCommentSession(postId: string): PostCommentSession {
  if (!commentSessions.has(postId)) {
    commentSessions.set(postId, { round: 0, lastParticipants: [] })
  }
  return commentSessions.get(postId)!
}

/**
 * 重置動態的留言會話（使用者留言時呼叫）
 */
function resetCommentSession(postId: string): void {
  commentSessions.set(postId, { round: 0, lastParticipants: [] })
  console.log(`[Feed] 重置動態 ${postId} 的留言會話`)
}

/**
 * 檢查是否應該終止回覆鏈
 * @returns 終止原因，null 表示可以繼續
 */
function shouldTerminateReplyChain(postId: string, currentParticipants: string[]): string | null {
  const session = getCommentSession(postId)

  // 檢查輪次上限
  if (session.round >= FEED_COMMENT_REPLY.maxRounds) {
    return `已達最大輪次 ${FEED_COMMENT_REPLY.maxRounds}`
  }

  // 檢查循環偵測（連續兩輪參與者組合相同）
  const sortedCurrent = [...currentParticipants].sort()
  const sortedLast = session.lastParticipants

  if (sortedCurrent.length > 0 &&
      sortedCurrent.length === sortedLast.length &&
      sortedCurrent.every((id, i) => id === sortedLast[i])) {
    return '偵測到循環（參與者組合重複）'
  }

  return null
}

/**
 * 更新留言會話狀態（一輪回覆完成後呼叫）
 */
function advanceCommentSession(postId: string, participants: string[]): void {
  const session = getCommentSession(postId)
  session.round++
  session.lastParticipants = [...participants].sort()
  console.log(`[Feed] 動態 ${postId} 進入第 ${session.round} 輪，參與者: ${participants.join(', ')}`)
}

// ==========================================
// AI 內容生成
// ==========================================

/**
 * AI 生成角色動態內容
 */
export async function generatePostContent(
  character: Character,
  triggerEvent: PostTriggerEvent,
  apiKey: string,
  userAge?: string,
  additionalContext?: string
): Promise<string> {
  const { useUserStore } = await import('@/stores/user')
  const { useRelationshipsStore } = await import('@/stores/relationships')
  const { useMemoriesStore } = await import('@/stores/memories')

  const userStore = useUserStore()
  const relationshipsStore = useRelationshipsStore()
  const memoriesStore = useMemoriesStore()

  const user = userStore.profile
  const isAdult = isAdultConversation(userAge, character.age)

  // 取得與使用者的關係
  const userRelationship = relationshipsStore.getUserCharacterRelationship(character.id)

  // 取得短期記憶（最近發生的事）
  const shortTermMemories = memoriesStore.getCharacterShortTermMemories(character.id)

  // 事件描述
  const eventDescriptions: Record<PostTriggerEvent, string> = {
    mood_change: '心情有了變化',
    relationship_change: '與某人的關係有了進展',
    new_memory: '想起了一些重要的事',
    come_online: '剛剛上線',
    birthday: '今天是自己的生日',
    holiday: '正在過節日',
    daily_catchup: '日常分享',
    user_post: '看到朋友發的動態'
  }

  // 組裝 System Prompt
  let systemPrompt = `你是一個互動式小說的角色扮演系統。你正在扮演一名名為「${character.name}」的虛構角色。
${isAdult ? '這是一部面向成人讀者的互動式小說，所有登場人物皆為成年人。' : ''}

## 角色基本資料
${character.gender ? `性別：${getGenderText(character.gender)}` : ''}
${character.age ? `年齡：${character.age}` : ''}
${character.profession ? `職業：${character.profession}` : ''}

## 角色個性
${character.personality}

## 說話風格
${character.speakingStyle || '自然隨性'}`

  // 加入角色背景
  if (character.background) { 
    systemPrompt += `\n\n## 背景故事\n${character.background}`
  }

  // 加入認識的人（使用者 + 其他角色）
  const { useCharacterStore } = await import('@/stores/characters')
  const characterStore = useCharacterStore()

  // 收集所有認識的人
  const knownPeople: string[] = []

  // 加入使用者（如果關係不是 stranger）
  if (user && userRelationship && userRelationship.level !== 'stranger') {
    const userName = user.nickname + (user.realName ? `（${user.realName}）` : '')
    const relName = getRelationshipLevelName(userRelationship.level, userRelationship.isRomantic)
    knownPeople.push(`- ${userName}：${relName}`)
  }

  // 加入其他角色（只加入非 neutral 的關係）
  const charRelationships = relationshipsStore.getCharacterRelationships(character.id)
    .filter(rel => rel.fromCharacterId === character.id && rel.relationshipType !== 'neutral')

  for (const rel of charRelationships) {
    const otherChar = characterStore.getCharacterById(rel.toCharacterId)
    if (otherChar) {
      const relDesc = rel.description || rel.relationshipType
      let entry = `- ${otherChar.name}：${relDesc}`
      if (rel.state) {
        entry += `（${rel.state}）`
      }
      knownPeople.push(entry)
    }
  }

  // 如果有認識的人，加入 prompt
  if (knownPeople.length > 0) {
    systemPrompt += `\n\n## 你認識的人\n${knownPeople.join('\n')}`
  }

  // 組裝 User Prompt
  let userPrompt = `請以「${character.name}」的身份，在社群媒體上發一則動態。

## 發文情境
${eventDescriptions[triggerEvent]}
${additionalContext ? `\n補充資訊：${additionalContext}` : ''}`

  // 加入短期記憶
  if (shortTermMemories.length > 0) {
    userPrompt += `\n\n## 最近的經歷（可作為發文素材）\n`
    shortTermMemories.slice(0, 3).forEach((mem, index) => {
      userPrompt += `${index + 1}. ${mem.content}\n`
    })
  }

  // 加入心情
  if (character.mood) {
    userPrompt += `\n\n## 目前心情\n${character.mood}`
  }

  userPrompt += `\n\n## 發文要求
- 內容要 **50~150 字**，自然、口語化
- 符合你的個性和說話風格
- 可以分享心情、日常、想法、或對最近經歷的感想
- 不要用「大家好」開頭，直接切入主題
- 可以適當使用 emoji，但不要太多
- 使用台灣的慣用詞彙（例如：早安、晚安、好棒、超讚、傻眼等）
- 不要加引號或任何說明文字，直接輸出動態內容

你的動態：`

  // 建立模型並呼叫 API（透過佇列）
  const model = createGeminiModel(apiKey, {
    model: 'gemini-2.5-flash-lite',
    systemInstruction: systemPrompt,
    temperature: 0.9,
    maxOutputTokens: 1024,
    safeMode: !isAdult
  })

  const content = await enqueueGeminiRequest(
    () => getGeminiResponseText(userPrompt, model),
    'gemini-2.5-flash-lite',
    `動態牆發文：${character.name}`
  )

  // 確保不超過 200 字
  return content
}

/**
 * AI 生成角色留言內容
 * @param character 留言的角色
 * @param post 動態
 * @param apiKey API Key
 * @param userAge 使用者年齡
 * @param replyToComment 要回覆的留言（可選）
 * @param recentComments 最近的留言列表（用於回覆鏈上下文）
 */
export async function generateCommentContent(
  character: Character,
  post: Post,
  apiKey: string,
  userAge?: string,
  replyToComment?: PostComment,
  recentComments?: PostComment[]
): Promise<string> {
  const { useRelationshipsStore } = await import('@/stores/relationships')
  const { useCharacterStore } = await import('@/stores/characters')
  const { useMemoriesStore } = await import('@/stores/memories')
  const { useUserStore } = await import('@/stores/user')

  const relationshipsStore = useRelationshipsStore()
  const characterStore = useCharacterStore()
  const memoriesStore = useMemoriesStore()
  const userStore = useUserStore()

  const isAdult = isAdultConversation(userAge, character.age)

  // 取得動態作者資訊
  let authorName = post.authorName
  let relationshipWithAuthor: string | undefined

  if (post.authorId === 'user') {
    // 作者是使用者
    const userRelationship = relationshipsStore.getUserCharacterRelationship(character.id)
    if (userRelationship) {
      relationshipWithAuthor = getRelationshipLevelName(userRelationship.level, userRelationship.isRomantic)
    }
  } else {
    // 作者是其他角色
    const authorCharacter = characterStore.getCharacterById(post.authorId)
    if (authorCharacter) {
      authorName = authorCharacter.name
      // 取得角色間的關係
      const charRelationship = relationshipsStore.getRelationshipBetween(character.id, post.authorId)
      if (charRelationship) {
        relationshipWithAuthor = charRelationship.description || charRelationship.relationshipType
      }
    }
  }

  // 組裝 System Prompt
  let systemPrompt = `你是一個互動式小說的角色扮演系統。你正在扮演一名名為「${character.name}」的虛構角色。
${isAdult ? '這是一部面向成人讀者的互動式小說，所有登場人物皆為成年人。' : ''}

## 角色基本資料
${character.gender ? `性別：${getGenderText(character.gender)}` : ''}
${character.age ? `年齡：${character.age}` : ''}
${character.profession ? `職業：${character.profession}` : ''}

## 角色個性
${character.personality}

## 說話風格
${character.speakingStyle || '自然隨性'}`

  // 如果有回覆鏈，加入更多角色資訊
  if (recentComments && recentComments.length > 0) {
    // 加入角色的短期記憶（提供更多背景）
    const shortTermMemories = memoriesStore.getCharacterShortTermMemories(character.id)
    if (shortTermMemories.length > 0) {
      systemPrompt += `\n\n## 你最近的經歷\n`
      shortTermMemories.slice(0, 2).forEach((mem, index) => {
        systemPrompt += `${index + 1}. ${mem.content}\n`
      })
    }

    // 收集參與對話的人物及其與角色的關係
    const participants = new Set<string>()
    recentComments.forEach(c => participants.add(c.authorId))

    const relationshipInfo: string[] = []
    for (const participantId of participants) {
      if (participantId === character.id) continue

      if (participantId === 'user') {
        const userRel = relationshipsStore.getUserCharacterRelationship(character.id)
        if (userRel) {
          const userName = userStore.profile?.nickname || '使用者'
          const userProfile = userStore.profile
          // 組裝使用者基本資料
          const userBasicInfo: string[] = []
          if (userProfile?.gender) userBasicInfo.push(getGenderText(userProfile.gender))
          if (userProfile?.age) userBasicInfo.push(`${userProfile.age}歲`)
          if (userProfile?.profession) userBasicInfo.push(userProfile.profession)
          const userInfoStr = userBasicInfo.length > 0 ? `（${userBasicInfo.join('、')}）` : ''
          relationshipInfo.push(`- ${userName}${userInfoStr}：${getRelationshipLevelName(userRel.level, userRel.isRomantic)}`)
        }
      } else {
        const otherChar = characterStore.getCharacterById(participantId)
        if (otherChar) {
          const charRel = relationshipsStore.getRelationshipBetween(character.id, participantId)
          const relDesc = charRel?.description || charRel?.relationshipType || '認識'
          // 組裝角色基本資料
          const charBasicInfo: string[] = []
          if (otherChar.gender) charBasicInfo.push(getGenderText(otherChar.gender))
          if (otherChar.age) charBasicInfo.push(`${otherChar.age}歲`)
          if (otherChar.profession) charBasicInfo.push(otherChar.profession)
          const charInfoStr = charBasicInfo.length > 0 ? `（${charBasicInfo.join('、')}）` : ''
          relationshipInfo.push(`- ${otherChar.name}${charInfoStr}：${relDesc}`)
        }
      }
    }

    if (relationshipInfo.length > 0) {
      systemPrompt += `\n\n## 你與對話參與者的關係\n${relationshipInfo.join('\n')}`
    }
  }

  // 組裝 User Prompt
  let userPrompt = `請以「${character.name}」的身份，在社群媒體上回覆一則動態。

## 動態內容
作者：${authorName}
${relationshipWithAuthor ? `你與作者的關係：${relationshipWithAuthor}` : ''}

「${post.content}」`

  // 如果有最近的留言，加入對話脈絡（含樓層編號）
  if (recentComments && recentComments.length > 0) {
    userPrompt += `\n\n## 目前的留言區（最近 ${recentComments.length} 則）`
    for (const comment of recentComments) {
      const floorTag = comment.floor ? `#${comment.floor}` : ''
      const replyInfo = comment.replyToFloors && comment.replyToFloors.length > 0
        ? ` (回 ${comment.replyToFloors.map(f => `#${f}`).join(' ')})`
        : ''
      userPrompt += `\n${floorTag} ${comment.authorName}${replyInfo}：「${comment.content}」`
    }
  }

  if (replyToComment) {
    const replyFloorTag = replyToComment.floor ? `#${replyToComment.floor} ` : ''
    userPrompt += `\n\n## 你要回覆的留言
${replyFloorTag}${replyToComment.authorName}：「${replyToComment.content}」`
  }

  // 收集可以 @ 的對象
  const mentionableNames: string[] = []

  // 使用者（如果不是留言角色本身）
  const userName = userStore.profile?.nickname || '使用者'
  mentionableNames.push(`@user（${userName}）`)

  // 動態作者（如果不是自己且不是使用者）
  if (post.authorId !== character.id && post.authorId !== 'user') {
    mentionableNames.push(`@${authorName}`)
  }

  // 最近留言中的其他人
  if (recentComments) {
    for (const comment of recentComments) {
      if (comment.authorId !== character.id && comment.authorId !== 'user') {
        const name = `@${comment.authorName}`
        if (!mentionableNames.includes(name)) {
          mentionableNames.push(name)
        }
      }
    }
  }

  userPrompt += `\n\n## 留言要求
- 內容要 **15~50 字**，簡短自然
- 符合你的個性和說話風格
- 可以是回應、共鳴、調侃、或表達支持
- 不要太正式，像朋友之間的互動
- 可以適當使用 emoji，但不要太多
- 不要加引號或任何說明文字，直接輸出留言內容
${replyToComment ? `- 這是回覆 #${replyToComment.floor || ''} ${replyToComment.authorName} 的留言，請針對他說的內容回應\n- 可以用「回#${replyToComment.floor || ''}：」開頭，但不是必須` : ''}
- 你可以使用 @ 來提及其他人，例如：${mentionableNames.slice(0, 3).join('、')}
- 不一定每則留言都要 @，自然就好

你的留言：`

  // 建立模型並呼叫 API（透過佇列）
  const model = createGeminiModel(apiKey, {
    model: 'gemini-2.5-flash-lite',
    systemInstruction: systemPrompt,
    temperature: 0.9,
    maxOutputTokens: 256,
    safeMode: !isAdult
  })

  const content = await enqueueGeminiRequest(
    () => getGeminiResponseText(userPrompt, model),
    'gemini-2.5-flash-lite',
    `動態牆留言：${character.name}`
  )

  return content
}

// ==========================================
// 事件觸發與機率判定
// ==========================================

/**
 * 判斷角色是否應該因事件發文
 * @returns true 如果應該發文
 */
export async function shouldPostForEvent(
  characterId: string,
  event: PostTriggerEvent
): Promise<boolean> {
  const { useFeedStore } = await import('@/stores/feed')
  const feedStore = useFeedStore()

  // 檢查冷卻時間
  if (feedStore.isEventOnCooldown(characterId, event)) {
    console.log(`[Feed] ${characterId} 的 ${event} 事件還在冷卻中`)
    return false
  }

  // 取得觸發機率
  const probability = FEED_POST_PROBABILITY[event] ?? 0

  // 擲骰判定
  const roll = rollProbability(probability)
  console.log(`[Feed] ${characterId} 的 ${event} 事件，機率 ${probability * 100}%，結果：${roll ? '觸發' : '未觸發'}`)

  return roll
}

/**
 * 觸發角色發文（完整流程）
 */
export async function triggerCharacterPost(
  character: Character,
  event: PostTriggerEvent,
  additionalContext?: string,
  customTimestamp?: number
): Promise<Post | null> {
  const { useUserStore } = await import('@/stores/user')
  const { useFeedStore } = await import('@/stores/feed')

  const userStore = useUserStore()
  const feedStore = useFeedStore()

  // 檢查 API key
  if (!userStore.apiKey) {
    console.warn('[Feed] 沒有 API key，無法生成動態')
    return null
  }

  // 判斷是否應該發文
  const shouldPost = await shouldPostForEvent(character.id, event)
  if (!shouldPost) {
    return null
  }

  try {
    // 生成動態內容
    const content = await generatePostContent(
      character,
      event,
      userStore.apiKey,
      userStore.profile?.age,
      additionalContext
    )

    // 建立動態
    const post: Post = {
      id: uuidv4(),
      authorId: character.id,
      authorName: character.name,
      content,
      timestamp: customTimestamp || Date.now(),
      triggerEvent: event,
      likes: [],
      comments: []
    }

    // 儲存動態
    feedStore.addPost(post)

    // 更新事件冷卻時間
    const cooldown = FEED_EVENT_COOLDOWN[event]
    if (cooldown) {
      feedStore.setEventCooldown(character.id, event, cooldown)
    }

    console.log(`[Feed] ${character.name} 發了一則動態 (${event}): ${content.slice(0, 30)}...`)

    return post
  } catch (error) {
    console.error(`[Feed] ${character.name} 發文失敗:`, error)
    return null
  }
}

// ==========================================
// 角色互動邏輯
// ==========================================

/**
 * 取得角色與動態作者的關係等級
 */
async function getRelationshipWithAuthor(
  characterId: string,
  authorId: string
): Promise<RelationshipLevel> {
  const { useRelationshipsStore } = await import('@/stores/relationships')
  const relationshipsStore = useRelationshipsStore()

  if (authorId === 'user') {
    // 作者是使用者
    const rel = relationshipsStore.getUserCharacterRelationship(characterId)
    return rel?.level ?? 'stranger'
  } else {
    // 作者是其他角色 - 這個專案目前沒有追蹤角色之間的好感度
    // 先使用 acquaintance 作為預設
    return 'acquaintance'
  }
}

/**
 * 判斷角色是否應該按讚
 */
export async function shouldLikePost(
  characterId: string,
  post: Post
): Promise<boolean> {
  // 不能對自己的動態按讚
  if (post.authorId === characterId) {
    return false
  }

  // 檢查是否已經按過讚
  if (post.likes.some(like => like.oderId === characterId)) {
    return false
  }

  // 取得關係等級
  const level = await getRelationshipWithAuthor(characterId, post.authorId)
  const probability = FEED_INTERACTION_PROBABILITY[level]?.like ?? 0

  return rollProbability(probability)
}

/**
 * 判斷角色是否應該留言
 */
export async function shouldCommentOnPost(
  characterId: string,
  post: Post
): Promise<boolean> {
  // 不能對自己的動態留言（這裡允許，但通常機率較低）
  if (post.authorId === characterId) {
    return false
  }

  // 取得關係等級
  const level = await getRelationshipWithAuthor(characterId, post.authorId)
  const probability = FEED_INTERACTION_PROBABILITY[level]?.comment ?? 0

  return rollProbability(probability)
}

/**
 * 判斷角色是否應該對留言按讚
 */
export async function shouldLikeComment(
  characterId: string,
  comment: PostComment
): Promise<boolean> {
  // 不能對自己的留言按讚
  if (comment.authorId === characterId) {
    return false
  }

  // 檢查是否已經按過讚
  if (comment.likes?.some(like => like.oderId === characterId)) {
    return false
  }

  // 取得關係等級
  const level = await getRelationshipWithAuthor(characterId, comment.authorId)
  const probability = FEED_INTERACTION_PROBABILITY[level]?.commentLike ?? 0

  return rollProbability(probability)
}

/**
 * 角色對動態按讚（立即執行）
 * @param isMentioned 是否被 @ 提及（被 @ 則 100% 按讚）
 */
export async function characterLikePost(
  characterId: string,
  postId: string,
  isMentioned: boolean = false
): Promise<boolean> {
  const { useFeedStore } = await import('@/stores/feed')
  const feedStore = useFeedStore()

  const post = feedStore.posts.find(p => p.id === postId)
  if (!post) return false

  // 被 @ 的角色 100% 按讚，否則按關係機率判定
  const shouldLike = isMentioned || await shouldLikePost(characterId, post)
  if (!shouldLike) return false

  feedStore.addLike(postId, characterId)
  console.log(`[Feed] 角色 ${characterId} 對動態 ${postId} 按讚`)

  // 如果是使用者的動態，建立通知
  if (post.authorId === 'user') {
    const { useCharacterStore } = await import('@/stores/characters')
    const characterStore = useCharacterStore()
    const character = characterStore.getCharacterById(characterId)

    if (character) {
      feedStore.addNotification({
        type: 'like',
        postId,
        postPreview: post.content.slice(0, 30),
        actorId: characterId,
        actorName: character.name
      })

      // 如果使用者不在動態牆頁面，顯示 Toast 通知
      if (!window.location.pathname.includes('/feed')) {
        const { useToast } = await import('@/composables/useToast')
        const toast = useToast()
        toast.feedLike(characterId, character.name, character.avatar, postId)
      }
    }
  }

  return true
}

/**
 * 角色對動態留言（立即執行）
 * @param isMentioned 是否被 @ 提及（被 @ 則 100% 留言）
 */
export async function characterCommentOnPost(
  character: Character,
  postId: string,
  isMentioned: boolean = false
): Promise<PostComment | null> {
  const { useFeedStore } = await import('@/stores/feed')
  const { useUserStore } = await import('@/stores/user')

  const feedStore = useFeedStore()
  const userStore = useUserStore()

  const post = feedStore.posts.find(p => p.id === postId)
  if (!post) return null

  // 檢查 API key
  if (!userStore.apiKey) {
    console.warn('[Feed] 沒有 API key，無法生成留言')
    return null
  }

  // 被 @ 的角色 100% 留言，否則按關係機率判定
  const shouldComment = isMentioned || await shouldCommentOnPost(character.id, post)
  if (!shouldComment) return null

  try {
    // 取得目前的留言作為上下文（最多取最近 20 則，與群聊一致）
    const recentComments = post.comments.slice(-20)

    // 生成留言內容
    const content = await generateCommentContent(
      character,
      post,
      userStore.apiKey,
      userStore.profile?.age,
      undefined,  // replyToComment
      recentComments
    )

    // 建立留言
    const comment: PostComment = {
      id: uuidv4(),
      authorId: character.id,
      authorName: character.name,
      content,
      timestamp: Date.now()
    }

    // 儲存留言
    feedStore.addComment(postId, comment)

    console.log(`[Feed] ${character.name} 留言: ${content.slice(0, 20)}...`)

    // 如果是使用者的動態，建立通知
    if (post.authorId === 'user') {
      feedStore.addNotification({
        type: 'comment',
        postId,
        postPreview: post.content,
        actorId: character.id,
        actorName: character.name
      })

      // 如果使用者不在動態牆頁面，顯示 Toast 通知
      if (!window.location.pathname.includes('/feed')) {
        const { useToast } = await import('@/composables/useToast')
        const toast = useToast()
        toast.feedComment(character.id, character.name, content, character.avatar, postId)
      }
    }

    // 檢查留言內容是否 @ 了使用者（建立 mention 通知）
    if (content.includes('@user') || content.toLowerCase().includes('@user')) {
      feedStore.addNotification({
        type: 'mention',
        postId,
        postPreview: content.slice(0, 30),
        actorId: character.id,
        actorName: character.name
      })

      // 如果使用者不在動態牆頁面，顯示 Toast 通知
      if (!window.location.pathname.includes('/feed')) {
        const { useToast } = await import('@/composables/useToast')
        const toast = useToast()
        toast.feedMention(character.id, character.name, content, character.avatar, postId)
      }
    }

    // 觸發回覆鏈（讓其他角色有機會回覆這則留言）
    // 注意：這不是使用者留言，所以不重置輪次
    triggerCommentReplies(postId, comment, false).catch(err => {
      console.warn('[Feed] 觸發留言回覆鏈失敗:', err)
    })

    return comment
  } catch (error) {
    console.error(`[Feed] ${character.name} 留言失敗:`, error)
    return null
  }
}

/**
 * 角色對留言按讚（立即執行）
 * 注意：留言按讚不會觸發 Toast 通知，只會記錄到通知中心
 */
export async function characterLikeComment(
  characterId: string,
  postId: string,
  commentId: string
): Promise<boolean> {
  const { useFeedStore } = await import('@/stores/feed')
  const feedStore = useFeedStore()

  const post = feedStore.posts.find(p => p.id === postId)
  if (!post) return false

  const comment = post.comments.find(c => c.id === commentId)
  if (!comment) return false

  const shouldLike = await shouldLikeComment(characterId, comment)
  if (!shouldLike) return false

  feedStore.addCommentLike(postId, commentId, characterId)
  console.log(`[Feed] 角色 ${characterId} 對留言 ${commentId} 按讚`)

  // 如果是使用者的留言，建立通知（但不顯示 Toast）
  if (comment.authorId === 'user') {
    const { useCharacterStore } = await import('@/stores/characters')
    const characterStore = useCharacterStore()
    const character = characterStore.getCharacterById(characterId)

    if (character) {
      feedStore.addNotification({
        type: 'comment_like',
        postId,
        postPreview: comment.content.slice(0, 30),
        actorId: characterId,
        actorName: character.name
      })
      // 注意：留言按讚不顯示 Toast，避免太吵
    }
  }

  return true
}

// ==========================================
// 留言回覆鏈機制（延遲群聊模式）
// ==========================================

// 儲存回覆鏈的延遲計時器
const pendingReplies: Map<string, ReturnType<typeof setTimeout>[]> = new Map()

/**
 * 角色回覆留言（帶有回覆對象）
 */
async function characterReplyToComment(
  character: Character,
  postId: string,
  replyToComment: PostComment
): Promise<PostComment | null> {
  const { useFeedStore } = await import('@/stores/feed')
  const { useUserStore } = await import('@/stores/user')

  const feedStore = useFeedStore()
  const userStore = useUserStore()

  const post = feedStore.posts.find(p => p.id === postId)
  if (!post) return null

  // 檢查 API key
  if (!userStore.apiKey) {
    console.warn('[Feed] 沒有 API key，無法生成回覆')
    return null
  }

  try {
    // 找到 replyToComment 在留言中的位置，取得該留言之前的脈絡
    const replyIndex = replyToComment.floor ? replyToComment.floor - 1 : post.comments.length - 1
    // 取得該留言之前的 10 則（包含 replyToComment 本身）
    const startIndex = Math.max(0, replyIndex - 9)
    const recentComments = post.comments.slice(startIndex, replyIndex + 1)

    // 生成回覆內容
    const content = await generateCommentContent(
      character,
      post,
      userStore.apiKey,
      userStore.profile?.age,
      replyToComment,
      recentComments
    )

    // 解析 AI 回覆中的樓層回覆格式（如「回#3：」或「#2和#3」）
    const parsedFloors = parseFloorReply(content)
    // 如果 AI 指定了樓層，使用 AI 指定的；否則使用 replyToComment 的樓層
    const replyToFloors = parsedFloors.length > 0
      ? parsedFloors
      : (replyToComment.floor ? [replyToComment.floor] : undefined)

    // 根據樓層找到對應的留言 ID
    let replyToIds: string[] = []
    if (replyToFloors && replyToFloors.length > 0) {
      // 根據樓層找到對應的留言
      replyToIds = post.comments
        .filter(c => c.floor && replyToFloors.includes(c.floor))
        .map(c => c.id)
    }
    // 如果沒找到，至少保留原本的 replyToComment
    if (replyToIds.length === 0) {
      replyToIds = [replyToComment.id]
    }

    // 建立回覆留言
    const comment: PostComment = {
      id: uuidv4(),
      authorId: character.id,
      authorName: character.name,
      content,
      timestamp: Date.now(),
      replyTo: replyToIds,
      replyToFloors
    }

    // 儲存留言
    feedStore.addComment(postId, comment)

    console.log(`[Feed] ${character.name} 回覆 ${replyToComment.authorName}: ${content.slice(0, 20)}...`)

    // 如果是回覆使用者的留言，建立通知
    if (replyToComment.authorId === 'user') {
      feedStore.addNotification({
        type: 'comment',
        postId,
        postPreview: replyToComment.content.slice(0, 30),
        actorId: character.id,
        actorName: character.name
      })

      // 如果使用者不在動態牆頁面，顯示 Toast 通知
      if (!window.location.pathname.includes('/feed')) {
        const { useToast } = await import('@/composables/useToast')
        const toast = useToast()
        toast.feedComment(character.id, character.name, content, character.avatar, postId)
      }
    }

    // 檢查回覆內容是否 @ 了使用者（建立 mention 通知）
    if (content.includes('@user') || content.toLowerCase().includes('@user')) {
      feedStore.addNotification({
        type: 'mention',
        postId,
        postPreview: content.slice(0, 30),
        actorId: character.id,
        actorName: character.name
      })

      // 如果使用者不在動態牆頁面，顯示 Toast 通知
      if (!window.location.pathname.includes('/feed')) {
        const { useToast } = await import('@/composables/useToast')
        const toast = useToast()
        toast.feedMention(character.id, character.name, content, character.avatar, postId)
      }
    }

    return comment
  } catch (error) {
    console.error(`[Feed] ${character.name} 回覆失敗:`, error)
    return null
  }
}

/**
 * 判斷角色是否應該回覆某則留言
 */
async function shouldReplyToComment(
  characterId: string,
  _post: Post,
  triggerComment: PostComment,
  isPostAuthor: boolean,
  isRepliedTo: boolean
): Promise<boolean> {
  // 不能回覆自己的留言
  if (triggerComment.authorId === characterId) {
    return false
  }

  // 取得與留言作者的關係
  const level = await getRelationshipWithAuthor(characterId, triggerComment.authorId)
  let baseProbability = FEED_INTERACTION_PROBABILITY[level]?.comment ?? 0

  // 如果是動態作者，增加回覆機率
  if (isPostAuthor) {
    baseProbability += FEED_COMMENT_REPLY.authorReplyBonus
  }

  // 如果被回覆或被 @，增加回覆機率
  if (isRepliedTo) {
    baseProbability += FEED_COMMENT_REPLY.repliedToBonus
  }

  // 確保機率不超過 1
  baseProbability = Math.min(baseProbability, 1)

  return rollProbability(baseProbability)
}

/**
 * 觸發留言回覆鏈
 * 當有新留言時呼叫，會排程可能的角色回覆
 *
 * @param postId 動態 ID
 * @param triggerComment 觸發回覆的留言
 * @param isUserComment 是否為使用者的留言（使用者留言會重置輪次）
 */
export async function triggerCommentReplies(
  postId: string,
  triggerComment: PostComment,
  isUserComment: boolean = false
): Promise<void> {
  const { useFeedStore } = await import('@/stores/feed')
  const { useCharacterStore } = await import('@/stores/characters')

  const feedStore = useFeedStore()
  const characterStore = useCharacterStore()

  const post = feedStore.posts.find(p => p.id === postId)
  if (!post) return

  // 如果是使用者留言，重置輪次計數
  if (isUserComment) {
    resetCommentSession(postId)
    console.log(`[Feed] 使用者留言，重置動態 ${postId} 的回覆輪次`)
  }

  // 解析留言中被 @ 的角色
  const mentionedIds = parseMentionsInFeed(triggerComment.content, characterStore.characters)
  const mentionAll = hasMentionAll(triggerComment.content)

  // 收集可能回覆的角色
  const potentialRepliers: { character: Character; isPostAuthor: boolean; isRepliedTo: boolean; isMentioned: boolean }[] = []

  // 1. 檢查動態作者（如果是角色）
  if (post.authorId !== 'user' && post.authorId !== triggerComment.authorId) {
    const postAuthor = characterStore.getCharacterById(post.authorId)
    if (postAuthor) {
      const status = getCharacterStatus(postAuthor)
      const isMentioned = mentionAll || mentionedIds.includes(postAuthor.id)
      // 被 @ 的角色即使忙碌也可能回覆
      if (status === 'online' || (isMentioned && status === 'away')) {
        potentialRepliers.push({
          character: postAuthor,
          isPostAuthor: true,
          isRepliedTo: false,
          isMentioned
        })
      }
    }
  }

  // 2. 檢查被回覆的角色（如果有 replyTo）
  if (triggerComment.replyTo && triggerComment.replyTo.length > 0) {
    const repliedComments = post.comments.filter(c => triggerComment.replyTo!.includes(c.id))
    for (const repliedComment of repliedComments) {
      if (repliedComment.authorId !== 'user' && repliedComment.authorId !== triggerComment.authorId) {
        const repliedChar = characterStore.getCharacterById(repliedComment.authorId)
        if (repliedChar) {
          const status = getCharacterStatus(repliedChar)
          const isMentioned = mentionAll || mentionedIds.includes(repliedChar.id)
          if (status === 'online' || (isMentioned && status === 'away')) {
            // 避免重複加入
            if (!potentialRepliers.some(r => r.character.id === repliedChar.id)) {
              potentialRepliers.push({
                character: repliedChar,
                isPostAuthor: false,
                isRepliedTo: true,
                isMentioned
              })
            } else {
              // 如果已經在列表中，標記為被回覆
              const existing = potentialRepliers.find(r => r.character.id === repliedChar.id)
              if (existing) {
                existing.isRepliedTo = true
                existing.isMentioned = existing.isMentioned || isMentioned
              }
            }
          }
        }
      }
    }
  }

  // 3. 檢查被 @ 的角色（優先加入）
  for (const mentionedId of mentionedIds) {
    if (potentialRepliers.some(r => r.character.id === mentionedId)) continue
    if (mentionedId === triggerComment.authorId) continue

    const mentionedChar = characterStore.getCharacterById(mentionedId)
    if (mentionedChar) {
      const status = getCharacterStatus(mentionedChar)
      // 被 @ 的角色在線或忙碌都可能回覆
      if (status === 'online' || status === 'away') {
        potentialRepliers.push({
          character: mentionedChar,
          isPostAuthor: false,
          isRepliedTo: false,
          isMentioned: true
        })
      }
    }
  }

  // 4. 檢查其他在線角色（低機率跟進）
  const onlineCharacters = characterStore.characters.filter(
    char => getCharacterStatus(char) === 'online' &&
            char.id !== triggerComment.authorId &&
            !potentialRepliers.some(r => r.character.id === char.id)
  )

  for (const char of onlineCharacters) {
    potentialRepliers.push({
      character: char,
      isPostAuthor: false,
      isRepliedTo: false,
      isMentioned: mentionAll
    })
  }

  if (potentialRepliers.length === 0) {
    console.log(`[Feed] 沒有可能回覆的角色`)
    return
  }

  // 判定哪些角色會回覆
  const willReply: Character[] = []

  for (const { character, isPostAuthor, isRepliedTo, isMentioned } of potentialRepliers) {
    // 被 @ 的角色：在線 100% 回覆，away 80% 回覆
    if (isMentioned) {
      const status = getCharacterStatus(character)
      const shouldReply = status === 'online' || rollProbability(0.8)
      if (shouldReply) {
        willReply.push(character)
      }
    } else {
      // 一般角色按原有邏輯判定
      const should = await shouldReplyToComment(
        character.id,
        post,
        triggerComment,
        isPostAuthor,
        isRepliedTo
      )
      if (should) {
        willReply.push(character)
      }
    }
  }

  if (willReply.length === 0) {
    console.log(`[Feed] 沒有角色決定回覆`)
    return
  }

  // 檢查終止條件
  const willReplyIds = willReply.map(c => c.id)
  const terminateReason = shouldTerminateReplyChain(postId, willReplyIds)
  if (terminateReason) {
    console.log(`[Feed] 回覆鏈終止: ${terminateReason}`)
    return
  }

  // 更新會話狀態
  advanceCommentSession(postId, willReplyIds)

  console.log(`[Feed] ${willReply.length} 個角色將回覆: ${willReply.map(c => c.name).join(', ')}`)

  // 清除之前的回覆計時器
  const prevTimers = pendingReplies.get(postId)
  if (prevTimers) {
    prevTimers.forEach(timer => clearTimeout(timer))
  }
  pendingReplies.set(postId, [])

  const timers = pendingReplies.get(postId)!

  // 排程回覆（帶有延遲）
  for (const character of willReply) {
    const replyDelay = getRandomDelay(
      FEED_INTERACTION_DELAY.reply.min,
      FEED_INTERACTION_DELAY.reply.max
    )

    const replyTimer = setTimeout(async () => {
      const newComment = await characterReplyToComment(character, postId, triggerComment)

      // 如果成功產生了回覆，遞迴檢查是否觸發新的回覆鏈
      if (newComment) {
        // 同時檢查是否有角色會對這則留言按讚
        for (const otherChar of characterStore.characters) {
          if (otherChar.id !== character.id && getCharacterStatus(otherChar) === 'online') {
            await characterLikeComment(otherChar.id, postId, newComment.id)
          }
        }

        // 遞迴觸發回覆（這會自動檢查輪次上限和循環偵測）
        await triggerCommentReplies(postId, newComment, false)
      }
    }, replyDelay)

    timers.push(replyTimer)

    console.log(`[Feed] 排程 ${character.name} 的回覆（${Math.round(replyDelay / 1000)}s 後）`)
  }
}

/**
 * 取消特定動態的所有待執行回覆
 */
export function cancelPendingReplies(postId: string): void {
  const timers = pendingReplies.get(postId)
  if (timers) {
    timers.forEach(timer => clearTimeout(timer))
    pendingReplies.delete(postId)
    console.log(`[Feed] 已取消動態 ${postId} 的待執行回覆`)
  }
}

// ==========================================
// 角色上線補看模式
// ==========================================

/**
 * 角色上線時檢查並互動未看過的動態
 * 這是「補看模式」- 不需要延遲，一次處理完
 */
export async function characterCatchUpFeed(character: Character): Promise<void> {
  const { useFeedStore } = await import('@/stores/feed')
  const feedStore = useFeedStore()

  // 取得角色上次瀏覽時間
  const lastCheck = feedStore.characterLastFeedCheck[character.id] || 0

  // 限制只看最近 36 小時內的動態（避免新角色去翻舊文，太 creepy）
  const timeLimit = Date.now() - 36 * 60 * 60 * 1000
  const effectiveLastCheck = Math.max(lastCheck, timeLimit)

  // 取得上次瀏覽後的新動態（不包含自己的）
  const newPosts = feedStore.posts.filter(
    post => post.timestamp > effectiveLastCheck && post.authorId !== character.id
  )

  if (newPosts.length === 0) {
    // 更新瀏覽時間
    feedStore.updateCharacterFeedCheck(character.id)
    return
  }

  console.log(`[Feed] ${character.name} 上線，有 ${newPosts.length} 則新動態待處理`)

  // 處理每則新動態
  for (const post of newPosts) {
    // 按讚動態
    await characterLikePost(character.id, post.id)

    // 留言
    await characterCommentOnPost(character, post.id)

    // 對留言按讚（檢查每則留言）
    for (const comment of post.comments) {
      await characterLikeComment(character.id, post.id, comment.id)
    }
  }

  // 更新瀏覽時間
  feedStore.updateCharacterFeedCheck(character.id)
}

// ==========================================
// 即時互動模式（使用者發文時）
// ==========================================

// 儲存延遲執行的計時器（用於取消）
const pendingInteractions: Map<string, ReturnType<typeof setTimeout>[]> = new Map()

/**
 * 使用者發文後，排程在線角色的互動（有延遲）
 * - 被 @ 的角色：在線必回，away 機率回
 * - 一般角色：按照關係等級機率判定
 */
export async function scheduleCharacterInteractions(postId: string): Promise<void> {
  const { useCharacterStore } = await import('@/stores/characters')
  const { useFeedStore } = await import('@/stores/feed')

  const characterStore = useCharacterStore()
  const feedStore = useFeedStore()

  const post = feedStore.posts.find(p => p.id === postId)
  if (!post) return

  // 只處理使用者的動態
  if (post.authorId !== 'user') return

  // 解析被 @ 的角色
  const mentionedIds = parseMentionsInFeed(post.content, characterStore.characters)
  const mentionAll = hasMentionAll(post.content)

  // 取得所有在線或忙碌中的角色（被 @ 的忙碌角色也可能回覆）
  const activeCharacters = characterStore.characters.filter(char => {
    const status = getCharacterStatus(char)
    return status === 'online' || status === 'away'
  })

  console.log(`[Feed] 排程 ${activeCharacters.length} 個活躍角色的互動，被@: ${mentionedIds.length}人，@all: ${mentionAll}`)

  // 清除之前的計時器
  const prevTimers = pendingInteractions.get(postId)
  if (prevTimers) {
    prevTimers.forEach(timer => clearTimeout(timer))
  }
  pendingInteractions.set(postId, [])

  const timers = pendingInteractions.get(postId)!

  for (const character of activeCharacters) {
    const status = getCharacterStatus(character)
    const isMentioned = mentionAll || mentionedIds.includes(character.id)

    // 決定是否參與互動
    let shouldInteract = false
    if (isMentioned) {
      // 被 @ 的角色：在線必回，away 80% 機率
      shouldInteract = status === 'online' || (status === 'away' && rollProbability(0.8))
    } else {
      // 一般角色：只有在線角色參與
      shouldInteract = status === 'online'
    }

    if (!shouldInteract) continue

    // 按讚延遲
    const likeDelay = getRandomDelay(
      FEED_INTERACTION_DELAY.like.min,
      FEED_INTERACTION_DELAY.like.max
    )

    const likeTimer = setTimeout(async () => {
      await characterLikePost(character.id, postId, isMentioned)
    }, likeDelay)

    timers.push(likeTimer)

    // 留言延遲（比按讚更長）
    const commentDelay = getRandomDelay(
      FEED_INTERACTION_DELAY.comment.min,
      FEED_INTERACTION_DELAY.comment.max
    )

    const commentTimer = setTimeout(async () => {
      await characterCommentOnPost(character, postId, isMentioned)
    }, commentDelay)

    timers.push(commentTimer)

    console.log(`[Feed] 排程 ${character.name} 的互動判定（${isMentioned ? '被@' : '一般'}，按讚 ${Math.round(likeDelay / 1000)}s，留言 ${Math.round(commentDelay / 1000)}s）`)
  }
}

/**
 * 取消特定動態的所有待執行互動
 */
export function cancelPendingInteractions(postId: string): void {
  const timers = pendingInteractions.get(postId)
  if (timers) {
    timers.forEach(timer => clearTimeout(timer))
    pendingInteractions.delete(postId)
    console.log(`[Feed] 已取消動態 ${postId} 的待執行互動`)
  }
}

// ==========================================
// 每日首次開 App 觸發（daily_catchup）
// ==========================================

/**
 * 執行每日首次開 App 的角色發文檢查
 * 應在 App.vue 的 onMounted 中呼叫
 */
export async function triggerDailyCatchup(): Promise<void> {
  const { useFeedStore } = await import('@/stores/feed')
  const { useCharacterStore } = await import('@/stores/characters')

  const feedStore = useFeedStore()
  const characterStore = useCharacterStore()

  // 檢查今天是否已經執行過
  if (feedStore.hasDailyCatchupToday()) {
    console.log('[Feed] 今天已經執行過 daily_catchup')
    return
  }

  console.log('[Feed] 執行每日首次開 App 的角色發文檢查')

  // 1. 先處理舊貼文摘要（背景執行）
  summarizeClosedPosts().catch(err => {
    console.warn('[Feed] 舊貼文摘要失敗:', err)
  })

  // 2. 取得所有在線角色
  const onlineCharacters = characterStore.characters.filter(
    char => getCharacterStatus(char) === 'online'
  )

  // 為每個在線角色判定是否發文
  for (const character of onlineCharacters) {
    // 產生一個隨機的過去時間（讓動態看起來像是離線期間發的）
    // 範圍：過去 1~8 小時
    const hoursAgo = Math.random() * 7 + 1
    const pastTimestamp = Date.now() - hoursAgo * 60 * 60 * 1000

    await triggerCharacterPost(character, 'daily_catchup', undefined, pastTimestamp)
  }

  // 更新每日檢查時間
  feedStore.setDailyCatchupDone()
}

// ==========================================
// 事件整合接口
// ==========================================

/**
 * 當角色情緒改變時呼叫
 */
export async function onCharacterMoodChange(
  character: Character,
  newMood: string
): Promise<void> {
  await triggerCharacterPost(character, 'mood_change', `現在的心情是：${newMood}`)
}

/**
 * 當使用者與角色的關係等級提升時呼叫
 */
export async function onRelationshipLevelUp(
  character: Character,
  newLevel: RelationshipLevel
): Promise<void> {
  const levelName = getRelationshipLevelName(newLevel, false)
  await triggerCharacterPost(character, 'relationship_change', `與好友的關係進展到了「${levelName}」`)
}

/**
 * 當角色間關係改變時呼叫
 * @param character 發生關係變化的角色
 * @param otherCharacterName 對方角色的名字
 * @param newRelationType 新的關係類型
 * @param isNewRelationship 是否為新建立的關係
 */
export async function onCharacterRelationshipChange(
  character: Character,
  otherCharacterName: string,
  newRelationType: string,
  isNewRelationship: boolean
): Promise<void> {
  const context = isNewRelationship
    ? `和 ${otherCharacterName} 成為了「${newRelationType}」的關係`
    : `和 ${otherCharacterName} 的關係變成了「${newRelationType}」`
  await triggerCharacterPost(character, 'relationship_change', context)
}

/**
 * 當角色新增長期記憶時呼叫
 */
export async function onNewMemory(
  character: Character,
  memoryContent: string
): Promise<void> {
  await triggerCharacterPost(character, 'new_memory', `想起了：${memoryContent.slice(0, 50)}`)
}

/**
 * 當角色上線時呼叫（整合到 chatHelpers 的作息監控）
 */
export async function onCharacterComeOnline(character: Character): Promise<void> {
  // 1. 機率發文
  await triggerCharacterPost(character, 'come_online')

  // 2. 補看動態牆
  await characterCatchUpFeed(character)
}

// ==========================================
// 貼文摘要系統
// ==========================================

/**
 * 處理超過 36 小時的舊貼文，生成摘要並存入參與者的短期記憶
 * 在使用者開 APP 時呼叫
 */
export async function summarizeClosedPosts(): Promise<number> {
  const { useFeedStore } = await import('@/stores/feed')
  const { useUserStore } = await import('@/stores/user')
  const { useMemoriesStore } = await import('@/stores/memories')
  const { generatePostSummary } = await import('@/services/memoryService')

  const feedStore = useFeedStore()
  const userStore = useUserStore()
  const memoriesStore = useMemoriesStore()

  // 檢查 API key
  if (!userStore.apiKey) {
    console.warn('無法摘要貼文：未設定 API key')
    return 0
  }

  // 取得需要摘要的舊貼文
  const oldPosts = feedStore.getUnsummarizedOldPosts(36)

  if (oldPosts.length === 0) {
    return 0
  }

  console.log(`🗂️ 找到 ${oldPosts.length} 則需要摘要的舊貼文`)

  let summarizedCount = 0

  for (const post of oldPosts) {
    try {
      // 收集參與者（原 PO + 所有留言者，排除 user）
      const participantIds = new Set<string>()

      // 原 PO（如果是角色）
      if (post.authorId !== 'user') {
        participantIds.add(post.authorId)
      }

      // 所有留言者（如果是角色）
      for (const comment of post.comments) {
        if (comment.authorId !== 'user') {
          participantIds.add(comment.authorId)
        }
      }

      // 如果沒有角色參與，直接標記為已處理
      if (participantIds.size === 0) {
        feedStore.markPostSummarized(post.id)
        continue
      }

      // 生成摘要
      const summary = await generatePostSummary(
        userStore.apiKey,
        post,
        userStore.profile?.age
      )

      console.log(`📝 貼文摘要：${summary}`)

      // 將摘要存入每個參與者的短期記憶
      for (const characterId of participantIds) {
        const addResult = memoriesStore.addCharacterShortTermMemory(
          characterId,
          summary,
          'auto_feed',
          undefined // 不綁定特定聊天室
        )

        if (addResult) {
          console.log(`  ✅ 已存入角色 ${characterId} 的短期記憶`)
        } else {
          console.log(`  ⚠️ 角色 ${characterId} 的短期記憶已滿，需要先處理`)
        }
      }

      // 標記貼文已摘要
      feedStore.markPostSummarized(post.id)
      summarizedCount++

      // 加入延遲，避免 API 過載
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.error(`摘要貼文 ${post.id} 失敗:`, error)
      // 繼續處理下一則
    }
  }

  console.log(`✨ 已完成 ${summarizedCount} 則貼文的摘要`)
  return summarizedCount
}
