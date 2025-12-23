/**
 * Gemini AI 服務
 *
 * ⚠️ 此檔案為向後兼容層，實際實作已移至 ./llm/adapters/gemini.ts
 * 新功能請直接使用 @/services/llm 模組
 */

// 從新的 LLM 模組重新匯出
export {
  // 類型
  ContentBlockedError,
  type GetCharacterResponseParams,
  type CharacterResponse,

  // 工具函數
  LEGAL_ADULT_AGE,
  isAdultConversation,
  getActuallyContent,
  cleanExcessiveQuotes,
  isBlockedError,
  formatErrorMessage
} from './llm'

// 從 Gemini adapter 重新匯出
export { geminiAdapter } from './llm'

// ============================================
// 以下為向後兼容的函數包裝
// ============================================

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, type GenerativeModel, type EnhancedGenerateContentResponse } from '@google/generative-ai'
import { geminiAdapter } from './llm'
import { getActuallyContent, isAdultConversation } from './llm'
import type { GetCharacterResponseParams, CharacterResponse } from './llm'

/**
 * 安全模式的設定（保護未成年人）
 * @deprecated 請使用 llm 模組的 adapter
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
 * @deprecated 請使用 llm 模組的 adapter
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
 * 根據年齡取得適當的安全設定
 * @deprecated 請使用 llm 模組的 adapter
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
  safeMode?: boolean
}

/**
 * 建立 Gemini 模型的共用函數
 * @deprecated 請使用 llm 模組的 adapter
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
    safeMode = true
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

// 從新的 LLM 模組引入實作
import { sendGeminiRequest, sendGeminiRequestText } from './llm'

/**
 * 發送 Gemini 請求並取得文字回應
 * @deprecated 請使用 llm 模組的 sendGeminiRequestText
 */
export async function getGeminiResponseText(userPrompt: string, model: GenerativeModel): Promise<string> {
  const msg = await sendGeminiRequestText(userPrompt, model)
  return getActuallyContent(msg)
}

/**
 * 發送 Gemini 請求（繞過過度審查的 workaround）
 * @deprecated 請使用 llm 模組的 sendGeminiRequest
 */
export async function getGeminiResponse(userPrompt: string, model: GenerativeModel): Promise<EnhancedGenerateContentResponse> {
  return sendGeminiRequest(userPrompt, model)
}

/**
 * 被封鎖的 finishReason 類型
 */
const BLOCKED_FINISH_REASONS = [
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SAFETY',
  'OTHER'
]

/**
 * 檢查 Gemini 回應是否被內容過濾封鎖
 * @deprecated 請使用 llm 模組的 adapter
 */
export function checkResponseBlocked(response: any): { reason: string; message: string } | null {
  const promptBlockReason = response?.promptFeedback?.blockReason
  if (promptBlockReason) {
    return {
      reason: promptBlockReason,
      message: `輸入內容被封鎖: ${promptBlockReason}`
    }
  }

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
 * 驗證 API Key 是否有效
 */
export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  return geminiAdapter.validateApiKey(apiKey)
}

/**
 * 呼叫 Gemini API 取得角色回應
 */
export async function getCharacterResponse(params: GetCharacterResponseParams): Promise<CharacterResponse> {
  return geminiAdapter.getCharacterResponse(params)
}
