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

export {
  claudeAdapter,
  ClaudeAdapter
} from './adapters/claude'

// Adapter 實例快取
import type { LLMAdapter, LLMProvider } from './types'
import { geminiAdapter } from './adapters/gemini'
import { claudeAdapter } from './adapters/claude'

const adapterCache: Partial<Record<LLMProvider, LLMAdapter>> = {
  gemini: geminiAdapter,
  claude: claudeAdapter
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

import type { Character } from '@/types'

/**
 * 根據角色或全域設定決定要使用的服務商
 * @param character 可選的角色（用於取得角色專屬的服務商設定）
 * @returns 服務商識別
 */
async function resolveProvider(character?: Character | null): Promise<LLMProvider> {
  const { useUserStore } = await import('@/stores/user')
  const userStore = useUserStore()

  // 決定使用哪個 provider：角色設定優先，否則使用全域預設
  let provider: LLMProvider = character?.llmProvider || (userStore.defaultProvider as LLMProvider)

  // 檢查該服務商是否已實作
  if (!isProviderImplemented(provider)) {
    console.warn(`服務商 "${provider}" 尚未實作，降級使用 gemini`)
    provider = 'gemini'
  }

  return provider
}

/**
 * 取得 adapter
 * 可傳入角色以使用角色專屬的服務商設定，否則使用全域預設
 *
 * @param character 可選的角色（用於取得角色專屬的服務商設定）
 * @returns LLM Adapter 實例
 */
export async function getDefaultAdapter(character?: Character | null): Promise<LLMAdapter> {
  const provider = await resolveProvider(character)

  if (character) {
    console.log(`🤖 使用 ${provider} adapter 回應角色: ${character.name}`)
  }

  return getAdapter(provider)
}

// getDefaultApiKey 已不再需要對外公開
// Adapter 現在會自動從 userStore 取得 API Key
