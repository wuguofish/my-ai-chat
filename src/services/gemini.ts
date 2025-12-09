/**
 * Gemini AI 服務
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, type GenerativeModel, type Content, type EnhancedGenerateContentResponse } from '@google/generative-ai'
import type { Character, Message, UserProfile, ChatRoom } from '@/types'
import { generateSystemPrompt, convertToShortIds, convertToLongIds, type SystemPromptContext } from '@/utils/chatHelpers'

/**
 * 法定成年年齡（大多數國家標準）
 */
const LEGAL_ADULT_AGE = 18

/**
 * 安全模式的設定（保護未成年人）
 * 使用 BLOCK_MEDIUM_AND_ABOVE 過濾中等以上有害內容
 */
export const SAFE_MODE_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
  },
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
  }
]

/**
 * 寬鬆模式的設定（僅限成年人對話）
 * 所有類別都不封鎖，CIVIC_INTEGRITY 使用 BLOCK_ONLY_HIGH
 */
export const UNRESTRICTED_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE
  },
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
  }
]

/**
 * 解析年齡字串，回傳數字
 * 支援格式：「25」、「25歲」、「二十五」等
 * 無法解析或未填寫時回傳 null
 */
function parseAge(ageStr?: string): number | null {
  if (!ageStr || !ageStr.trim()) {
    return null
  }

  // 移除「歲」等後綴
  const cleaned = ageStr.trim().replace(/歲|岁|years?\s*old/gi, '').trim()

  // 嘗試直接解析數字
  const num = parseInt(cleaned, 10)
  if (!isNaN(num) && num > 0 && num < 150) {
    return num
  }

  return null
}

/**
 * 判斷是否為成年人對話情境
 * 只有當玩家和角色都是成年人時才回傳 true
 * 未填寫年齡一律視為未成年
 */
export function isAdultConversation(userAge?: string, characterAge?: string): boolean {
  const userAgeNum = parseAge(userAge)
  const charAgeNum = parseAge(characterAge)

  // 未填寫年齡 → 視為未成年
  if (userAgeNum === null || charAgeNum === null) {
    return false
  }

  // 雙方都必須 >= 18 歲
  return userAgeNum >= LEGAL_ADULT_AGE && charAgeNum >= LEGAL_ADULT_AGE
}

/**
 * 根據年齡取得適當的安全設定
 */
export function getSafetySettings(userAge?: string, characterAge?: string) {
  return isAdultConversation(userAge, characterAge)
    ? UNRESTRICTED_SAFETY_SETTINGS
    : SAFE_MODE_SAFETY_SETTINGS
}

export interface CreateModelOptions {
  model?: 'gemini-2.5-flash' | 'gemini-2.5-flash-lite'
  systemInstruction?: string | { parts: { text: string }[]; role: string }
  temperature?: number
  maxOutputTokens?: number
  topP?: number
  topK?: number
  responseMimeType?: string
  /** 使用安全模式（保護未成年），預設為 true */
  safeMode?: boolean
}

/**
 * 建立 Gemini 模型的共用函數
 * 封裝了安全設定，讓呼叫端只需關心核心參數
 */
export function createGeminiModel(
  apiKey: string,
  options: CreateModelOptions = {}
): GenerativeModel {
  const {
    model = 'gemini-2.5-flash',
    systemInstruction,
    temperature = 0.7,
    maxOutputTokens = 2048,
    topP,
    topK,
    responseMimeType,
    safeMode = true  // 預設使用安全模式
  } = options

  const genAI = new GoogleGenerativeAI(apiKey)

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens
  }

  if (topP !== undefined) {
    generationConfig.topP = topP
  }
  if (topK !== undefined) {
    generationConfig.topK = topK
  }
  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType
  }

  // 根據安全模式選擇適當的設定
  const safetySettings = safeMode
    ? SAFE_MODE_SAFETY_SETTINGS
    : UNRESTRICTED_SAFETY_SETTINGS

  return genAI.getGenerativeModel({
    model,
    ...(systemInstruction && { systemInstruction }),
    safetySettings,
    generationConfig
  })
}

export async function getGeminiResponseText(userPrompt: string, model: GenerativeModel): Promise<string> { 
  let history: Content[] = []

  history.push({
    role: 'user',
    parts: [{ text: userPrompt }]

  })

  history.push({
    role: 'model',
    parts: [{ text: '好的，我知道了，我已經依據你的說明產生內容，如下：' }]
  })

  const chat = model.startChat({ history: history })
  let msg = (await chat.sendMessage('請繼續，已經輸出的內容不必再輸出。')).response.text();

  return getActuallyContent(msg)

}

export async function getGeminiResponse(userPrompt: string, model: GenerativeModel): Promise<EnhancedGenerateContentResponse> {
  let history: Content[] = []

  history.push({
    role: 'user',
    parts: [{ text: userPrompt }]

  })

  history.push({
    role: 'model',
    parts: [{ text: '好的，我知道了，我已經依據你的說明產生內容，如下：' }]
  })

  const chat = model.startChat({ history: history })
  return (await chat.sendMessage('請繼續，已經輸出的內容不必再輸出。')).response;

}

export function getActuallyContent(msg: string): string { 
  // 清理可能的前綴文字（例如「讓我想想⋯⋯「xxx」」）
  // 如果有引號包裹的內容，只取引號內的文字
  const quotedMatch = msg.match(/[「""](.+?)[」""]/)
  if (quotedMatch && quotedMatch[1]) {
    msg = quotedMatch[1]
  }

  return msg
}

export interface GetCharacterResponseParams {
  apiKey: string
  character: Character
  user: UserProfile
  room?: ChatRoom
  messages: Message[]
  userMessage: string
  context?: Partial<SystemPromptContext>
}

export interface CharacterResponse {
  text: string
  newAffection?: number
  silentUpdate?: boolean  // AI 只回傳好感度，無實際對話內容時為 true
}

/**
 * 驗證 API Key 是否有效
 * 使用 countTokens 方法，不會消耗 API 額度
 */
export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    if (!apiKey || !apiKey.trim()) {
      return { valid: false, error: 'API Key 不能為空' }
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // 使用 countTokens 來驗證，不會消耗額度
    await model.countTokens('test')

    return { valid: true }
  } catch (error: any) {
    console.error('API Key 驗證失敗:', error)

    // 根據錯誤類型提供更詳細的訊息
    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('invalid')) {
      return { valid: false, error: 'API Key 無效' }
    } else if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      return { valid: false, error: 'API Key 額度已用盡' }
    } else if (error.message?.includes('permission') || error.message?.includes('PERMISSION_DENIED')) {
      return { valid: false, error: 'API Key 權限不足' }
    } else {
      return { valid: false, error: `驗證失敗：${error.message || '未知錯誤'}` }
    }
  }
}

/**
 * 呼叫 Gemini API 取得角色回應
 */
export async function getCharacterResponse(params: GetCharacterResponseParams): Promise<CharacterResponse> {
  const { apiKey, character, user, room, messages, userMessage, context } = params

  try {
    // 判斷是否為群聊，群聊時使用短 ID
    const isGroupChat = room?.type === 'group'
    const useShortIds = isGroupChat && context?.otherCharactersInRoom && context.otherCharactersInRoom.length > 0

    // 判斷是否為成年人對話（雙方都 >= 18 歲）
    const isAdult = isAdultConversation(user.age, character.age)

    // 產生 system prompt（包含完整情境資訊）
    const systemPrompt = generateSystemPrompt({
      character,
      user,
      room,
      ...context,
      useShortIds,
      isAdultMode: isAdult
    })

    // 建立模型配置
    const model = createGeminiModel(apiKey, {
      model: 'gemini-2.5-flash',
      systemInstruction: {
        parts: [{ text: systemPrompt }],
        role: 'user'
      },
      temperature: 0.95,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: character.maxOutputTokens || 2048,
      safeMode: !isAdult  // 非成年人對話使用安全模式
    })

    // 建立對話歷史
    // 將對話歷史中的長 ID 轉換為短 ID（群聊時）
    const processedMessages = useShortIds && context?.otherCharactersInRoom
      ? messages.map(msg => ({
          ...msg,
          content: convertToShortIds(msg.content, context.otherCharactersInRoom!)
        }))
      : messages

    let _userMsg = isGroupChat && userMessage.length>0 ?
      "["+user.nickname+"]: " + userMessage : userMessage

    // 將使用者訊息也轉換為短 ID
    if (useShortIds && context?.otherCharactersInRoom) {
      _userMsg = convertToShortIds(_userMsg, context.otherCharactersInRoom)
    }

    // 取最後 20 條訊息並轉換格式
    let history = processedMessages.slice(-20).map(msg => {
      const isUser = msg.senderId === 'user'

      // 群聊時需要標註發言者，單人聊天則不需要

      let content = msg.content

      if (isGroupChat) {
        // 在群聊中，所有訊息都需要標註發言者
        content = `[${msg.senderName}]: ${msg.content}`
      }

      return {
        role: isUser ? 'user' : 'model',
        parts: [{ text: content }]
      }
    })

    // 輔助函數：確保歷史的第一條訊息是 user
    const ensureHistoryStartsWithUser = (hist: any[]) => {
      if (hist.length > 0 && hist[0]?.role !== 'user') {
        const firstUserIndex = hist.findIndex(msg => msg.role === 'user')
        if (firstUserIndex > 0) {
          return hist.slice(firstUserIndex)
        } else {
          return [] // 完全沒有 user 訊息，清空歷史
        }
      }
      return hist
    }

    // 確保第一條訊息是 user
    history = ensureHistoryStartsWithUser(history)

    // 建立聊天會話並發送訊息（支援多層降級重試）
    let text: string
    let response: any  // 保存 response 以便後續檢查封鎖原因

    try {
      // 第一次嘗試：使用完整歷史（最多 20 則）
      const chat = model.startChat({ history })
      const result = await chat.sendMessage(_userMsg)
      response = result.response
      text = response.text()
    } catch (firstError: any) {
      // 檢查是否為內容封鎖錯誤
      const isContentBlocked = firstError.message?.includes('PROHIBITED_CONTENT') ||
                               firstError.message?.includes('blocked') ||
                               firstError.message?.includes('SAFETY')

      if (isContentBlocked && history.length > 0) {
        console.warn('⚠️ 內容被封鎖（完整歷史），嘗試縮短對話歷史重試...')

        try {
          // 第二次嘗試：只保留最近 5 則訊息
          let shorterHistory = history.slice(-5)
          shorterHistory = ensureHistoryStartsWithUser(shorterHistory)
          const retryChat = model.startChat({ history: shorterHistory })
          const retryResult = await retryChat.sendMessage(_userMsg)
          response = retryResult.response
          text = response.text()
          console.log('✅ 縮短歷史後重試成功（5 則）')
        } catch (secondError: any) {
          // 第二次也被封鎖，嘗試完全不使用歷史
          const isStillBlocked = secondError.message?.includes('PROHIBITED_CONTENT') ||
                                 secondError.message?.includes('blocked') ||
                                 secondError.message?.includes('SAFETY')

          if (isStillBlocked) {
            console.warn('⚠️ 內容仍被封鎖（短歷史），嘗試無歷史模式...')

            try {
              // 第三次嘗試：完全不使用歷史
              const noHistoryChat = model.startChat({ history: [] })
              const finalResult = await noHistoryChat.sendMessage(_userMsg)
              response = finalResult.response
              text = response.text()
              console.log('✅ 無歷史模式重試成功')
            } catch (thirdError: any) {
              // 三次都失敗，代表當前訊息本身有問題
              console.error('❌ 三層降級重試均失敗，當前訊息可能違反內容政策')
              throw thirdError
            }
          } else {
            // 第二次失敗但不是內容封鎖，拋出原始錯誤
            throw secondError
          }
        }
      } else {
        // 不是內容封鎖錯誤，或沒有歷史可降級，直接拋出
        throw firstError
      }
    }

    // 處理 AI 自作聰明加上的對話格式問題（群聊時）
    // 情況 1：AI 幻想出其他角色的對話（換行分隔），例如：
    //   「[楊竣宇]: 大家午安。\n[趙書煜]: 午安啊竣宇。」
    // 情況 2：AI 幻想出其他角色的對話（同一行內），例如：
    //   「[楊竣宇]: 內容...[趙書煜]: 內容...」
    // 情況 3：只是單純加上自己的前綴，例如：
    //   「[楊竣宇]: 大家午安」
    // 解決方案：移除所有其他角色的對話，只保留當前角色的內容
    if (isGroupChat) {
      const characterName = character.name

      // 先處理「從其他角色開始到下一個標記或結尾」的部分
      // 使用正則找出所有 [角色名]: 的位置，只保留當前角色的內容
      const segments: string[] = []

      // 使用正則分割：找出所有 [xxx]: 標記
      const tagPattern = /\[([^\]]+)\]:[ ]?/g
      let lastIndex = 0
      let currentSpeaker: string | null = null
      let match: RegExpExecArray | null

      // 檢查開頭是否有 [角色名]: 標記
      const firstTagMatch = text.match(/^\[([^\]]+)\]:[ ]?/)
      if (!firstTagMatch) {
        // 開頭沒有標記，假設是當前角色在說話
        currentSpeaker = characterName
      }

      while ((match = tagPattern.exec(text)) !== null) {
        // 如果之前有內容，且是當前角色說的，加入 segments
        if (lastIndex < match.index && currentSpeaker === characterName) {
          segments.push(text.slice(lastIndex, match.index))
        }

        // 更新當前說話者
        currentSpeaker = match[1] ?? null
        lastIndex = match.index + match[0].length
      }

      // 處理最後一段內容
      if (lastIndex < text.length && currentSpeaker === characterName) {
        segments.push(text.slice(lastIndex))
      }

      text = segments.join('').trim()
    } else {
      // 單人聊天：只需移除自己名字的前綴
      text = text.replace(/^\[.*?\]:[ ]?/gm, '')
    }

    // 將短 ID 轉換回長 ID（群聊時）
    if (useShortIds && context?.otherCharactersInRoom) {
      text = convertToLongIds(text, context.otherCharactersInRoom)
    }

    // 過濾無效的 @ 標記（群聊時）
    if (isGroupChat && context?.otherCharactersInRoom) {
      // 建立有效 ID 集合
      const validIds = new Set<string>()
      validIds.add('user') // 使用者
      validIds.add('all')  // @all
      context.otherCharactersInRoom.forEach(char => {
        validIds.add(char.id)
      })

      // 找出所有 @ 標記
      const atPattern = /@([a-zA-Z0-9\-]+)/g
      text = text.replace(atPattern, (match, id) => {
        // 如果 ID 有效，保留；否則移除整個 @ 標記
        return validIds.has(id) ? match : ''
      })
    }

    // 檢查是否因為 MAX_TOKENS 被截斷（有內容但不完整）
    const finishReasonCheck = response?.candidates?.[0]?.finishReason
    if (finishReasonCheck === 'MAX_TOKENS') {
      console.warn('⚠️ AI 回應因達到 token 上限而被截斷')
      throw new Error('MAX_TOKENS_REACHED')
    }

    // 解析好感度（從最後一行提取）
    const lines = text.trim().split('\n')
    const lastLine = (lines.length > 0 ? lines[lines.length - 1] : '') ?? ''
    const parsedAffection = parseInt(lastLine.trim(), 10)

    // 輔助函數：檢查 response 並拋出適當的錯誤（空回應時使用）
    const checkEmptyResponseAndThrow = (textToCheck: string) => {
      if (textToCheck && textToCheck.length > 0) return // 有內容，不需要處理

      // 從 response 中取得封鎖原因
      const blockReason = response?.promptFeedback?.blockReason
      const finishReason = response?.candidates?.[0]?.finishReason
      const safetyRatings = response?.candidates?.[0]?.safetyRatings

      console.warn('⚠️ AI 回應內容為空，檢查封鎖原因:', {
        blockReason,
        finishReason,
        safetyRatings
      })

      // 判斷是否為安全性封鎖
      if (blockReason === 'SAFETY' ||
          blockReason === 'PROHIBITED_CONTENT' ||
          finishReason === 'SAFETY' ||
          finishReason === 'PROHIBITED_CONTENT') {
        throw new Error('BLOCKED_BY_SAFETY')
      }

      // 判斷是否為 token 上限
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('MAX_TOKENS_REACHED')
      }

      // 其他情況（可能是額度用盡等）
      if (blockReason || finishReason) {
        throw new Error(`BLOCKED: ${blockReason || finishReason}`)
      }

      // 沒有明確原因的空回應
      throw new Error('EMPTY_RESPONSE')
    }

    // 如果最後一行是有效的數字，且該行只有數字（沒有其他文字，允許負號）
    const isOnlyNumber = /^-?\d+$/.test(lastLine.trim())
    if (!isNaN(parsedAffection) && isOnlyNumber) {
      // 移除最後一行的數字，保留對話內容
      const cleanText = lines.slice(0, -1).join('\n').trim()

      // 如果移除數字後變成空字串，代表 AI 只回傳了好感度
      // 這種情況下靜默更新好感度，不顯示訊息
      if (!cleanText) {
        console.warn('⚠️ AI 只回傳了好感度，無實際對話內容，靜默更新好感度')
        return {
          text: '',  // 空字串，呼叫端會判斷是否要顯示
          newAffection: parsedAffection,
          silentUpdate: true  // 標記為靜默更新
        }
      }

      return {
        text: cleanText,
        newAffection: parsedAffection
      }
    }

    // 如果解析失敗，就回傳原文，不更新好感度
    // 但要先檢查是否為空
    const finalText = text.trim()
    checkEmptyResponseAndThrow(finalText)

    return {
      text: finalText,
      newAffection: undefined
    }
  } catch (error: any) {
    console.error('Gemini API 錯誤:', error)

    // 檢查是否為內容被封鎖的錯誤
    if (error.message?.includes('PROHIBITED_CONTENT') ||
        error.message?.includes('blocked') ||
        error.message?.includes('BLOCKED_BY_SAFETY') ||
        error.message?.includes('SAFETY')) {
      throw new Error('回應因違反 Gemini API 內容政策而被封鎖。請嘗試調整對話內容或角色設定。')
    }

    // 檢查是否為空回應（沒有明確封鎖原因）
    if (error.message === 'EMPTY_RESPONSE') {
      throw new Error('AI 回應內容為空，請稍後再試。')
    }

    // 檢查是否為 token 上限問題
    if (error.message === 'MAX_TOKENS_REACHED') {
      throw new Error('AI 回應因達到 token 上限而被截斷。請到好友的「進階設定」中調高「最大輸出 Token 數」（建議 2048 以上）。')
    }

    // 檢查是否有其他封鎖原因（從 response 取得）
    if (error.message?.startsWith('BLOCKED:')) {
      const reason = error.message.replace('BLOCKED:', '').trim()
      throw new Error(`AI 回應被封鎖（${reason}），請稍後再試或調整對話內容。`)
    }

    // 檢查是否為額度用盡
    if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('API 額度已用盡，請稍後再試或檢查您的 Gemini API 配額。')
    }

    // 檢查是否為 API Key 無效
    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('invalid')) {
      throw new Error('API Key 無效，請檢查您的設定。')
    }

    // 其他未知錯誤
    throw new Error(`無法取得 AI 回應：${error.message || '未知錯誤'}`)
  }
}
