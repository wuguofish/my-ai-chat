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
        temperature: 0.7,
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

    try {
      // 第一次嘗試：使用完整歷史（最多 20 則）
      const chat = model.startChat({ history })
      const result = await chat.sendMessage(_userMsg)
      text = result.response.text()
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
          text = retryResult.response.text()
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
              text = finalResult.response.text()
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

    // 移除 AI 可能自作聰明加上的 [角色名]: 前綴
    // 例如：「[楊竣宇]: 大家午安」→「大家午安」
    // 注意：只移除冒號後的單一空格，不要移除換行符號
    text = text.replace(/^\[.*?\]:[ ]?/gm, '')

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

    // 如果最後一行是有效的數字，且該行只有數字（沒有其他文字，允許負號）
    const isOnlyNumber = /^-?\d+$/.test(lastLine.trim())
    if (!isNaN(parsedAffection) && isOnlyNumber) {
      // 移除最後一行的數字，保留對話內容
      const cleanText = lines.slice(0, -1).join('\n').trim()

      // 檢查移除數字後是否變成空字串
      if (!cleanText || cleanText.length === 0) {
        console.warn('⚠️ AI 回應內容為空（只有好感度數字），拋出錯誤要求重試')
        throw new Error('EMPTY_RESPONSE_WITH_AFFECTION')
      }

      return {
        text: cleanText,
        newAffection: parsedAffection
      }
    }

    // 如果解析失敗，就回傳原文，不更新好感度
    // 但要先檢查是否為空
    const finalText = text.trim()
    if (!finalText || finalText.length === 0) {
      console.warn('⚠️ AI 回應內容為空字串，拋出錯誤')
      throw new Error('EMPTY_RESPONSE')
    }

    return {
      text: finalText,
      newAffection: undefined
    }
  } catch (error: any) {
    console.error('Gemini API 錯誤:', error)

    // 檢查是否為內容被封鎖的錯誤
    if (error.message?.includes('PROHIBITED_CONTENT') ||
        error.message?.includes('blocked') ||
        error.message?.includes('SAFETY')) {
      throw new Error('回應因違反 Gemini API 內容政策而被封鎖。請嘗試調整對話內容或角色設定。')
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
