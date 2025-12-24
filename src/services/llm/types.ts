/**
 * LLM 服務層 - 統一介面定義
 */

import type { Character, Message, UserProfile, ChatRoom } from '@/types'
import type { SystemPromptContext } from '@/utils/chatHelpers'

/**
 * 支援的 LLM 服務商
 */
export type LLMProvider = 'gemini' | 'openai' | 'claude' | 'grok'

/**
 * 模型類型
 */
export type ModelType = 'main' | 'lite'

/**
 * 安全模式設定
 */
export type SafetyLevel = 'safe' | 'unrestricted'

/**
 * 對話訊息格式（統一格式，各 adapter 自行轉換）
 */
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * 建立模型的選項
 */
export interface CreateModelOptions {
  /** 使用的模型類型 */
  modelType?: ModelType
  /** System Instruction */
  systemInstruction?: string
  /** 溫度 (0-2) */
  temperature?: number
  /** 最大輸出 token 數 */
  maxOutputTokens?: number
  /** Top P */
  topP?: number
  /** Top K (部分服務商支援) */
  topK?: number
  /** 是否使用安全模式 */
  safeMode?: boolean
}

/**
 * 內容生成請求選項
 */
export interface GenerateOptions extends CreateModelOptions {
  /** 對話歷史 */
  history?: LLMMessage[]
  /** 佇列描述（用於 API 請求佇列的顯示） */
  queueDescription?: string
  /** 回應格式（例如 'application/json' 強制 JSON 輸出） */
  responseMimeType?: string
  /** API Key（內部使用，外部呼叫時會自動從 userStore 取得） */
  apiKey?: string
}

/**
 * 內容生成回應
 */
export interface GenerateResponse {
  /** 回應文字 */
  text: string
  /** 原始回應物件（各服務商不同） */
  raw?: unknown
  /** 是否被封鎖 */
  blocked?: boolean
  /** 封鎖原因 */
  blockReason?: string
  /** 結束原因 */
  finishReason?: string
}

/**
 * API Key 驗證結果
 */
export interface ValidateApiKeyResult {
  valid: boolean
  error?: string
}

/**
 * 角色回應參數
 */
export interface GetCharacterResponseParams {
  character: Character
  user: UserProfile
  room?: ChatRoom
  messages: Message[]
  userMessage: string
  context?: Partial<SystemPromptContext>
}

/**
 * 角色回應結果
 */
export interface CharacterResponse {
  /** 回應文字 */
  text: string
  /** 新的好感度 */
  newAffection?: number
  /** 是否為靜默更新（AI 只回傳好感度，無實際對話內容） */
  silentUpdate?: boolean
}

/**
 * LLM Adapter 介面
 * 各服務商需實作此介面
 */
export interface LLMAdapter {
  /** 服務商識別 */
  readonly provider: LLMProvider

  /**
   * 驗證 API Key
   * 注意：此方法需要外部傳入 apiKey，因為可能用於驗證尚未儲存的 key
   */
  validateApiKey(apiKey: string): Promise<ValidateApiKeyResult>

  /**
   * 生成內容（單次請求）
   * 用於摘要、動態、記憶等簡單的內容生成任務
   * API Key 會自動從 userStore 取得
   */
  generate(
    messages: LLMMessage[],
    options?: GenerateOptions
  ): Promise<GenerateResponse>

  /**
   * 取得角色回應（包含完整的前後處理邏輯）
   * 用於角色對話/群聊等複雜情境
   * API Key 會自動從 userStore 取得
   */
  getCharacterResponse(params: GetCharacterResponseParams): Promise<CharacterResponse>
}

/**
 * 內容被封鎖錯誤
 */
export class ContentBlockedError extends Error {
  reason: string

  constructor(reason: string, message: string) {
    super(message)
    this.name = 'ContentBlockedError'
    this.reason = reason
  }
}
