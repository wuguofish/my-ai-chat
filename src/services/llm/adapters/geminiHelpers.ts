/**
 * Gemini SDK 共用純函數工具
 * 抽出來方便 TDD 與單元測試
 */

export interface GenerationConfigInput {
  temperature: number
  maxOutputTokens: number
  topP?: number
  topK?: number
  responseMimeType?: string
}

export interface GenerationConfig {
  temperature: number
  maxOutputTokens: number
  topP?: number
  topK?: number
  responseMimeType?: string
}

export function buildGenerationConfig(input: GenerationConfigInput): GenerationConfig {
  const config: GenerationConfig = {
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens
  }
  if (input.topP !== undefined) config.topP = input.topP
  if (input.topK !== undefined) config.topK = input.topK
  if (input.responseMimeType !== undefined) config.responseMimeType = input.responseMimeType
  return config
}

export interface SafetySetting {
  category: string
  threshold: string
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
