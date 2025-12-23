/**
 * Gemini AI 服務
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, type GenerativeModel, type Content, type EnhancedGenerateContentResponse } from '@google/generative-ai'
import type { Character, Message, UserProfile, ChatRoom } from '@/types'
import { generateSystemPrompt, convertToShortIds, convertToLongIds, type SystemPromptContext } from '@/utils/chatHelpers'
import { enqueueGeminiRequest } from './apiQueue'

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

  let msg = (await getGeminiResponse(userPrompt, model)).text().trim()
  let processedMsg = getActuallyContent(msg)

  return processedMsg

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
  return (await chat.sendMessage('')).response;

}

export function getActuallyContent(msg: string): string {
  // 清理可能的前綴文字（例如「讓我想想⋯⋯「xxx」」）
  // 只有當「整個訊息被單一引號包住」時才取引號內的文字
  // 避免誤判回覆中本身就包含多個引號的情況
  let _msg = msg.trim()

  // 檢查是否整個訊息被引號包住（開頭是引號，結尾是引號）
  // 或者是「前綴文字「內容」」的格式（結尾是引號，且只有一對引號）
  const quotePairs: Array<[string, string]> = [['「', '」'], ['"', '"'], ['"', '"']]

  // 情況1：整個訊息被引號包住
  for (const [openQuote, closeQuote] of quotePairs) {
    if (_msg.startsWith(openQuote) && _msg.endsWith(closeQuote)) {
      // 確認中間沒有其他同類型的引號對（避免「A」B「C」這種情況）
      const inner = _msg.slice(1, -1)
      const hasNestedQuotes = inner.includes(openQuote) && inner.includes(closeQuote)
      if (!hasNestedQuotes) {
        return inner
      }
    }
  }

  // 情況2：前綴文字 + 引號包住的內容（例如「讓我想想...「實際內容」」）
  // 只有當訊息以引號結尾，且只有一對引號時才處理
  for (const [openQuote, closeQuote] of quotePairs) {
    if (_msg.endsWith(closeQuote)) {
      const openIndex = _msg.indexOf(openQuote)
      const closeIndex = _msg.lastIndexOf(closeQuote)

      // 確認有開始引號，且開始引號不在開頭（有前綴）
      if (openIndex > 0 && closeIndex > openIndex) {
        const quotedContent = _msg.slice(openIndex + 1, closeIndex)

        // 確認引號內沒有其他同類型的引號（表示這是唯一一對）
        if (!quotedContent.includes(openQuote) && !quotedContent.includes(closeQuote)) {
          // 額外確認：引號內的內容應該佔原文的大部分
          if (quotedContent.length >= _msg.length * 0.7) {
            return quotedContent
          }
        }
      }
    }
  }

  return _msg
}

/**
 * 清理 Gemini 濫用的引號（『』和「」）
 * Gemini 常常用引號來「強調」詞彙，但這不符合中文習慣且影響閱讀體驗
 * 這個函數會移除用於強調的引號，但保留用於引述的引號
 *
 * 判斷邏輯：
 * - 如果引號內的文字很短（≤10字）且不是完整句子 → 移除引號
 * - 如果引號內是完整的句子（有句號、問號等） → 保留引號
 * - 如果引號內超過 10 個字 → 保留引號（可能是引述）
 *
 * 注意：動作描述中的「」不會被處理（因為那是對話格式的一部分）
 */
export function cleanExcessiveQuotes(text: string): string {
  // 輔助函數：判斷是否應該保留引號
  const shouldKeepQuotes = (content: string): boolean => {
    // 如果內容包含句號、問號、驚嘆號，可能是引述完整句子，保留
    if (/[。？！?!]/.test(content)) {
      return true
    }
    // 如果內容超過 10 個字，可能是引述，保留
    if (content.length > 10) {
      return true
    }
    return false
  }

  // 先處理『』（這個幾乎都是濫用）
  let result = text.replace(/『([^『』]+)』/g, (match, content) => {
    return shouldKeepQuotes(content) ? match : content
  })

  // 再處理「」，但要小心不要影響對話格式
  // 對話格式的「」通常在行首或 *動作* 之後
  // 我們只處理在句子中間、用於強調詞彙的「」
  result = result.replace(/「([^「」]+)」/g, (match, content, offset) => {
    // 檢查是否在行首（可能是對話）
    const beforeMatch = result.substring(0, offset)
    const lastNewline = beforeMatch.lastIndexOf('\n')
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1
    const textBeforeOnLine = result.substring(lineStart, offset).trim()

    // 如果這個「」在行首或 * 之後，可能是對話，保留
    if (textBeforeOnLine === '' || textBeforeOnLine.endsWith('*')) {
      return match
    }

    // 如果引號內容應該保留，保留
    if (shouldKeepQuotes(content)) {
      return match
    }

    // 否則移除引號
    return content
  })

  return result
}

/**
 * 被封鎖的 finishReason 類型
 */
const BLOCKED_FINISH_REASONS = [
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SAFETY',
  'OTHER'  // 'OTHER' 有時也代表被封鎖
]

/**
 * 檢查 Gemini 回應是否被內容過濾封鎖
 * 即使 API 沒有拋出錯誤，回應也可能因為內容政策被封鎖
 *
 * @param response - Gemini API 回應物件
 * @returns 封鎖資訊，如果沒有被封鎖則回傳 null
 */
export function checkResponseBlocked(response: any): { reason: string; message: string } | null {
  // 檢查 promptFeedback（輸入被封鎖）
  const promptBlockReason = response?.promptFeedback?.blockReason
  if (promptBlockReason) {
    return {
      reason: promptBlockReason,
      message: `輸入內容被封鎖: ${promptBlockReason}`
    }
  }

  // 檢查 candidates[0].finishReason（輸出被封鎖）
  const finishReason = response?.candidates?.[0]?.finishReason
  if (finishReason && BLOCKED_FINISH_REASONS.includes(finishReason)) {
    // 確認是否真的沒有內容（有時候 finishReason 是 'OTHER' 但仍有部分內容）
    const hasContent = response?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!hasContent) {
      return {
        reason: finishReason,
        message: `回應被封鎖: ${finishReason}`
      }
    }
  }

  return null
}

/**
 * 自訂錯誤類別：內容被封鎖
 */
export class ContentBlockedError extends Error {
  reason: string

  constructor(reason: string, message: string) {
    super(message)
    this.name = 'ContentBlockedError'
    this.reason = reason
  }
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
 * 會發送一個極短的測試請求來確認生成功能正常運作
 * 注意：驗證請求會進入佇列排隊
 */
export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    if (!apiKey || !apiKey.trim()) {
      return { valid: false, error: 'API Key 不能為空' }
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        maxOutputTokens: 5  // 極短的回應，減少額度消耗
      }
    })

    // 發送一個真實的生成請求來驗證（透過佇列）
    // 這樣可以確保不只是 API Key 有效，連生成額度也是正常的
    const result = await enqueueGeminiRequest(
      () => model.generateContent('回覆 OK'),
      'gemini-2.5-flash',
      'API Key 驗證'
    )
    const response = result.response

    // 檢查是否有有效回應
    if (!response || !response.text()) {
      return { valid: false, error: '無法取得回應' }
    }

    return { valid: true }
  } catch (error: any) {
    console.error('API Key 驗證失敗:', error)

    // 根據錯誤類型提供更詳細的訊息
    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('invalid')) {
      return { valid: false, error: 'API Key 無效' }
    } else if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      return { valid: false, error: 'API 額度已用盡，請稍後再試或至 Google AI Studio 查看配額' }
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

    // 輔助函數：發送訊息並檢查回應是否被封鎖
    const sendAndCheck = async (chatHistory: Content[], userMsg: string): Promise<{ text: string; response: any }> => {
      history.push({
        role: 'user',
        parts: [{ text: userMsg }]
      })
      history.push({
        role: 'model',
        parts: [{ text: `[${character.name}]:` }]
      })
      const chat = model.startChat({ history: chatHistory })

      // 透過佇列發送請求，避免超過 RPM 限制
      const result = await enqueueGeminiRequest(
        () => chat.sendMessage(''),
        'gemini-2.5-flash',
        `對話：${character.name}`
      )
      const response = result.response

      // 檢查回應是否被封鎖（即使 API 沒有拋出錯誤）
      const blocked = checkResponseBlocked(response)
      if (blocked) {
        throw new ContentBlockedError(blocked.reason, blocked.message)
      }

      // 確保 text 是字串，避免 response.text() 返回 undefined 時的 .trim() 錯誤
      const responseText = response.text() ?? ''
      return { text: responseText, response }
    }

    // 輔助函數：檢查錯誤是否為內容封鎖
    const isBlockedError = (error: any): boolean => {
      return error instanceof ContentBlockedError ||
             error.message?.includes('PROHIBITED_CONTENT') ||
             error.message?.includes('blocked') ||
             error.message?.includes('SAFETY')
    }

    // 建立聊天會話並發送訊息（支援多層降級重試）
    let text: string
    let response: any  // 保存 response 以便後續檢查封鎖原因

    try {
      // 第一次嘗試：使用完整歷史（最多 20 則）
      const result = await sendAndCheck(history, _userMsg)
      text = result.text
      response = result.response
    } catch (firstError: any) {
      if (isBlockedError(firstError) && history.length > 0) {
        console.warn('⚠️ 內容被封鎖（完整歷史），嘗試縮短對話歷史重試...')

        try {
          // 第二次嘗試：只保留最近 5 則訊息
          let shorterHistory = history.slice(-5)
          shorterHistory = ensureHistoryStartsWithUser(shorterHistory)
          const result = await sendAndCheck(shorterHistory, _userMsg)
          text = result.text
          response = result.response
          console.log('✅ 縮短歷史後重試成功（5 則）')
        } catch (secondError: any) {
          if (isBlockedError(secondError)) {
            console.warn('⚠️ 內容仍被封鎖（短歷史），嘗試無歷史模式...')

            try {
              // 第三次嘗試：完全不使用歷史
              const result = await sendAndCheck([], _userMsg)
              text = result.text
              response = result.response
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
      let cleanText = lines.slice(0, -1).join('\n').trim()

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

      // 清理濫用的『』引號
      cleanText = cleanExcessiveQuotes(cleanText)

      return {
        text: cleanText,
        newAffection: parsedAffection
      }
    }

    // 如果解析失敗，就回傳原文，不更新好感度
    // 但要先檢查是否為空
    let finalText = text.trim()
    checkEmptyResponseAndThrow(finalText)

    // 清理濫用的『』引號
    finalText = cleanExcessiveQuotes(finalText)

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
      throw new Error('回應因違反 Gemini API 內容政策而被封鎖。請嘗試調整對話內容、角色記憶或角色設定。')
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
