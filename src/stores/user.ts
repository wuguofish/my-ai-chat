/**
 * 使用者資料 Store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserProfile, LLMProviderType, LLMSettings } from '@/types'

/** 預設 LLM 設定 */
const DEFAULT_LLM_SETTINGS: LLMSettings = {
  defaultProvider: 'gemini',
  apiKeys: {}
}

export const useUserStore = defineStore('user', () => {
  // State
  const profile = ref<UserProfile | null>(null)

  // ============================================
  // LLM 設定相關 Getters
  // ============================================

  /**
   * LLM 設定（向後兼容：如果沒有新設定，從舊的 apiConfig 遷移）
   */
  const llmSettings = computed<LLMSettings>(() => {
    if (profile.value?.llmSettings) {
      return profile.value.llmSettings
    }
    // 向後兼容：從舊的 apiConfig 遷移
    if (profile.value?.apiConfig?.geminiApiKey) {
      return {
        defaultProvider: 'gemini',
        apiKeys: {
          gemini: profile.value.apiConfig.geminiApiKey
        }
      }
    }
    return DEFAULT_LLM_SETTINGS
  })

  /**
   * 預設服務商
   */
  const defaultProvider = computed(() => llmSettings.value.defaultProvider)

  /**
   * 取得指定服務商的 API Key
   */
  function getApiKey(provider: LLMProviderType): string {
    return llmSettings.value.apiKeys[provider] || ''
  }

  /**
   * 檢查指定服務商是否已設定 API Key
   */
  function hasApiKey(provider: LLMProviderType): boolean {
    return getApiKey(provider).trim() !== ''
  }

  // ============================================
  // 通用 Getters
  // ============================================

  const isProfileComplete = computed(() => {
    if (!profile.value) return false
    // 檢查是否有設定暱稱和至少一個有效的 API Key
    const hasNickname = profile.value.nickname?.trim() !== ''
    const hasValidApiKey = hasApiKey(llmSettings.value.defaultProvider)
    return hasNickname && hasValidApiKey
  })

  const userName = computed(() => profile.value?.nickname || '使用者')
  const userAvatar = computed(() => profile.value?.avatar || '')
  const globalSystemPrompt = computed(() => profile.value?.globalSystemPrompt || '')

  /**
   * 取得目前預設服務商的 API Key
   * @deprecated 請使用 getApiKey(provider) 替代
   */
  const apiKey = computed(() => getApiKey(llmSettings.value.defaultProvider))

  // ============================================
  // Actions
  // ============================================

  function setProfile(newProfile: UserProfile) {
    profile.value = newProfile
  }

  function updateProfile(updates: Partial<UserProfile>) {
    if (profile.value) {
      profile.value = {
        ...profile.value,
        ...updates,
        updatedAt: new Date().toISOString()
      }
    }
  }

  /**
   * 更新指定服務商的 API Key
   */
  function updateProviderApiKey(provider: LLMProviderType, newApiKey: string) {
    if (!profile.value) return

    // 確保 llmSettings 存在
    if (!profile.value.llmSettings) {
      profile.value.llmSettings = {
        defaultProvider: 'gemini',
        apiKeys: {}
      }
    }

    profile.value.llmSettings.apiKeys[provider] = newApiKey
    profile.value.updatedAt = new Date().toISOString()

    // 同時更新舊的 apiConfig（向後兼容）
    if (provider === 'gemini') {
      profile.value.apiConfig.geminiApiKey = newApiKey
    }
  }

  /**
   * 更新預設服務商
   */
  function updateDefaultProvider(provider: LLMProviderType) {
    if (!profile.value) return

    // 確保 llmSettings 存在
    if (!profile.value.llmSettings) {
      profile.value.llmSettings = {
        defaultProvider: provider,
        apiKeys: {}
      }
    } else {
      profile.value.llmSettings.defaultProvider = provider
    }

    profile.value.updatedAt = new Date().toISOString()
  }

  /**
   * @deprecated 請使用 updateProviderApiKey('gemini', apiKey) 替代
   */
  function updateApiKey(newApiKey: string) {
    updateProviderApiKey('gemini', newApiKey)
  }

  function clearProfile() {
    profile.value = null
  }

  /**
   * 遷移舊版 apiConfig 到新版 llmSettings
   * 用於匯入舊版備份檔時呼叫
   */
  function migrateApiConfig() {
    if (!profile.value) return

    // 如果已經有 llmSettings，不需要遷移
    if (profile.value.llmSettings) return

    // 從舊的 apiConfig 遷移
    if (profile.value.apiConfig?.geminiApiKey) {
      profile.value.llmSettings = {
        defaultProvider: 'gemini',
        apiKeys: {
          gemini: profile.value.apiConfig.geminiApiKey
        }
      }
      profile.value.updatedAt = new Date().toISOString()
      console.log('✅ 已將 apiConfig 遷移至 llmSettings')
    }
  }

  return {
    // State
    profile,
    // LLM Getters
    llmSettings,
    defaultProvider,
    getApiKey,
    hasApiKey,
    // General Getters
    isProfileComplete,
    userName,
    userAvatar,
    apiKey,  // deprecated
    globalSystemPrompt,
    // Actions
    setProfile,
    updateProfile,
    updateProviderApiKey,
    updateDefaultProvider,
    updateApiKey,  // deprecated
    clearProfile,
    migrateApiConfig
  }
}, {
  persist: {
    key: 'ai-chat-user',
    storage: localStorage
  }
})
