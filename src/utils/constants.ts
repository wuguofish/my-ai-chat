/**
 * 應用程式常數定義
 */

import type { AppSettings, RelationshipLevel, RelationshipLevelInfo } from '@/types'

// ==========================================
// 限制
// ==========================================

export const LIMITS = {
  MAX_CHARACTERS: 15,
  MAX_CHARACTERS_PER_ROOM: 15,
  MAX_GLOBAL_MEMORIES: 10,
  MAX_CONTEXT_MEMORIES: 5,
  MAX_RECENT_MESSAGES: 20,
  MAX_CHARACTER_EVENTS: 10,
  MAX_USER_BIO_LENGTH: 250,
  MAX_CHARACTER_PERSONALITY_LENGTH: 1500,
  MAX_CHARACTER_SPEAKING_STYLE_LENGTH: 2000,
  MAX_CHARACTER_BACKGROUND_LENGTH: 1500,
  MAX_SYSTEM_PROMPT_LENGTH: 2000
} as const

// ==========================================
// 關係等級
// ==========================================

export const RELATIONSHIP_LEVELS: Record<RelationshipLevel, RelationshipLevelInfo> = {
  stranger: {
    name: '陌生人',
    affectionRange: [0, 10],
    color: '#999999',
    description: '剛認識的階段'
  },
  acquaintance: {
    name: '點頭之交',
    affectionRange: [10, 30],
    color: '#66B3FF',
    description: '偶爾打招呼的關係'
  },
  friend: {
    name: '朋友',
    affectionRange: [30, 80],
    color: '#52C41A',
    description: '能聊得來的朋友'
  },
  close_friend: {
    name: '好友/曖昧',
    affectionRange: [80, 200],
    color: '#FFA940',
    description: '無話不談的好朋友'
  },
  soulmate: {
    name: '摯友/戀人',
    affectionRange: [200, Number.POSITIVE_INFINITY],
    color: '#FF4D4F',
    description: '最深厚的關係'
  }
} as const

// ==========================================
// 預設設定
// ==========================================

export const DEFAULT_CHARACTER_SETTINGS = {
  temperature: 0.7,
  maxTokens: 2048,
  enableRelationship: true,
  allowRomance: false
} as const

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'auto',
  language: 'zh-TW',
  memoryManagement: {
    mode: 'auto',
    autoMergeEnabled: true,
    showMemoryWarnings: true
  },
  sync: {
    enableGoogleDrive: false
  },
  privacy: {
    confirmBeforeApiCall: false
  }
}

// ==========================================
// 資料版本
// ==========================================

export const APP_VERSION = '1.0.0'
export const DATA_VERSION = '1.0.0'

// ==========================================
// Local Storage Keys
// ==========================================

export const STORAGE_KEYS = {
  APP_DATA: 'ai-chat-app-data',
  USER_PROFILE: 'ai-chat-user-profile',
  SETTINGS: 'ai-chat-settings'
} as const
