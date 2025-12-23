/**
 * LLM 服務層 - 主要入口
 */

// 匯出類型
export type {
  LLMProvider,
  ModelType,
  SafetyLevel,
  LLMMessage,
  CreateModelOptions,
  GenerateOptions,
  GenerateResponse,
  ValidateApiKeyResult,
  GetCharacterResponseParams,
  CharacterResponse,
  LLMAdapter
} from './types'

export { ContentBlockedError } from './types'

// 匯出配置
export {
  LLM_CONFIG,
  getProviderConfig,
  getModelName,
  getSupportedProviders,
  isValidProvider,
  type ProviderConfig
} from './config'

// 匯出工具函數
export {
  LEGAL_ADULT_AGE,
  parseAge,
  isAdultConversation,
  getActuallyContent,
  cleanExcessiveQuotes,
  BLOCKED_FINISH_REASONS,
  isBlockedError,
  formatErrorMessage
} from './utils'

// 匯出 adapters
export {
  geminiAdapter,
  GeminiAdapter,
  createGeminiModel,
  prepareGeminiChat,
  sendGeminiRequest,
  sendGeminiRequestText
} from './adapters/gemini'

// Adapter 實例快取
import type { LLMAdapter, LLMProvider } from './types'
import { geminiAdapter } from './adapters/gemini'

const adapterCache: Partial<Record<LLMProvider, LLMAdapter>> = {
  gemini: geminiAdapter
}

/**
 * 取得指定服務商的 adapter
 * @param provider 服務商識別
 * @returns LLM Adapter 實例
 * @throws 如果服務商尚未實作
 */
export function getAdapter(provider: LLMProvider): LLMAdapter {
  const adapter = adapterCache[provider]

  if (!adapter) {
    throw new Error(`LLM provider "${provider}" is not implemented yet`)
  }

  return adapter
}

/**
 * 檢查服務商是否已實作
 */
export function isProviderImplemented(provider: LLMProvider): boolean {
  return provider in adapterCache && adapterCache[provider] !== undefined
}

/**
 * 取得已實作的服務商列表
 */
export function getImplementedProviders(): LLMProvider[] {
  return Object.keys(adapterCache).filter(
    key => adapterCache[key as LLMProvider] !== undefined
  ) as LLMProvider[]
}

/**
 * 取得預設服務商的 adapter
 * 從 user store 取得預設服務商設定
 */
export async function getDefaultAdapter(): Promise<LLMAdapter> {
  const { useUserStore } = await import('@/stores/user')
  const userStore = useUserStore()
  const provider = userStore.defaultProvider as LLMProvider

  // 檢查該服務商是否已實作
  if (!isProviderImplemented(provider)) {
    console.warn(`預設服務商 "${provider}" 尚未實作，降級使用 gemini`)
    return getAdapter('gemini')
  }

  return getAdapter(provider)
}

/**
 * 取得預設服務商的 API Key
 * 從 user store 取得對應的 API Key
 */
export async function getDefaultApiKey(): Promise<string> {
  const { useUserStore } = await import('@/stores/user')
  const userStore = useUserStore()
  const provider = userStore.defaultProvider

  // 檢查該服務商是否已實作
  if (!isProviderImplemented(provider as LLMProvider)) {
    console.warn(`預設服務商 "${provider}" 尚未實作，降級使用 gemini`)
    return userStore.getApiKey('gemini')
  }

  return userStore.getApiKey(provider)
}
