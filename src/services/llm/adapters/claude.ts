/**
 * Claude LLM Adapter
 * 使用 Anthropic 官方 SDK
 */

import Anthropic from '@anthropic-ai/sdk'
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
import { enqueueClaudeRequest } from '@/services/apiQueue'
import { generateSystemPrompt, convertToShortIds, convertToLongIds } from '@/utils/chatHelpers'
import { imageAttachmentToLLMFormat } from '@/utils/imageHelpers'
import type { ImageAttachment } from '@/types'

/**
 * Claude 支援的圖片 MIME 類型
 */
type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

/**
 * Claude API 內容區塊類型
 */
type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: ClaudeImageMediaType; data: string } }

/**
 * Claude API 訊息格式（支援多模態）
 */
type ClaudeMessage = {
  role: 'user' | 'assistant'
  content: string | ClaudeContentBlock[]
}

/**
 * 將 LLMMessageContent 轉換為 Claude 內容格式
 */
function convertToClaudeContent(content: LLMMessageContent): string | ClaudeContentBlock[] {
  if (typeof content === 'string') {
    return content
  }

  return content.map(item => {
    if (item.type === 'text') {
      return { type: 'text' as const, text: item.text }
    }
    // 圖片
    return {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: item.mimeType as ClaudeImageMediaType,
        data: item.data
      }
    }
  })
}

/**
 * 建立包含圖片的 Claude 內容
 */
function buildClaudeContentWithImages(text: string, images?: ImageAttachment[]): string | ClaudeContentBlock[] {
  if (!images || images.length === 0) {
    return text
  }

  const blocks: ClaudeContentBlock[] = []

  // 先加入圖片
  for (const img of images) {
    const { mimeType, data } = imageAttachmentToLLMFormat(img)
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType as ClaudeImageMediaType,
        data
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
 * 檢查 Claude 回應是否被封鎖
 */
function checkResponseBlocked(response: Anthropic.Message): { reason: string; message: string } | null {
  // 檢查是否有內容
  if (!response.content || response.content.length === 0) {
    return {
      reason: 'EMPTY_RESPONSE',
      message: '回應內容為空'
    }
  }

  return null
}

/**
 * 從 Claude 回應中提取文字
 */
function extractTextFromResponse(response: Anthropic.Message): string {
  if (!response.content || response.content.length === 0) {
    return ''
  }

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/**
 * 確保訊息序列符合 Claude API 要求：
 * 1. 第一條訊息必須是 user
 * 2. user 和 assistant 必須交替出現
 *
 * @param messages 原始訊息陣列
 * @param insertPlaceholder 是否在連續 assistant 之間插入假 user 訊息（群聊模式）
 */
function normalizeMessages(messages: ClaudeMessage[], insertPlaceholder = false): ClaudeMessage[] {
  if (messages.length === 0) {
    return [{ role: 'user', content: '請開始' }]
  }

  // 確保第一條訊息是 user（刪掉前面的 assistant 訊息，省 token）
  let startIndex = 0
  if (messages[0]?.role !== 'user') {
    const firstUserIndex = messages.findIndex(msg => msg.role === 'user')
    if (firstUserIndex > 0) {
      startIndex = firstUserIndex
    } else {
      // 完全沒有 user 訊息，回傳預設
      return [{ role: 'user', content: '請開始' }]
    }
  }

  const result: ClaudeMessage[] = []

  for (let i = startIndex; i < messages.length; i++) {
    const msg = messages[i]!
    const lastMsg = result[result.length - 1]

    if (!lastMsg) {
      // 第一條訊息（已確保是 user）
      result.push({ ...msg })
    } else if (lastMsg.role === msg.role) {
      if (msg.role === 'assistant' && insertPlaceholder) {
        // 群聊模式：在連續 assistant 之間插入假 user 訊息
        // 這樣 AI 就不會誤以為自己要同時扮演多個角色
        result.push({ role: 'user', content: '（對話繼續）' })
        result.push({ ...msg })
      } else {
        // 一般模式：合併連續相同角色的內容
        // 如果任一方是多模態內容，插入 placeholder 而不是合併
        if (typeof lastMsg.content !== 'string' || typeof msg.content !== 'string') {
          result.push({ role: lastMsg.role === 'user' ? 'assistant' : 'user', content: '（繼續）' })
          result.push({ ...msg })
        } else {
          lastMsg.content += '\n\n' + msg.content
        }
      }
    } else {
      result.push({ ...msg })
    }
  }

  return result
}

/**
 * Claude Adapter 實作
 */
export class ClaudeAdapter implements LLMAdapter {
  readonly provider = 'claude' as const

  /**
   * 建立 Anthropic 客戶端
   */
  private createClient(apiKey: string): Anthropic {
    return new Anthropic({
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
   * 使用 countTokens API（免費）來驗證，不消耗 tokens
   */
  async validateApiKey(apiKey: string): Promise<ValidateApiKeyResult> {
    try {
      if (!apiKey || !apiKey.trim()) {
        return { valid: false, error: 'API Key 不能為空' }
      }

      const client = this.createClient(apiKey)

      // 使用 countTokens 來驗證 API Key（免費，不消耗 tokens）
      const response = await client.messages.countTokens({
        model: getModelName('claude', 'lite'),
        messages: [{ role: 'user', content: 'test' }]
      })

      // 如果能成功回傳 token 數量，表示 API Key 有效
      if (response && typeof response.input_tokens === 'number') {
        return { valid: true }
      }

      return { valid: false, error: '無法取得回應' }
    } catch (error: any) {
      console.error('Claude API Key 驗證失敗:', error)

      if (error instanceof Anthropic.APIError) {
        const status = error.status
        const message = error.message || ''

        if (status === 401 || message.includes('invalid_api_key')) {
          return { valid: false, error: 'API Key 無效' }
        } else if (status === 429 || message.includes('rate_limit')) {
          return { valid: false, error: 'API 請求過於頻繁，請稍後再試' }
        } else if (status === 529 || message.includes('overloaded')) {
          return { valid: false, error: 'Claude 服務目前過載，請稍後再試' }
        } else if (status === 403) {
          return { valid: false, error: 'API Key 權限不足' }
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
      topK,
      apiKey: optionsApiKey,
      queueDescription
    } = options || {}

    // 優先使用 options 傳入的 apiKey，否則從 userStore 取得
    const apiKey = optionsApiKey || await this.getApiKey()
    const client = this.createClient(apiKey)
    const modelName = getModelName('claude', modelType)

    // 轉換訊息格式（過濾掉 system role，支援多模態）
    const claudeMessages = normalizeMessages(
      messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: convertToClaudeContent(msg.content)
        }))
    )

    const createParams: Anthropic.MessageCreateParams = {
      model: modelName,
      max_tokens: maxOutputTokens,
      messages: claudeMessages,
      temperature
    }

    if (systemInstruction) {
      createParams.system = systemInstruction
    }

    if (topP !== undefined) {
      createParams.top_p = topP
    }

    if (topK !== undefined) {
      createParams.top_k = topK
    }

    // 透過佇列發送請求，避免超過 rate limit
    const response = await enqueueClaudeRequest(
      () => client.messages.create(createParams),
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
        finishReason: response.stop_reason || undefined
      }
    }

    const text = extractTextFromResponse(response)
    return {
      text: getActuallyContent(text),
      raw: response,
      blocked: false,
      finishReason: response.stop_reason || undefined
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

      // 轉換歷史訊息為 Claude 格式
      const historyMessages: ClaudeMessage[] = processedMessages.slice(-20).map(msg => {
        const isUser = msg.senderId === 'user'
        let content = msg.content

        if (isGroupChat) {
          content = `[${msg.senderName}]: ${msg.content}`
        }

        return {
          role: (isUser ? 'user' : 'assistant') as 'user' | 'assistant',
          content
        }
      })

      // 加入使用者訊息（可能包含圖片）
      if (_userMsg || (userImages && userImages.length > 0)) {
        const userContent = buildClaudeContentWithImages(_userMsg, userImages)
        historyMessages.push({ role: 'user', content: userContent })
      }

      // 正規化訊息序列（群聊模式插入假 user 訊息，避免 AI 誤以為要扮演多角色）
      const normalizedMessages = normalizeMessages(historyMessages, isGroupChat)

      // 發送請求（透過佇列）
      const sendAndCheck = async (chatMessages: ClaudeMessage[]): Promise<{ text: string; response: Anthropic.Message }> => {
        const createParams: Anthropic.MessageCreateParams = {
          model: getModelName('claude', 'main'),
          max_tokens: character.maxOutputTokens || 2048,
          system: systemPrompt,
          messages: chatMessages,
          temperature: 0.95,
          top_k: 40
        }

        // 透過佇列發送請求，避免超過 rate limit
        const response = await enqueueClaudeRequest(
          () => client.messages.create(createParams),
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
      let response: Anthropic.Message

      try {
        const result = await sendAndCheck(normalizedMessages)
        text = result.text
        response = result.response
      } catch (firstError: any) {
        if (firstError instanceof ContentBlockedError && normalizedMessages.length > 2) {
          console.warn('⚠️ 內容被封鎖（完整歷史），嘗試縮短對話歷史重試...')

          try {
            // 縮短到最後 3 條訊息，並重新正規化
            const shorterMessages = normalizeMessages(historyMessages.slice(-3), isGroupChat)

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
      if (response.stop_reason === 'max_tokens') {
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
      console.error('Claude API 錯誤:', error)
      throw new Error(formatErrorMessage(error))
    }
  }
}

// 匯出單例
export const claudeAdapter = new ClaudeAdapter()
