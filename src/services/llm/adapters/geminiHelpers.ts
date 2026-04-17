/**
 * Gemini SDK 共用純函數工具
 * 抽出來方便 TDD 與單元測試
 */

export interface GenerationConfig {
  temperature: number
  maxOutputTokens: number
  topP?: number
  topK?: number
  responseMimeType?: string
}

export function buildGenerationConfig(input: GenerationConfig): GenerationConfig {
  const config: GenerationConfig = {
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens
  }
  if (input.topP !== undefined) config.topP = input.topP
  if (input.topK !== undefined) config.topK = input.topK
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
