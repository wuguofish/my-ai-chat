/**
 * OpenAI LLM Adapter
 * 使用 OpenAI 官方 SDK
 */

import OpenAI from 'openai'
import type {
  LLMAdapter,
  LLMMessage,
  LLMMessageContent,
  GenerateOptions,
  GenerateResponse,
  ValidateApiKeyResult,
  GetCharacterResponseParams,
  CharacterResponse
} from '../types'
import { ContentBlockedError } from '../types'
import { getModelName } from '../config'
import {
  isAdultConversation,
  getActuallyContent,
  formatErrorMessage
} from '../utils'
import { enqueueOpenAIRequest } from '@/services/apiQueue'
import { generateSystemPrompt, convertToShortIds, convertToLongIds } from '@/utils/chatHelpers'
import { imageAttachmentToLLMFormat } from '@/utils/imageHelpers'
import type { ImageAttachment } from '@/types'

/**
 * OpenAI API 內容區塊類型
 */
type OpenAIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

/**
 * 將 LLMMessageContent 轉換為 OpenAI 內容格式
 */
function convertToOpenAIContent(content: LLMMessageContent): string | OpenAIContentBlock[] {
  if (typeof content === 'string') {
    return content
  }

  return content.map(item => {
    if (item.type === 'text') {
      return { type: 'text' as const, text: item.text }
    }
    // 圖片：OpenAI 需要完整的 data URL
    return {
      type: 'image_url' as const,
      image_url: {
        url: `data:${item.mimeType};base64,${item.data}`,
        detail: 'auto' as const
      }
    }
  })
}

/**
 * 建立包含圖片的 OpenAI 內容
 */
function buildOpenAIContentWithImages(text: string, images?: ImageAttachment[]): string | OpenAIContentBlock[] {
  if (!images || images.length === 0) {
    return text
  }

  const blocks: OpenAIContentBlock[] = []

  // 先加入圖片
  for (const img of images) {
    const { mimeType, data } = imageAttachmentToLLMFormat(img)
    blocks.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${data}`,
        detail: 'auto'
      }
    })
  }

  // 再加入文字
  if (text) {
    blocks.push({ type: 'text', text })
  }

  return blocks
}

/**
 * 檢查 OpenAI 回應是否被封鎖
 */
function checkResponseBlocked(response: OpenAI.Chat.Completions.ChatCompletion): { reason: string; message: string } | null {
  // 檢查是否有內容
  if (!response.choices || response.choices.length === 0) {
    return {
      reason: 'EMPTY_RESPONSE',
      message: '回應內容為空'
    }
  }

  const choice = response.choices[0]

  // 檢查 finish_reason
  if (choice?.finish_reason === 'content_filter') {
    return {
      reason: 'CONTENT_FILTER',
      message: '內容因違反安全政策被過濾'
    }
  }

  // 檢查是否有 refusal（GPT-4 以上模型支援）
  const message = choice?.message
  if (message && 'refusal' in message && message.refusal) {
    return {
      reason: 'REFUSAL',
      message: message.refusal as string
    }
  }

  // 檢查內容是否為空
  if (!message?.content) {
    return {
      reason: 'EMPTY_CONTENT',
      message: '回應內容為空'
    }
  }

  return null
}

/**
 * 從 OpenAI 回應中提取文字
 */
function extractTextFromResponse(response: OpenAI.Chat.Completions.ChatCompletion): string {
  if (!response.choices || response.choices.length === 0) {
    return ''
  }

  return response.choices[0]?.message?.content || ''
}

/**
 * OpenAI Adapter 實作
 *
 * 注意：OpenAI API 不需要特別的訊息正規化
 * - 不要求第一則必須是 user
 * - 允許連續相同角色的訊息
 */
export class OpenAIAdapter implements LLMAdapter {
  readonly provider = 'openai' as const

  /**
   * 建立 OpenAI 客戶端
   */
  private createClient(apiKey: string): OpenAI {
    return new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true  // 前端環境需要此設定
    })
  }

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
   * 使用 models.list API 來驗證，這是最輕量的驗證方式
   */
  async validateApiKey(apiKey: string): Promise<ValidateApiKeyResult> {
    try {
      if (!apiKey || !apiKey.trim()) {
        return { valid: false, error: 'API Key 不能為空' }
      }

      const client = this.createClient(apiKey)

      // 使用 models.list 來驗證 API Key
      // 這是最輕量的方式，不消耗 tokens
      const response = await client.models.list()

      // 如果能成功回傳模型列表，表示 API Key 有效
      if (response && response.data) {
        return { valid: true }
      }

      return { valid: false, error: '無法取得回應' }
    } catch (error: any) {
      console.error('OpenAI API Key 驗證失敗:', error)

      if (error instanceof OpenAI.APIError) {
        const status = error.status
        const message = error.message || ''

        if (status === 401 || message.includes('invalid_api_key') || message.includes('Incorrect API key')) {
          return { valid: false, error: 'API Key 無效' }
        } else if (status === 429) {
          return { valid: false, error: 'API 請求過於頻繁，請稍後再試' }
        } else if (status === 403) {
          return { valid: false, error: 'API Key 權限不足' }
        } else if (status === 500 || status === 503) {
          return { valid: false, error: 'OpenAI 服務目前不可用，請稍後再試' }
        } else {
          return { valid: false, error: `驗證失敗：${message || '未知錯誤'}` }
        }
      }

      return { valid: false, error: `驗證失敗：${error.message || '未知錯誤'}` }
    }
  }

  /**
   * 生成內容（單次請求）
   * API Key 自動從 userStore 取得，或可透過 options.apiKey 傳入
   */
  async generate(
    messages: LLMMessage[],
    options?: GenerateOptions
  ): Promise<GenerateResponse> {
    const {
      modelType = 'main',
      systemInstruction,
      temperature = 0.7,
      maxOutputTokens = 2048,
      topP,
      apiKey: optionsApiKey,
      queueDescription
    } = options || {}

    // 優先使用 options 傳入的 apiKey，否則從 userStore 取得
    const apiKey = optionsApiKey || await this.getApiKey()
    const client = this.createClient(apiKey)
    const modelName = getModelName('openai', modelType)

    // 建立訊息陣列（支援多模態）
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

    // 加入 system 訊息
    if (systemInstruction) {
      openaiMessages.push({ role: 'system', content: systemInstruction })
    }

    // 轉換訊息格式並加入（支援多模態）
    for (const msg of messages) {
      const content = convertToOpenAIContent(msg.content)
      if (msg.role === 'user') {
        openaiMessages.push({ role: 'user', content })
      } else if (msg.role === 'assistant') {
        // assistant 只支援純文字
        openaiMessages.push({
          role: 'assistant',
          content: typeof content === 'string' ? content : content.filter(c => c.type === 'text').map(c => (c as { type: 'text'; text: string }).text).join('')
        })
      } else if (msg.role === 'system') {
        openaiMessages.push({
          role: 'system',
          content: typeof content === 'string' ? content : content.filter(c => c.type === 'text').map(c => (c as { type: 'text'; text: string }).text).join('')
        })
      }
    }

    const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: modelName,
      max_tokens: maxOutputTokens,
      messages: openaiMessages,
      temperature
    }

    if (topP !== undefined) {
      createParams.top_p = topP
    }

    // 透過佇列發送請求，避免超過 rate limit
    const response = await enqueueOpenAIRequest<OpenAI.Chat.Completions.ChatCompletion>(
      () => client.chat.completions.create(createParams),
      modelType === 'lite' ? 'lite' : 'main',
      queueDescription || '內容生成'
    )

    const blocked = checkResponseBlocked(response)
    if (blocked) {
      return {
        text: '',
        raw: response,
        blocked: true,
        blockReason: blocked.reason,
        finishReason: response.choices[0]?.finish_reason || undefined
      }
    }

    const text = extractTextFromResponse(response)
    return {
      text: getActuallyContent(text),
      raw: response,
      blocked: false,
      finishReason: response.choices[0]?.finish_reason || undefined
    }
  }

  /**
   * 取得角色回應（完整流程）
   * API Key 自動從 userStore 取得
   */
  async getCharacterResponse(params: GetCharacterResponseParams): Promise<CharacterResponse> {
    const { character, user, room, messages, userMessage, userImages, context } = params

    try {
      const apiKey = await this.getApiKey()
      const client = this.createClient(apiKey)

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

      // 轉換歷史訊息為 OpenAI 格式
      const historyMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = processedMessages.slice(-20).map(msg => {
        const isUser = msg.senderId === 'user'
        let content = msg.content

        if (isGroupChat) {
          content = `[${msg.senderName}]: ${msg.content}`
        }

        if (isUser) {
          return { role: 'user' as const, content }
        }
        return { role: 'assistant' as const, content }
      })

      // 加入使用者訊息（可能包含圖片）
      if (_userMsg || (userImages && userImages.length > 0)) {
        const userContent = buildOpenAIContentWithImages(_userMsg, userImages)
        historyMessages.push({ role: 'user', content: userContent })
      }

      // 發送請求（透過佇列）
      const sendAndCheck = async (chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<{ text: string; response: OpenAI.Chat.Completions.ChatCompletion }> => {
        const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
          model: getModelName('openai', 'main'),
          max_tokens: character.maxOutputTokens || 2048,
          messages: [
            { role: 'system', content: systemPrompt },
            ...chatMessages
          ],
          temperature: 0.95,
          top_p: 0.9
        }

        // 透過佇列發送請求，避免超過 rate limit
        const response = await enqueueOpenAIRequest(
          () => client.chat.completions.create(createParams),
          'main',
          `角色對話：${character.name}`
        )

        const blocked = checkResponseBlocked(response)
        if (blocked) {
          throw new ContentBlockedError(blocked.reason, blocked.message)
        }

        const responseText = extractTextFromResponse(response)
        return { text: responseText, response }
      }

      // 多層降級重試
      let text: string
      let response: OpenAI.Chat.Completions.ChatCompletion

      try {
        const result = await sendAndCheck(historyMessages)
        text = result.text
        response = result.response
      } catch (firstError: any) {
        if (firstError instanceof ContentBlockedError && historyMessages.length > 2) {
          console.warn('⚠️ 內容被封鎖（完整歷史），嘗試縮短對話歷史重試...')

          try {
            // 縮短到最後 3 條訊息
            const shorterMessages = historyMessages.slice(-3)

            const result = await sendAndCheck(shorterMessages)
            text = result.text
            response = result.response
            console.log('✅ 縮短歷史後重試成功')
          } catch (secondError: any) {
            if (secondError instanceof ContentBlockedError) {
              console.warn('⚠️ 內容仍被封鎖，嘗試無歷史模式...')

              try {
                const lastUserMsg = historyMessages.filter(m => m.role === 'user').pop()
                const result = await sendAndCheck([
                  { role: 'user', content: lastUserMsg?.content || '請開始對話' }
                ])
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

      // 處理群聊格式（移除非該角色的發言）
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
        // 私聊：移除開頭的角色標籤
        text = text.replace(/^\[.*?\]:[ ]?/gm, '')
      }

      // 將短 ID 轉換回長 ID
      if (useShortIds && context?.otherCharactersInRoom) {
        text = convertToLongIds(text, context.otherCharactersInRoom)
      }

      // 檢查是否因為 max_tokens 被截斷
      const finishReason = response.choices[0]?.finish_reason
      if (finishReason === 'length') {
        console.warn('⚠️ AI 回應因達到 token 上限而被截斷')
        throw new Error('MAX_TOKENS_REACHED')
      }

      // 解析好感度
      const lines = text.trim().split('\n')
      const lastLine = (lines.length > 0 ? lines[lines.length - 1] : '') ?? ''

      // 嘗試從最後一行提取好感度數字
      let affectionStr = lastLine.trim()
      const affectionPrefixMatch = affectionStr.match(/^好感度[：:]\s*(-?\d+)$/)
      if (affectionPrefixMatch && affectionPrefixMatch[1]) {
        affectionStr = affectionPrefixMatch[1]
      }
      const parsedAffection = parseInt(affectionStr, 10)

      const checkEmptyResponseAndThrow = (textToCheck: string) => {
        if (textToCheck && textToCheck.length > 0) return

        console.warn('⚠️ AI 回應內容為空')
        throw new Error('EMPTY_RESPONSE')
      }

      // 檢查最後一行是否為好感度格式
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

        return {
          text: cleanText,
          newAffection: parsedAffection
        }
      }

      let finalText = text.trim()
      checkEmptyResponseAndThrow(finalText)


      return {
        text: finalText,
        newAffection: undefined
      }
    } catch (error: any) {
      console.error('OpenAI API 錯誤:', error)
      throw new Error(formatErrorMessage(error))
    }
  }
}

// 匯出單例
export const openaiAdapter = new OpenAIAdapter()
