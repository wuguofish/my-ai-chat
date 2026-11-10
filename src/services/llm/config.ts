/**
 * LLM 服務層 - 服務商配置
 */

import type { LLMProvider } from './types'

/**
 * Gemini 模型名稱型別（與 apiQueue.ts 的 GeminiModelType 同步）
 */
export type GeminiModelName = 'gemini-3.8-flash' | 'gemini-3.5-flash-lite'

/**
 * 服務商配置介面
 */
export interface ProviderConfig {
  /** 服務商名稱 */
  name: string
  /** 主要對話模型（API 用） */
  mainModel: string
  /** 輕量任務模型（API 用） */
  liteModel: string
  /** 主要對話模型（顯示用） */
  mainModelDisplay: string
  /** 輕量任務模型（顯示用） */
  liteModelDisplay: string
  /** 後台管理 URL */
  consoleUrl: string
  /** 顯示用 Icon */
  icon: string
  /** Icon 顏色 */
  iconColor: string
  /** 深色主題 Icon 顏色（可選，預設同 iconColor） */
  iconColorDark?: string
  /** Tooltip 文字 */
  tooltip: string
}

/**
 * 各服務商的配置
 */
export const LLM_CONFIG: Record<LLMProvider, ProviderConfig> = {
  gemini: {
    name: 'Gemini',
    mainModel: 'gemini-3.8-flash',
    liteModel: 'gemini-3.5-flash-lite',
    mainModelDisplay: '3.8 Flash',
    liteModelDisplay: '3.5 Flash Lite',
    consoleUrl: 'https://aistudio.google.com/app/api-keys',
    icon: 'G',
    iconColor: '#4285F4',
    tooltip: 'Google Gemini'
  },
  openai: {
    name: 'OpenAI',
    mainModel: 'gpt-6.1-sol',
    liteModel: 'gpt-6-luna',
    mainModelDisplay: 'GPT-6.1 Sol',
    liteModelDisplay: 'GPT-6 Luna',
    consoleUrl: 'https://platform.openai.com/api-keys',
    icon: '⬡',
    iconColor: '#000000',
    iconColorDark: '#FFFFFF',
    tooltip: 'OpenAI'
  },
  claude: {
    name: 'Claude',
    mainModel: 'claude-sonnet-5-5',
    liteModel: 'claude-haiku-5-5',
    mainModelDisplay: '5.5 Sonnet',
    liteModelDisplay: '5.5 Haiku',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    icon: '✳',
    iconColor: '#D97706',
    tooltip: 'Claude'
  },
  grok: {
    name: 'Grok',
    mainModel: 'grok-4.7',
    liteModel: 'grok-4.3',
    mainModelDisplay: 'Grok 4.7',
    liteModelDisplay: 'Grok 4.3',
    consoleUrl: 'https://console.x.ai/',
    icon: '⌀',
    iconColor: '#000000',
    iconColorDark: '#FFFFFF',
    tooltip: 'Grok'
  }
}

/**
 * 取得服務商配置
 */
export function getProviderConfig(provider: LLMProvider): ProviderConfig {
  return LLM_CONFIG[provider]
}

/**
 * 取得模型名稱
 */
export function getModelName(provider: LLMProvider, type: 'main' | 'lite'): string {
  const config = LLM_CONFIG[provider]
  return type === 'main' ? config.mainModel : config.liteModel
}

/**
 * 取得所有支援的服務商列表
 */
export function getSupportedProviders(): LLMProvider[] {
  return Object.keys(LLM_CONFIG) as LLMProvider[]
}

/**
 * 檢查是否為有效的服務商
 */
export function isValidProvider(provider: string): provider is LLMProvider {
  return provider in LLM_CONFIG
}

/**
 * 取得 Gemini 模型名稱（型別安全版本）
 * 回傳值可直接傳給 enqueueGeminiRequest
 */
export function getGeminiModelName(type: 'main' | 'lite'): GeminiModelName {
  return type === 'main' ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite'
}
