/**
 * Gemini LLM Adapter
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, type GenerativeModel, type Content, type EnhancedGenerateContentResponse } from '@google/generative-ai'
import type {
  LLMAdapter,
  LLMMessage,
  GenerateOptions,
  GenerateResponse,
  ValidateApiKeyResult,
  GetCharacterResponseParams,
  CharacterResponse
} from '../types'
import { ContentBlockedError } from '../types'
import { getModelName, getGeminiModelName } from '../config'
import {
  isAdultConversation,
  getActuallyContent,
  cleanExcessiveQuotes,
  isBlockedError,
  formatErrorMessage,
  BLOCKED_FINISH_REASONS
} from '../utils'
import { generateSystemPrompt, convertToShortIds, convertToLongIds } from '@/utils/chatHelpers'
import { enqueueGeminiRequest } from '@/services/apiQueue'

/**
 * 安全模式的設定（保護未成年人）
 */
const SAFE_MODE_SAFETY_SETTINGS = [
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
 */
const UNRESTRICTED_SAFETY_SETTINGS = [
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
 * 建立 Gemini 模型
 */
export function createGeminiModel(
  apiKey: string,
  options: GenerateOptions = {}
): GenerativeModel {
  const {
    modelType = 'main',
    systemInstruction,
    temperature = 0.7,
    maxOutputTokens = 2048,
    topP,
    topK,
    safeMode = true,
    responseMimeType
  } = options

  const genAI = new GoogleGenerativeAI(apiKey)
  const modelName = getModelName('gemini', modelType)

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
  if (responseMimeType !== undefined) {
    generationConfig.responseMimeType = responseMimeType
  }

  const safetySettings = safeMode
    ? SAFE_MODE_SAFETY_SETTINGS
    : UNRESTRICTED_SAFETY_SETTINGS

  return genAI.getGenerativeModel({
    model: modelName,
    ...(systemInstruction && {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
        role: 'user'
      }
    }),
    safetySettings,
    generationConfig
  })
}

/**
 * 檢查 Gemini 回應是否被封鎖
 */
function checkResponseBlocked(response: any): { reason: string; message: string } | null {
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
 * Gemini Adapter 實作
 */
export class GeminiAdapter implements LLMAdapter {
  readonly provider = 'gemini' as const

  /**
   * 從 userStore 取得 API Key
   */
  private async getApiKey(): Promise<string> {
    const { useUserStore } = await import('@/stores/user')
    const userStore = useUserStore()
    const apiKey = userStore.getApiKey(this.provider)

    if (!apiKey) {
      throw new Error(`請先設定 ${this.provider} 的 API Key`)
    }

    return apiKey
  }

  /**
   * 驗證 API Key
   * 使用 countTokens API（免費）來驗證，不消耗免費額度
   */
  async validateApiKey(apiKey: string): Promise<ValidateApiKeyResult> {
    try {
      if (!apiKey || !apiKey.trim()) {
        return { valid: false, error: 'API Key 不能為空' }
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({
        model: getModelName('gemini', 'lite')
      })

      // 使用 countTokens 來驗證 API Key（免費，不消耗額度）
      const result = await model.countTokens('test')

      // 如果能成功回傳 token 數量，表示 API Key 有效
      if (result && typeof result.totalTokens === 'number') {
        return { valid: true }
      }

      return { valid: false, error: '無法取得回應' }
    } catch (error: any) {
      console.error('API Key 驗證失敗:', error)

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
   * 生成內容（單次請求）
   * API Key 自動從 userStore 取得，或可透過 options.apiKey 傳入
   *
   * @param messages 訊息陣列（最後一條 user 訊息作為 prompt，其餘作為 history）
   * @param options 生成選項
   */
  async generate(
    messages: LLMMessage[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    // 優先使用 options 傳入的 apiKey，否則從 userStore 取得
    const apiKey = options?.apiKey || await this.getApiKey()
    const model = createGeminiModel(apiKey, options)

    // 分離 history 和最後的 prompt
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
    const userPrompt = lastUserIndex >= 0 ? messages[lastUserIndex]?.content || '' : ''
    const historyMessages = lastUserIndex > 0 ? messages.slice(0, lastUserIndex) : []

    // 轉換歷史訊息為 Gemini 格式
    const history: Content[] = historyMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }))

    // 加入 workaround：先加 user prompt，再加假的 model 回應
    history.push({
      role: 'user',
      parts: [{ text: userPrompt }]
    })
    history.push({
      role: 'model',
      parts: [{ text: '好的，我知道了，我已經依據你的說明產生內容，如下：' }]
    })

    const chat = model.startChat({ history })
    const result = await enqueueGeminiRequest(
      () => chat.sendMessage(''),
      getGeminiModelName(options?.modelType === 'lite' ? 'lite' : 'main'),
      options?.queueDescription || '內容生成'
    )

    const response = result.response
    const blocked = checkResponseBlocked(response)

    if (blocked) {
      return {
        text: '',
        raw: response,
        blocked: true,
        blockReason: blocked.reason,
        finishReason: response?.candidates?.[0]?.finishReason
      }
    }

    const text = response.text() ?? ''
    return {
      text: getActuallyContent(text),
      raw: response,
      blocked: false,
      finishReason: response?.candidates?.[0]?.finishReason
    }
  }

  /**
   * 取得角色回應（完整流程）
   * API Key 自動從 userStore 取得
   */
  async getCharacterResponse(params: GetCharacterResponseParams): Promise<CharacterResponse> {
    const { character, user, room, messages, userMessage, context } = params

    try {
      const apiKey = await this.getApiKey()

      // 判斷是否為群聊
      const isGroupChat = room?.type === 'group'
      const useShortIds = isGroupChat && context?.otherCharactersInRoom && context.otherCharactersInRoom.length > 0

      // 判斷是否為成年人對話
      const isAdult = isAdultConversation(user.age, character.age)

      // 產生 system prompt
      const systemPrompt = generateSystemPrompt({
        character,
        user,
        room,
        ...context,
        useShortIds,
        isAdultMode: isAdult
      })

      // 建立模型
      const model = createGeminiModel(apiKey, {
        modelType: 'main',
        systemInstruction: systemPrompt,
        temperature: 0.95,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: character.maxOutputTokens || 2048,
        safeMode: !isAdult
      })

      // 處理對話歷史
      const processedMessages = useShortIds && context?.otherCharactersInRoom
        ? messages.map(msg => ({
            ...msg,
            content: convertToShortIds(msg.content, context.otherCharactersInRoom!)
          }))
        : messages

      let _userMsg = isGroupChat && userMessage.length > 0
        ? "[" + user.nickname + "]: " + userMessage
        : userMessage

      if (useShortIds && context?.otherCharactersInRoom) {
        _userMsg = convertToShortIds(_userMsg, context.otherCharactersInRoom)
      }

      // 取最後 20 條訊息並轉換格式
      let history: Content[] = processedMessages.slice(-20).map(msg => {
        const isUser = msg.senderId === 'user'
        let content = msg.content

        if (isGroupChat) {
          content = `[${msg.senderName}]: ${msg.content}`
        }

        return {
          role: isUser ? 'user' : 'model',
          parts: [{ text: content }]
        }
      })

      // 確保歷史的第一條訊息是 user
      const ensureHistoryStartsWithUser = (hist: Content[]) => {
        if (hist.length > 0 && hist[0]?.role !== 'user') {
          const firstUserIndex = hist.findIndex(msg => msg.role === 'user')
          if (firstUserIndex > 0) {
            return hist.slice(firstUserIndex)
          } else {
            return []
          }
        }
        return hist
      }

      history = ensureHistoryStartsWithUser(history)

      // 發送訊息並檢查回應
      const sendAndCheck = async (chatHistory: Content[], userMsg: string): Promise<{ text: string; response: any }> => {
        const historyWithUserMsg = [...chatHistory]
        historyWithUserMsg.push({
          role: 'user',
          parts: [{ text: userMsg }]
        })
        historyWithUserMsg.push({
          role: 'model',
          parts: [{ text: `[${character.name}]:` }]
        })

        const chat = model.startChat({ history: historyWithUserMsg })

        const result = await enqueueGeminiRequest(
          () => chat.sendMessage(''),
          getGeminiModelName('main'),
          `對話：${character.name}`
        )
        const response = result.response

        const blocked = checkResponseBlocked(response)
        if (blocked) {
          throw new ContentBlockedError(blocked.reason, blocked.message)
        }

        const responseText = response.text() ?? ''
        return { text: responseText, response }
      }

      // 多層降級重試
      let text: string
      let response: any

      try {
        const result = await sendAndCheck(history, _userMsg)
        text = result.text
        response = result.response
      } catch (firstError: any) {
        if (isBlockedError(firstError) && history.length > 0) {
          console.warn('⚠️ 內容被封鎖（完整歷史），嘗試縮短對話歷史重試...')

          try {
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
                const result = await sendAndCheck([], _userMsg)
                text = result.text
                response = result.response
                console.log('✅ 無歷史模式重試成功')
              } catch (thirdError: any) {
                console.error('❌ 三層降級重試均失敗')
                throw thirdError
              }
            } else {
              throw secondError
            }
          }
        } else {
          throw firstError
        }
      }

      // 處理群聊格式
      if (isGroupChat) {
        const characterName = character.name
        const segments: string[] = []
        const tagPattern = /\[([^\]]+)\]:[ ]?/g
        let lastIndex = 0
        let currentSpeaker: string | null = null
        let match: RegExpExecArray | null

        const firstTagMatch = text.match(/^\[([^\]]+)\]:[ ]?/)
        if (!firstTagMatch) {
          currentSpeaker = characterName
        }

        while ((match = tagPattern.exec(text)) !== null) {
          if (lastIndex < match.index && currentSpeaker === characterName) {
            segments.push(text.slice(lastIndex, match.index))
          }
          currentSpeaker = match[1] ?? null
          lastIndex = match.index + match[0].length
        }

        if (lastIndex < text.length && currentSpeaker === characterName) {
          segments.push(text.slice(lastIndex))
        }

        text = segments.join('').trim()
      } else {
        text = text.replace(/^\[.*?\]:[ ]?/gm, '')
      }

      // 將短 ID 轉換回長 ID
      if (useShortIds && context?.otherCharactersInRoom) {
        text = convertToLongIds(text, context.otherCharactersInRoom)
      }

      // 註：@ 標記的處理（過濾無效 ID、去重、處理冗餘名字）
      // 統一在 chatRooms.ts 的 addMessage → cleanMessageMentions 中處理

      // 檢查是否因為 MAX_TOKENS 被截斷
      const finishReasonCheck = response?.candidates?.[0]?.finishReason
      if (finishReasonCheck === 'MAX_TOKENS') {
        console.warn('⚠️ AI 回應因達到 token 上限而被截斷')
        throw new Error('MAX_TOKENS_REACHED')
      }

      // 解析好感度
      const lines = text.trim().split('\n')
      const lastLine = (lines.length > 0 ? lines[lines.length - 1] : '') ?? ''

      // 嘗試從最後一行提取好感度數字
      // 支援格式：「6」、「好感度：6」、「好感度:6」、「好感度: 6」等
      let affectionStr = lastLine.trim()
      const affectionPrefixMatch = affectionStr.match(/^好感度[：:]\s*(-?\d+)$/)
      if (affectionPrefixMatch && affectionPrefixMatch[1]) {
        affectionStr = affectionPrefixMatch[1]
      }
      const parsedAffection = parseInt(affectionStr, 10)

      const checkEmptyResponseAndThrow = (textToCheck: string) => {
        if (textToCheck && textToCheck.length > 0) return

        const blockReason = response?.promptFeedback?.blockReason
        const finishReason = response?.candidates?.[0]?.finishReason

        console.warn('⚠️ AI 回應內容為空，檢查封鎖原因:', { blockReason, finishReason })

        if (blockReason === 'SAFETY' ||
            blockReason === 'PROHIBITED_CONTENT' ||
            finishReason === 'SAFETY' ||
            finishReason === 'PROHIBITED_CONTENT') {
          throw new Error('BLOCKED_BY_SAFETY')
        }

        if (finishReason === 'MAX_TOKENS') {
          throw new Error('MAX_TOKENS_REACHED')
        }

        if (blockReason || finishReason) {
          throw new Error(`BLOCKED: ${blockReason || finishReason}`)
        }

        throw new Error('EMPTY_RESPONSE')
      }

      // 檢查最後一行是否為好感度格式（純數字或「好感度：數字」）
      const isAffectionLine = /^-?\d+$/.test(lastLine.trim()) || affectionPrefixMatch !== null
      if (!isNaN(parsedAffection) && isAffectionLine) {
        let cleanText = lines.slice(0, -1).join('\n').trim()

        if (!cleanText) {
          console.warn('⚠️ AI 只回傳了好感度，無實際對話內容')
          return {
            text: '',
            newAffection: parsedAffection,
            silentUpdate: true
          }
        }

        cleanText = cleanExcessiveQuotes(cleanText)

        return {
          text: cleanText,
          newAffection: parsedAffection
        }
      }

      let finalText = text.trim()
      checkEmptyResponseAndThrow(finalText)

      finalText = cleanExcessiveQuotes(finalText)

      return {
        text: finalText,
        newAffection: undefined
      }
    } catch (error: any) {
      console.error('Gemini API 錯誤:', error)
      throw new Error(formatErrorMessage(error))
    }
  }
}

// 匯出單例
export const geminiAdapter = new GeminiAdapter()

// ============================================
// 獨立工具函數
// ============================================

/**
 * 準備帶有 workaround 的 ChatSession
 *
 * 這個寫法是因應目前版本的 Gemini 在內容審查的過濾器會出現過度不合理的審查，
 * 例如只是在討論做三明治，也被判斷成是不適當的內容。
 *
 * 在 Reddit 的相關討論中，大家發現只要用這種方式寫（先加入假的 model 回應），
 * 就能讓過濾器用應有的方式運作。
 *
 * 考慮到未來 Google 可能會修正這個問題，所以獨立成一個函數，之後就能一次改。
 *
 * @param model Gemini 模型實例
 * @param userPrompt 使用者提示
 * @returns 準備好的 ChatSession（呼叫 sendMessage('') 即可取得回應）
 */
export function prepareGeminiChat(model: GenerativeModel, userPrompt: string) {
  const history: Content[] = []

  history.push({
    role: 'user',
    parts: [{ text: userPrompt }]
  })

  history.push({
    role: 'model',
    parts: [{ text: '好的，我知道了，我已經依據你的說明產生內容，如下：' }]
  })

  return model.startChat({ history })
}

/**
 * 發送 Gemini 請求（繞過過度審查的 workaround）
 *
 * @param userPrompt 使用者提示
 * @param model Gemini 模型實例
 * @returns Gemini 回應
 */
export async function sendGeminiRequest(userPrompt: string, model: GenerativeModel): Promise<EnhancedGenerateContentResponse> {
  const chat = prepareGeminiChat(model, userPrompt)
  return (await chat.sendMessage('')).response
}

/**
 * 發送 Gemini 請求並取得文字回應
 *
 * @param userPrompt 使用者提示
 * @param model Gemini 模型實例
 * @returns 回應文字
 */
export async function sendGeminiRequestText(userPrompt: string, model: GenerativeModel): Promise<string> {
  const response = await sendGeminiRequest(userPrompt, model)
  return (response.text() ?? '').trim()
}
