/**
 * Gemini AI 服務
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import type { Character, Message, UserProfile, ChatRoom } from '@/types'
import { generateSystemPrompt, type SystemPromptContext } from '@/utils/chatHelpers'

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
 * 呼叫 Gemini API 取得角色回應
 */
export async function getCharacterResponse(params: GetCharacterResponseParams): Promise<CharacterResponse> {
  const { apiKey, character, user, room, messages, userMessage, context } = params

  try {
    // 初始化 Gemini AI
    const genAI = new GoogleGenerativeAI(apiKey)

    // 產生 system prompt（包含完整情境資訊）
    const systemPrompt = generateSystemPrompt({
      character,
      user,
      room,
      ...context
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
    const history = messages.slice(-20).map(msg => {
      const isUser = msg.senderId === 'user'
      const isCurrentCharacter = msg.senderId === character.id

      // 群聊時需要標註發言者，單人聊天則不需要
      const isGroupChat = room?.type === 'group'
      let content = msg.content

      if (isGroupChat && !isCurrentCharacter) {
        // 在群聊中，如果不是當前角色發言，需要標註發言者
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
    const result = await chat.sendMessage(userMessage)
    const response = result.response
    const text = response.text()

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
