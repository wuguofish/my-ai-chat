/**
 * Gemini SDK 共用純函數工具
 * 抽出來方便 TDD 與單元測試
 */

import { ThinkingLevel } from '@google/genai'

/**
 * 模型一律會思考，而且思考用掉的 token 算在 maxOutputTokens 裡，
 * 所以在呼叫端要求的回覆長度之外再留這麼多給思考。
 */
export const THINKING_HEADROOM_TOKENS = 2048

/**
 * 各模型可用的最低思考等級：聊天訊息不需要深思，想得少回得快。
 */
const THINKING_LEVEL: Record<'main' | 'lite', ThinkingLevel> = {
  main: ThinkingLevel.LOW,
  lite: ThinkingLevel.MINIMAL
}

export interface GenerationConfigInput {
  modelType: 'main' | 'lite'
  maxOutputTokens: number
  responseMimeType?: string
}

export interface GenerationConfig {
  maxOutputTokens: number
  thinkingConfig: { thinkingLevel: ThinkingLevel }
  responseMimeType?: string
}

export function buildGenerationConfig(input: GenerationConfigInput): GenerationConfig {
  const config: GenerationConfig = {
    maxOutputTokens: input.maxOutputTokens + THINKING_HEADROOM_TOKENS,
    thinkingConfig: { thinkingLevel: THINKING_LEVEL[input.modelType] }
  }
  if (input.responseMimeType !== undefined) config.responseMimeType = input.responseMimeType
  return config
}

export type HarmCategory =
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT'
  | 'HARM_CATEGORY_CIVIC_INTEGRITY'

export type HarmBlockThreshold =
  | 'BLOCK_NONE'
  | 'BLOCK_ONLY_HIGH'
  | 'BLOCK_MEDIUM_AND_ABOVE'
  | 'BLOCK_LOW_AND_ABOVE'

export interface SafetySetting {
  category: HarmCategory
  threshold: HarmBlockThreshold
}

export function buildSafetySettings(safeMode: boolean): SafetySetting[] {
  const baseThreshold = safeMode ? 'BLOCK_MEDIUM_AND_ABOVE' : 'BLOCK_NONE'
  return [
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: baseThreshold },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: baseThreshold },
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: baseThreshold },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: baseThreshold },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' }
  ]
}
