/**
 * 應用程式常數定義
 */

import type { AppSettings, RelationshipLevel, RelationshipLevelInfo, ActivePeriod } from '@/types'

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
  MAX_CHARACTER_EVENT_LENGTH: 1000,
  MAX_SYSTEM_PROMPT_LENGTH: 2000,
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
    color: '#ee5f00ff',
    description: '無話不談的好朋友'
  },
  soulmate: {
    name: '摯友/戀人',
    affectionRange: [200, Number.POSITIVE_INFINITY],
    color: '#bb0003',
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

// ==========================================
// 作息時間模板
// ==========================================

export interface ScheduleTemplate {
  id: string
  name: string
  description: string
  periods: ActivePeriod[]
}

export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  {
    id: 'always-online',
    name: '全天候在線',
    description: '24 小時都在線上',
    periods: [
      { start: 0, end: 24, status: 'online' }
    ]
  },
  {
    id: 'office-worker',
    name: '上班族',
    description: '白天上班，晚上空閒',
    periods: [
      { start: 0, end: 9, status: 'offline' },    // 00:00-09:00 睡覺
      { start: 9, end: 18, status: 'away' },      // 09:00-18:00 上班中
      { start: 18, end: 23, status: 'online' },   // 18:00-23:00 下班空閒
      { start: 23, end: 24, status: 'offline' }   // 23:00-00:00 睡覺
    ]
  },
  {
    id: 'student-early',
    name: '學生族（早起）',
    description: '白天上課，晚上念書',
    periods: [
      { start: 0, end: 8, status: 'offline' },    // 00:00-08:00 睡覺
      { start: 8, end: 17, status: 'away' },      // 08:00-17:00 上課中
      { start: 17, end: 23, status: 'online' },   // 17:00-23:00 放學空閒
      { start: 23, end: 24, status: 'offline' }   // 23:00-00:00 睡覺
    ]
  },
  {
    id: 'student-night',
    name: '學生族（夜貓）',
    description: '白天上課，晚上熬夜',
    periods: [
      { start: 0, end: 2, status: 'online' },     // 00:00-02:00 熬夜
      { start: 2, end: 8, status: 'offline' },    // 02:00-08:00 睡覺
      { start: 8, end: 17, status: 'away' },      // 08:00-17:00 上課中
      { start: 17, end: 24, status: 'online' }    // 17:00-00:00 放學空閒
    ]
  },
  {
    id: 'freelancer-early',
    name: '自由工作者（早鳥）',
    description: '早起工作，分段休息',
    periods: [
      { start: 0, end: 7, status: 'offline' },    // 00:00-07:00 睡覺
      { start: 7, end: 10, status: 'online' },    // 07:00-10:00 早晨空閒
      { start: 10, end: 12, status: 'away' },     // 10:00-12:00 工作中
      { start: 12, end: 14, status: 'online' },   // 12:00-14:00 午休
      { start: 14, end: 18, status: 'away' },     // 14:00-18:00 工作中
      { start: 18, end: 22, status: 'online' },   // 18:00-22:00 晚間空閒
      { start: 22, end: 24, status: 'offline' }   // 22:00-00:00 睡覺
    ]
  },
  {
    id: 'freelancer-night',
    name: '自由工作者（夜貓）',
    description: '晚睡晚起，彈性作息',
    periods: [
      { start: 0, end: 2, status: 'online' },     // 00:00-02:00 深夜空閒
      { start: 2, end: 4, status: 'away' },       // 02:00-04:00 工作中
      { start: 4, end: 12, status: 'offline' },   // 04:00-12:00 睡覺
      { start: 12, end: 15, status: 'online' },   // 12:00-15:00 午後空閒
      { start: 15, end: 18, status: 'away' },     // 15:00-18:00 工作中
      { start: 18, end: 20, status: 'online' },   // 18:00-20:00 晚餐時間
      { start: 20, end: 24, status: 'online' }    // 20:00-00:00 夜晚空閒
    ]
  },
  {
    id: 'internet-addict-early',
    name: '網路成癮者（早起）',
    description: '幾乎整天在線',
    periods: [
      { start: 0, end: 1, status: 'away' },       // 00:00-01:00 準備睡
      { start: 1, end: 3, status: 'offline' },    // 01:00-03:00 短暫睡眠
      { start: 3, end: 6, status: 'away' },       // 03:00-06:00 半夢半醒
      { start: 6, end: 24, status: 'online' }     // 06:00-00:00 幾乎全天在線
    ]
  },
  {
    id: 'internet-addict-night',
    name: '網路成癮者（夜貓）',
    description: '晝伏夜出的網蟲',
    periods: [
      { start: 0, end: 5, status: 'online' },     // 00:00-05:00 深夜在線
      { start: 5, end: 7, status: 'away' },       // 05:00-07:00 準備睡
      { start: 7, end: 10, status: 'offline' },   // 07:00-10:00 短暫睡眠
      { start: 10, end: 24, status: 'online' }    // 10:00-00:00 全天在線
    ]
  }
]
