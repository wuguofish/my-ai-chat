/**
 * Gemini AI 服務
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import type { Character, Message, UserProfile, ChatRoom } from '@/types'
import { generateSystemPrompt, convertToShortIds, convertToLongIds, type SystemPromptContext } from '@/utils/chatHelpers'

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
    // 初始化 Gemini AI
    const genAI = new GoogleGenerativeAI(apiKey)

    // 判斷是否為群聊，群聊時使用短 ID
    const isGroupChat = room?.type === 'group'
    const useShortIds = isGroupChat && context?.otherCharactersInRoom && context.otherCharactersInRoom.length > 0

    // 產生 system prompt（包含完整情境資訊）
    const systemPrompt = generateSystemPrompt({
      character,
      user,
      room,
      ...context,
      useShortIds
    })

    // 建立模型配置
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: {
        parts: [{ text: systemPrompt }],
        role: 'user'
      },
      safetySettings: [
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
        }
      ],
      generationConfig: {
        temperature: 0.9,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: character.maxOutputTokens || 2048
      }
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

    const history = processedMessages.slice(-20).map(msg => {
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

    // 建立聊天會話
    const chat = model.startChat({
      history
    })

    // 傳送訊息
    const result = await chat.sendMessage(_userMsg)
    const response = result.response
    let text = response.text()

    // 移除 AI 可能自作聰明加上的 [角色名]: 前綴
    // 例如：「[楊竣宇]: 大家午安」→「大家午安」
    text = text.replace(/^\[.*?\]:\s*/g, '')

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

    // 解析好感度（從最後一行提取）
    const lines = text.trim().split('\n')
    const lastLine = (lines.length > 0 ? lines[lines.length - 1] : '') ?? ''
    const parsedAffection = parseInt(lastLine.trim(), 10)

    // 如果最後一行是有效的數字（>= 0），就提取它作為新好感度
    if (!isNaN(parsedAffection) && parsedAffection >= 0) {
      // 移除最後一行的數字，保留對話內容
      const cleanText = lines.slice(0, -1).join('\n').trim()
      return {
        text: cleanText,
        newAffection: parsedAffection
      }
    }

    // 如果解析失敗，就回傳原文，不更新好感度
    return {
      text: text.trim(),
      newAffection: undefined
    }
  } catch (error) {
    console.error('Gemini API 錯誤:', error)
    throw new Error('無法取得 AI 回應，請稍後再試')
  }
}
