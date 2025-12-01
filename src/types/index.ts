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
  events: string[]
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
  senderAvatar: string
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
}

export interface CharacterGlobalMemory {
  characterId: string
  importantMemories: Memory[]
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

export type RelationshipLevel = 'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'soulmate'
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
