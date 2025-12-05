/**
 * AI Chat 應用程式型別定義
 */

// ==========================================
// 使用者相關
// ==========================================

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
  apiConfig: {
    geminiApiKey: string
  }
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
  profession?: string
  personality: string
  speakingStyle?: string
  background?: string
  likes?: string
  dislikes?: string
  systemPrompt?: string
  maxOutputTokens?: number
  events: string[]

  // 作息時間設定（支援舊格式和新格式）
  activeHours?: {
    start: number  // 0-23，例如 8 代表早上 8 點
    end: number    // 0-23，例如 23 代表晚上 11 點
  }
  activePeriods?: ActivePeriod[]  // 新格式：支援多時段

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

export interface Message {
  id: string
  roomId: string
  senderId: string  // 'user' or characterId
  senderName: string
  content: string
  timestamp: string

  mentionedCharacterIds?: string[]
  replyToMessageId?: string
}

// ==========================================
// 記憶系統
// ==========================================

export type MemoryType = 'global' | 'context'
export type MemorySource = 'manual' | 'auto'

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
  description: string
  note?: string
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
