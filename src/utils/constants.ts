/**
 * 應用程式常數定義
 */

import type { AppSettings, RelationshipLevel, RelationshipLevelInfo, ActivePeriod, ScheduleConfig, PostTriggerEvent } from '@/types'

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
  // 動態牆相關限制
  MAX_POSTS: 120,
  MAX_COMMENTS_PER_POST: 48,
  MAX_NOTIFICATIONS: 50,
  // 圖片相關限制
  MAX_IMAGE_WIDTH: 1024,              // 圖片最大寬度（px）
  MAX_IMAGE_HEIGHT: 1024,             // 圖片最大高度（px）
  MAX_IMAGE_SIZE_KB: 500,             // 單張圖片最大 500KB
  MAX_IMAGES_PER_MESSAGE: 4,          // 每則訊息最多 4 張圖片
} as const

/**
 * 圖片相關常數
 */
export const IMAGE_CONSTANTS = {
  SUPPORTED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const,
  QUALITY_STEPS: [0.85, 0.7, 0.5, 0.3] as const,  // 漸進式壓縮品質
  DEFAULT_MIME_TYPE: 'image/jpeg' as const,
} as const

// ==========================================
// 關係等級
// ==========================================

export const RELATIONSHIP_LEVELS: Record<RelationshipLevel, RelationshipLevelInfo> = {
  enemy: {
    name: '仇敵',
    affectionRange: [Number.NEGATIVE_INFINITY, -100],
    color: '#8B0000',
    description: '關係極差，互相敵視'
  },
  dislike: {
    name: '不爽',
    affectionRange: [-100, -30],
    color: '#D2691E',
    description: '關係不好，但還不到仇敵'
  },
  stranger: {
    name: '陌生人',
    affectionRange: [-30, 10],
    color: '#999999',
    description: '陌生或淡淡的不滿'
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
  SETTINGS: 'ai-chat-settings',
  FEED: 'ai-chat-feed'
} as const

// ==========================================
// 動態牆事件觸發機率與冷卻時間
// ==========================================

/** 事件觸發發文的機率（0~1） */
export const FEED_POST_PROBABILITY: Partial<Record<PostTriggerEvent, number>> = {
  mood_change: 0.30,
  relationship_change: 0.50,
  new_memory: 0.20,
  come_online: 0.15,
  birthday: 1.00,
  holiday: 0.40,
  daily_catchup: 0.22,  // 20~25% 取中間值
} as const

/** 事件冷卻時間（毫秒） */
export const FEED_EVENT_COOLDOWN: Partial<Record<PostTriggerEvent, number>> = {
  mood_change: 2 * 60 * 60 * 1000,      // 2 小時
  new_memory: 4 * 60 * 60 * 1000,       // 4 小時
  come_online: 8 * 60 * 60 * 1000,      // 8 小時
} as const

/** 各關係等級的按讚/留言/留言按讚機率 */
export const FEED_INTERACTION_PROBABILITY: Record<RelationshipLevel, { like: number; comment: number; commentLike: number }> = {
  enemy: { like: 0, comment: 0, commentLike: 0 },
  dislike: { like: 0.05, comment: 0, commentLike: 0 },
  stranger: { like: 0.10, comment: 0, commentLike: 0.05 },
  acquaintance: { like: 0.30, comment: 0.10, commentLike: 0.15 },
  friend: { like: 0.50, comment: 0.25, commentLike: 0.25 },
  close_friend: { like: 0.70, comment: 0.40, commentLike: 0.35 },
  soulmate: { like: 0.85, comment: 0.55, commentLike: 0.45 },
} as const

/** 即時互動的延遲時間範圍（毫秒） */
export const FEED_INTERACTION_DELAY = {
  like: { min: 1 * 1000, max: 5 * 60 * 1000 },         // 1 秒 ~ 5 分鐘
  comment: { min: 30 * 1000, max: 10 * 60 * 1000 },    // 30 秒 ~ 10 分鐘
  reply: { min: 15 * 1000, max: 3 * 60 * 1000 },       // 15 秒 ~ 3 分鐘（回覆較快）
} as const

/** 留言回覆機制設定 */
export const FEED_COMMENT_REPLY = {
  /** 每篇動態最大 AI 回覆輪次（使用者留言會重置） */
  maxRounds: 3,
  /** 動態作者回覆自己動態下留言的額外機率加成 */
  authorReplyBonus: 0.3,
  /** 被回覆者回覆的額外機率加成 */
  repliedToBonus: 0.2,
} as const

// ==========================================
// 作息時間模板（新版：區分平日/假日）
// ==========================================

export interface ScheduleTemplateV2 {
  id: string
  name: string
  description: string
  schedule: ScheduleConfig  // 新格式：區分平日/假日
}

// 新版作息模板（區分平日/假日）
export const SCHEDULE_TEMPLATES_V2: ScheduleTemplateV2[] = [
  {
    id: 'always-online',
    name: '全天候在線',
    description: '不管平日假日，24 小時都在線上',
    schedule: {
      workdayPeriods: [
        { start: 0, end: 24, status: 'online' }
      ],
      holidayPeriods: [
        { start: 0, end: 24, status: 'online' }
      ]
    }
  },
  {
    id: 'office-worker',
    name: '上班族',
    description: '平日白天上班，假日睡到自然醒',
    schedule: {
      // 平日：朝九晚五上班
      workdayPeriods: [
        { start: 0, end: 8, status: 'offline' },    // 00:00-08:00 睡覺
        { start: 8, end: 9, status: 'away' },       // 08:00-09:00 通勤中
        { start: 9, end: 12, status: 'away' },      // 09:00-12:00 上班中
        { start: 12, end: 13, status: 'online' },   // 12:00-13:00 午休
        { start: 13, end: 18, status: 'away' },     // 13:00-18:00 上班中
        { start: 18, end: 23, status: 'online' },   // 18:00-23:00 下班空閒
        { start: 23, end: 24, status: 'offline' }   // 23:00-00:00 睡覺
      ],
      // 假日：睡到自然醒，整天放鬆
      holidayPeriods: [
        { start: 0, end: 10, status: 'offline' },   // 00:00-10:00 睡到自然醒
        { start: 10, end: 24, status: 'online' }    // 10:00-00:00 整天放鬆
      ]
    }
  },
  {
    id: 'student-early',
    name: '學生族（早起）',
    description: '平日上課，假日補眠',
    schedule: {
      // 平日：上學
      workdayPeriods: [
        { start: 0, end: 7, status: 'offline' },    // 00:00-07:00 睡覺
        { start: 7, end: 8, status: 'away' },       // 07:00-08:00 準備上學
        { start: 8, end: 12, status: 'away' },      // 08:00-12:00 上課中
        { start: 12, end: 13, status: 'online' },   // 12:00-13:00 午休
        { start: 13, end: 17, status: 'away' },     // 13:00-17:00 上課中
        { start: 17, end: 22, status: 'online' },   // 17:00-22:00 放學空閒
        { start: 22, end: 24, status: 'offline' }   // 22:00-00:00 睡覺
      ],
      // 假日：補眠 + 放鬆
      holidayPeriods: [
        { start: 0, end: 9, status: 'offline' },    // 00:00-09:00 補眠
        { start: 9, end: 23, status: 'online' },    // 09:00-23:00 整天放鬆
        { start: 23, end: 24, status: 'offline' }   // 23:00-00:00 睡覺
      ]
    }
  },
  {
    id: 'student-night',
    name: '學生族（夜貓）',
    description: '平日上課，假日熬夜',
    schedule: {
      // 平日：上學 + 晚上熬夜
      workdayPeriods: [
        { start: 0, end: 2, status: 'online' },     // 00:00-02:00 熬夜
        { start: 2, end: 7, status: 'offline' },    // 02:00-07:00 睡覺
        { start: 7, end: 8, status: 'away' },       // 07:00-08:00 準備上學（睡眼惺忪）
        { start: 8, end: 12, status: 'away' },      // 08:00-12:00 上課中
        { start: 12, end: 13, status: 'online' },   // 12:00-13:00 午休
        { start: 13, end: 17, status: 'away' },     // 13:00-17:00 上課中
        { start: 17, end: 24, status: 'online' }    // 17:00-00:00 放學 + 熬夜
      ],
      // 假日：睡到中午 + 狂歡到深夜
      holidayPeriods: [
        { start: 0, end: 4, status: 'online' },     // 00:00-04:00 深夜狂歡
        { start: 4, end: 12, status: 'offline' },   // 04:00-12:00 睡到中午
        { start: 12, end: 24, status: 'online' }    // 12:00-00:00 整天在線
      ]
    }
  },
  {
    id: 'freelancer',
    name: '自由工作者',
    description: '平日彈性工作，假日完全放空',
    schedule: {
      // 平日：彈性工作
      workdayPeriods: [
        { start: 0, end: 9, status: 'offline' },    // 00:00-09:00 睡覺
        { start: 9, end: 11, status: 'online' },    // 09:00-11:00 早晨空閒
        { start: 11, end: 13, status: 'away' },     // 11:00-13:00 工作中
        { start: 13, end: 14, status: 'online' },   // 13:00-14:00 午休
        { start: 14, end: 17, status: 'away' },     // 14:00-17:00 工作中
        { start: 17, end: 23, status: 'online' },   // 17:00-23:00 晚間空閒
        { start: 23, end: 24, status: 'offline' }   // 23:00-00:00 睡覺
      ],
      // 假日：完全放空
      holidayPeriods: [
        { start: 0, end: 10, status: 'offline' },   // 00:00-10:00 睡到自然醒
        { start: 10, end: 24, status: 'online' }    // 10:00-00:00 完全放空
      ]
    }
  },
  {
    id: 'night-owl',
    name: '夜貓子',
    description: '晝伏夜出，假日更瘋狂',
    schedule: {
      // 平日：晚睡晚起
      workdayPeriods: [
        { start: 0, end: 4, status: 'online' },     // 00:00-04:00 深夜活躍
        { start: 4, end: 12, status: 'offline' },   // 04:00-12:00 睡覺
        { start: 12, end: 14, status: 'away' },     // 12:00-14:00 剛醒（迷糊）
        { start: 14, end: 24, status: 'online' }    // 14:00-00:00 活躍時間
      ],
      // 假日：徹夜不眠
      holidayPeriods: [
        { start: 0, end: 6, status: 'online' },     // 00:00-06:00 徹夜
        { start: 6, end: 14, status: 'offline' },   // 06:00-14:00 補眠
        { start: 14, end: 24, status: 'online' }    // 14:00-00:00 活躍時間
      ]
    }
  },
  {
    id: 'internet-addict',
    name: '網路成癮者',
    description: '幾乎整天在線，假日更誇張',
    schedule: {
      // 平日：幾乎整天在線
      workdayPeriods: [
        { start: 0, end: 2, status: 'online' },     // 00:00-02:00 深夜在線
        { start: 2, end: 8, status: 'offline' },    // 02:00-08:00 睡覺
        { start: 8, end: 24, status: 'online' }     // 08:00-00:00 整天在線
      ],
      // 假日：完全不睡
      holidayPeriods: [
        { start: 0, end: 5, status: 'online' },     // 00:00-05:00 深夜在線
        { start: 5, end: 10, status: 'offline' },   // 05:00-10:00 短暫補眠
        { start: 10, end: 24, status: 'online' }    // 10:00-00:00 整天在線
      ]
    }
  },
  {
    id: 'always-busy',
    name: '全天候忙碌',
    description: '不管平日假日都很忙，回覆像扭蛋',
    schedule: {
      workdayPeriods: [
        { start: 0, end: 7, status: 'offline' },    // 00:00-07:00 睡覺
        { start: 7, end: 23, status: 'away' },      // 07:00-23:00 忙碌
        { start: 23, end: 24, status: 'offline' }   // 23:00-00:00 睡覺
      ],
      holidayPeriods: [
        { start: 0, end: 9, status: 'offline' },    // 00:00-09:00 睡覺
        { start: 9, end: 21, status: 'away' },      // 09:00-23:00 忙碌（假日也忙）
        { start: 21, end: 23, status: 'online' },      // 09:00-23:00 假日難得上線
        { start: 23, end: 24, status: 'offline' }   // 23:00-00:00 睡覺
      ]
    }
  },
  {
    id: 'working-parent',
    name: '上班族父母',
    description: '平日上班 + 育兒，假日顧小孩，只有深夜才有自己的時間',
    schedule: {
      // 平日：白天上班，晚上育兒忙碌，小孩睡了才能上線
      workdayPeriods: [
        { start: 0, end: 1, status: 'online' },     // 00:00-01:00 小孩睡了，深夜自由時間
        { start: 1, end: 7, status: 'offline' },    // 01:00-07:00 睡覺
        { start: 7, end: 9, status: 'away' },       // 07:00-09:00 準備出門 + 送小孩
        { start: 9, end: 12, status: 'away' },      // 09:00-12:00 上班中
        { start: 12, end: 13, status: 'online' },   // 12:00-13:00 午休偷滑手機
        { start: 13, end: 18, status: 'away' },     // 13:00-18:00 上班中
        { start: 18, end: 21, status: 'away' },     // 18:00-21:00 接小孩、晚餐、陪玩
        { start: 21, end: 24, status: 'online' }    // 21:00-00:00 小孩睡了，自由時間
      ],
      // 假日：全天育兒，只有午睡和深夜能喘口氣
      holidayPeriods: [
        { start: 0, end: 1, status: 'online' },     // 00:00-01:00 深夜自由時間
        { start: 1, end: 8, status: 'offline' },    // 01:00-08:00 睡覺
        { start: 8, end: 13, status: 'offline' },   // 08:00-13:00 早上顧小孩（分身乏術）
        { start: 13, end: 15, status: 'online' },   // 13:00-15:00 小孩午睡，透口氣
        { start: 15, end: 21, status: 'away' },     // 15:00-21:00 下午帶小孩出去玩、晚餐
        { start: 21, end: 24, status: 'online' }    // 21:00-00:00 小孩睡了，終於有時間
      ]
    }
  },
  {
    id: 'shift-worker',
    name: '輪班工作者',
    description: '假日反而要上班，平日反而比較空閒',
    schedule: {
      // 平日：工時較短，空閒時間多
      workdayPeriods: [
        { start: 0, end: 8, status: 'offline' },    // 00:00-08:00 睡覺
        { start: 8, end: 10, status: 'online' },    // 08:00-10:00 早上空閒
        { start: 10, end: 16, status: 'away' },     // 10:00-16:00 短班上班
        { start: 16, end: 23, status: 'online' },   // 16:00-23:00 下班空閒
        { start: 23, end: 24, status: 'offline' }   // 23:00-00:00 睡覺
      ],
      // 假日：大家放假我上班，工時也比較長
      holidayPeriods: [
        { start: 0, end: 7, status: 'offline' },    // 00:00-07:00 睡覺
        { start: 7, end: 8, status: 'away' },       // 07:00-08:00 準備上班
        { start: 8, end: 18, status: 'away' },      // 08:00-18:00 假日長班
        { start: 18, end: 19, status: 'away' },     // 18:00-19:00 下班通勤
        { start: 19, end: 23, status: 'online' },   // 19:00-23:00 晚上空閒
        { start: 23, end: 24, status: 'offline' }   // 23:00-00:00 睡覺
      ]
    }
  },
]

// ==========================================
// 舊版作息時間模板（保留向後兼容）
// ==========================================

export interface ScheduleTemplate {
  id: string
  name: string
  description: string
  periods: ActivePeriod[]
}

// 舊版模板（不分平日/假日，保留給舊資料遷移用）
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
  },
  {
    id: 'always-busy',
    name: '全天候忙碌',
    description: '整天掛網的大忙人，會不會回覆是個謎，就像是扭蛋一樣',
    periods: [
      { start: 0, end: 2, status: 'offline' },
      { start: 2, end: 24, status: 'away' },
    ]
  },
]
