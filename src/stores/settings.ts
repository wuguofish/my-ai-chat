/**
 * 應用程式設定 Store
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppSettings } from '@/types'
import { DEFAULT_APP_SETTINGS } from '@/utils/constants'

export const useSettingsStore = defineStore('settings', () => {
  // State
  const settings = ref<AppSettings>({ ...DEFAULT_APP_SETTINGS })

  // Actions
  function updateSettings(updates: Partial<AppSettings>) {
    settings.value = {
      ...settings.value,
      ...updates
    }
  }

  function updateTheme(theme: AppSettings['theme']) {
    settings.value.theme = theme
  }

  function updateMemoryMode(mode: 'auto' | 'manual') {
    settings.value.memoryManagement.mode = mode
  }

  function toggleGoogleDriveSync(enabled: boolean) {
    settings.value.sync.enableGoogleDrive = enabled
    if (enabled) {
      settings.value.sync.lastSyncTime = new Date().toISOString()
    }
  }

  function resetSettings() {
    settings.value = { ...DEFAULT_APP_SETTINGS }
  }

  return {
    // State
    settings,
    // Actions
    updateSettings,
    updateTheme,
    updateMemoryMode,
    toggleGoogleDriveSync,
    resetSettings
  }
}, {
  persist: {
    key: 'ai-chat-settings',
    storage: localStorage
  }
})
