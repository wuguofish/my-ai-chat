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
  GeminiAdapter
} from './adapters/gemini'

export {
  claudeAdapter,
  ClaudeAdapter
} from './adapters/claude'

export {
  openaiAdapter,
  grokAdapter,
  OpenAICompatibleAdapter
} from './adapters/openai'

// Adapter 實例快取
import type { LLMAdapter, LLMProvider } from './types'
import { geminiAdapter } from './adapters/gemini'
import { claudeAdapter } from './adapters/claude'
import { openaiAdapter, grokAdapter } from './adapters/openai'

const adapterCache: Partial<Record<LLMProvider, LLMAdapter>> = {
  gemini: geminiAdapter,
  claude: claudeAdapter,
  openai: openaiAdapter,
  grok: grokAdapter
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
import { getProviderConfig, type ProviderConfig } from './config'
import { useUserStore } from '@/stores/user'
import { orderFallbackProviders } from './fallback'

/**
 * 取得角色使用的 LLM 服務商資訊（用於顯示 icon）
 * @param character 角色
 * @returns 服務商配置（包含 icon、iconColor、tooltip 等）
 */
export function getCharacterProviderInfo(character: Character): ProviderConfig {
  const userStore = useUserStore()
  const provider = character.llmProvider || userStore.defaultProvider
  return getProviderConfig(provider)
}

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

/**
 * 取得背景任務（記憶整理、動態牆、問候等）用的 adapter。
 * 內容被服務商擋下時，依使用者設定的順序換下一家有 API Key 的服務商再試。
 * 角色的對話回覆請用 getDefaultAdapter：換服務商會讓角色的口氣跟著變。
 *
 * @param character 可選的角色（用於取得角色專屬的服務商設定）
 */
export async function getBackgroundAdapter(character?: Character | null): Promise<Pick<LLMAdapter, 'generate'>> {
  const primary = await resolveProvider(character)
  const userStore = useUserStore()
  const available = getImplementedProviders().filter(provider => userStore.hasApiKey(provider))
  const fallbacks = orderFallbackProviders(userStore.fallbackOrder, available)
    .filter(provider => provider !== primary)

  return {
    async generate(messages, options) {
      let response = await getAdapter(primary).generate(messages, options)

      for (const provider of fallbacks) {
        if (!response.blocked) break

        console.warn(`⚠️ ${options?.queueDescription || '背景任務'}被 ${response.blockReason} 擋下，改用 ${provider} 再試`)
        try {
          response = await getAdapter(provider).generate(messages, options)
        } catch (error) {
          console.warn(`⚠️ 改用 ${provider} 失敗，繼續試下一家:`, error)
        }
      }

      return response
    }
  }
}

// getDefaultApiKey 已不再需要對外公開
// Adapter 現在會自動從 userStore 取得 API Key
