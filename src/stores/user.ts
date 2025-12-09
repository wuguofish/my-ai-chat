/**
 * 使用者資料 Store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserProfile } from '@/types'

export const useUserStore = defineStore('user', () => {
  // State
  const profile = ref<UserProfile | null>(null)

  // Getters
  const isProfileComplete = computed(() => {
    if (!profile.value) return false
    return profile.value.nickname?.trim() !== '' &&
           profile.value.apiConfig?.geminiApiKey?.trim() !== ''
  })

  const userName = computed(() => profile.value?.nickname || '使用者')
  const userAvatar = computed(() => profile.value?.avatar || '')
  const apiKey = computed(() => profile.value?.apiConfig.geminiApiKey || '')
  const globalSystemPrompt = computed(() => profile.value?.globalSystemPrompt || '')

  // Actions
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

  function updateApiKey(newApiKey: string) {
    if (profile.value) {
      profile.value.apiConfig.geminiApiKey = newApiKey
      profile.value.updatedAt = new Date().toISOString()
    }
  }

  function clearProfile() {
    profile.value = null
  }

  return {
    // State
    profile,
    // Getters
    isProfileComplete,
    userName,
    userAvatar,
    apiKey,
    globalSystemPrompt,
    // Actions
    setProfile,
    updateProfile,
    updateApiKey,
    clearProfile
  }
}, {
  persist: {
    key: 'ai-chat-user',
    storage: localStorage
  }
})
