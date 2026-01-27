/**
 * AI Chat 應用程式型別定義
 */

// ==========================================
// 使用者相關
// ==========================================

/**
 * 支援的 LLM 服務商
 */
export type LLMProviderType = 'gemini' | 'openai' | 'claude' | 'grok'

/**
 * LLM 設定
 */
export interface LLMSettings {
  /** 預設服務商 */
  defaultProvider: LLMProviderType
  /** 各服務商的 API Key */
  apiKeys: {
    gemini?: string
    openai?: string
    claude?: string
    grok?: string
  }
}

export interface UserProfile {
  id: 'user'
  nickname: string      // 暱稱
  realName?: string     // 本名
  age?: string          // 年齡
  gender?: Gender       // 性別
  birthday?: string     // 生日 (MM-DD 格式，只記錄月日)
  profession?: string   // 職業
  bio?: string          // 簡介（最多250字）
  avatar: string
  globalSystemPrompt?: string  // 全域自訂 System Prompt（會附加在所有角色的 prompt 後面）

  /** @deprecated 使用 llmSettings.apiKeys.gemini 替代 */
  apiConfig: {
    geminiApiKey: string
  }

  /** LLM 服務設定 */
  llmSettings?: LLMSettings

  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-TW' | 'zh-CN' | 'en'

  memoryManagement: {
    mode: 'auto' | 'manual'
    autoMergeEnabled: boolean
    showMemoryWarnings: boolean
  }

  sync: {
    enableGoogleDrive: boolean
    lastSyncTime?: string
  }

  privacy: {
    confirmBeforeApiCall: boolean
  }
}

// ==========================================
// 角色相關
// ==========================================

export type Gender = 'male' | 'female' | 'unset'

// 角色在線狀態
export type CharacterStatus = 'online' | 'away' | 'offline'

// 作息時段
export interface ActivePeriod {
  start: number  // 0-23
  end: number    // 0-23
  status: CharacterStatus
}

// 新版作息設定（區分平日/假日）
export interface ScheduleConfig {
  workdayPeriods: ActivePeriod[]  // 上班日（週一～週五，非國定假日）
  holidayPeriods: ActivePeriod[]  // 放假日（週末 + 國定假日）
}

export interface Event {
  id: string
  title: string
  timeAndPlace?: string
  content: string
}

export interface Character {
  id: string
  name: string
  avatar: string
  age?: string
  gender?: Gender
  birthday?: string     // 生日 (MM-DD 格式，只記錄月日)
  profession?: string
  personality: string
  speakingStyle?: string
  background?: string
  likes?: string
  dislikes?: string
  systemPrompt?: string
  maxOutputTokens?: number
  events: string[]

  // 作息時間設定（支援多種格式）
  activeHours?: {
    start: number  // 0-23，例如 8 代表早上 8 點
    end: number    // 0-23，例如 23 代表晚上 11 點
  }
  activePeriods?: ActivePeriod[]  // 舊格式：支援多時段（不分平日假日）
  schedule?: ScheduleConfig       // 新格式：區分平日/假日

  // 匯入的角色卡 metadata（保留原作者資訊）
  importedMetadata?: {
    author?: string
    contributors?: string[]
    exportVersion?: string
    exportTime?: string
    appName?: string
  }

  // 狀態訊息（類似 LINE 的個人狀態）
  statusMessage?: string
  statusUpdatedAt?: number  // 狀態訊息更新時間戳

  // 角色當前情緒狀態（由 AI 根據對話內容評估）
  mood?: string             // 例如："開心"、"有點煩躁"、"期待"
  moodUpdatedAt?: number    // 情緒更新時間戳

  // 是否為隱藏設定的名片（匯入時不顯示詳細設定）
  isPrivate?: boolean

  // LLM 服務商設定
  llmProvider?: LLMProviderType            // 角色使用的服務商（未設定時使用全域預設）
  recommendedProvider?: LLMProviderType    // 名片匯入時保留的原作者建議

  // 各聊天室的最後已讀狀態（用於未讀訊息回應系統）
  lastReadMessages?: {
    [chatRoomId: string]: {
      lastReadAt: number       // 最後已讀時間戳
      lastReadMessageId?: string  // 最後已讀訊息 ID
    }
  }

  createdAt: string
  updatedAt: string
}

// ==========================================
// 聊天室相關
// ==========================================

export type ChatRoomType = 'single' | 'group'

export interface ChatRoom {
  id: string
  name: string
  type: ChatRoomType
  characterIds: string[]
  avatar?: string

  settings: {
    autoReplyAll: boolean
    replyProbability: number
  }

  createdAt: string
  lastMessageAt: string
}

export type MessageType = 'user' | 'character' | 'system' | 'auto_response'

/**
 * 圖片附件（用於聊天訊息）
 */
export interface ImageAttachment {
  id: string
  data: string       // Base64 編碼（含 data:image/xxx;base64, 前綴）
  mimeType: string   // 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  width: number
  height: number
}

export interface Message {
  id: string
  roomId: string
  senderId: string  // 'user' or characterId or 'system'
  senderName: string
  content: string
  timestamp: string
  type?: MessageType  // 訊息類型，預設為 user/character，系統訊息為 system

  mentionedCharacterIds?: string[]
  replyToMessageId?: string

  /** 圖片附件（僅私聊支援） */
  images?: ImageAttachment[]
}

// ==========================================
// 記憶系統
// ==========================================

export type MemoryType = 'global' | 'context'
export type MemorySource = 'manual' | 'auto_chat' | 'auto_feed'

export interface Memory {
  id: string
  content: string
  type: MemoryType
  source: MemorySource
  createdAt: string
  sourceRoomId?: string
  processed?: boolean  // 標記短期記憶是否已處理（升級為長期記憶）
}

export interface CharacterGlobalMemory {
  characterId: string
  importantMemories: Memory[]  // 長期記憶
  shortTermMemories: Memory[]  // 短期記憶緩衝區（最多 6 筆，跨所有聊天室）
  updatedAt: string
}

export interface RoomContextMemory {
  roomId: string
  contextMemories: Memory[]
  summary: string
  updatedAt: string
}

// ==========================================
// 關係系統
// ==========================================

export type RelationshipLevel = 'enemy' | 'dislike' | 'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'soulmate'
export type CharacterRelationType = 'neutral' | 'friend' | 'rival' | 'family' | 'romantic' | 'custom'

export interface UserCharacterRelationship {
  characterId: string
  level: RelationshipLevel
  affection: number
  isRomantic: boolean
  note: string
  updatedAt: string
}

export interface CharacterRelationship {
  fromCharacterId: string
  toCharacterId: string
  relationshipType: CharacterRelationType
  description: string  // 玩家可編輯的關係描述
  note?: string
  state?: string       // LLM 評估的最新關係狀態（可編輯/刪除）
  updatedAt?: number   // 最後更新時間戳
}

// ==========================================
// 應用程式資料
// ==========================================

export interface AppData {
  version: string

  user: UserProfile
  settings: AppSettings

  characters: Character[]
  chatRooms: ChatRoom[]

  memories: {
    characterMemories: Record<string, CharacterGlobalMemory>
    roomMemories: Record<string, RoomContextMemory>
  }

  relationships: {
    userToCharacter: UserCharacterRelationship[]
    characterToCharacter: CharacterRelationship[]
  }

  conversations: Record<string, Message[]>

  createdAt: string
  updatedAt: string
}

// ==========================================
// 匯出格式
// ==========================================

export type ExportType = 'full' | 'character' | 'room'

export interface ExportData extends AppData {
  exportTime: string
  exportType: ExportType
}

// ==========================================
// 關係等級資訊
// ==========================================

export interface RelationshipLevelInfo {
  name: string
  affectionRange: [number, number]
  color: string
  description?: string
}

// ==========================================
// 動態牆系統
// ==========================================

export type PostTriggerEvent =
  | 'mood_change'           // 情緒改變
  | 'relationship_change'   // 關係等級變化
  | 'new_memory'            // 新的長期記憶
  | 'come_online'           // 角色上線
  | 'birthday'              // 生日
  | 'holiday'               // 特殊節日
  | 'daily_catchup'         // 每日首次開啟 App
  | 'user_post'             // 使用者發文

export interface PostLike {
  oderId: string            // 'user' 或 characterId
  timestamp: number
}

export interface PostComment {
  id: string
  authorId: string          // 'user' 或 characterId
  authorName: string
  content: string
  timestamp: number
  floor?: number            // 樓層編號（從 1 開始）
  replyTo?: string[]        // 回覆的留言 ID（可多個）
  replyToFloors?: number[]  // 回覆的樓層編號（可多個，用於顯示「回 #1 #2」）
  likes?: PostLike[]        // 留言按讚列表
}

export interface Post {
  id: string
  authorId: string          // 'user' 或 characterId
  authorName: string
  content: string
  timestamp: number

  // 觸發來源（用於 debug 和統計）
  triggerEvent?: PostTriggerEvent

  // 互動數據
  likes: PostLike[]
  comments: PostComment[]

  // 貼文摘要（超過 36 小時後生成，存入參與者的短期記憶）
  summarized?: boolean
}

export type FeedNotificationType = 'like' | 'comment' | 'mention' | 'comment_like'

export interface FeedNotification {
  id: string
  type: FeedNotificationType
  postId: string
  postPreview: string       // 動態內容預覽（前 30 字）
  actorId: string           // 觸發者 ID
  actorName: string
  timestamp: number
  read: boolean
}
