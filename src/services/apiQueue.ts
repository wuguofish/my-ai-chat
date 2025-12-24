/**
 * API 請求佇列系統
 *
 * 用於控制 API 請求頻率，避免超過 rate limit (RPM)
 * 設計為可擴展架構，未來可支援多種 AI 服務
 */

// ==========================================
// 類型定義
// ==========================================

export interface QueueConfig {
  /** 佇列名稱（用於 debug） */
  name: string
  /** 每分鐘最大請求數 */
  rpm: number
  /** 請求間的隨機抖動範圍（毫秒），預設 0~2000ms */
  jitterMs?: number
}

export interface QueuedRequest<T> {
  /** 要執行的請求函數 */
  execute: () => Promise<T>
  /** 成功時的回調 */
  resolve: (value: T) => void
  /** 失敗時的回調 */
  reject: (error: Error) => void
  /** 請求描述（用於 debug） */
  description?: string
  /** 加入佇列的時間 */
  enqueuedAt: number
}

export interface QueueStatus {
  /** 佇列名稱 */
  name: string
  /** 佇列中等待的請求數 */
  pending: number
  /** 是否正在處理中 */
  isProcessing: boolean
  /** 下次可執行的時間（timestamp） */
  nextAvailableAt: number
}

// ==========================================
// API 佇列類別
// ==========================================

export class ApiQueue {
  private config: Required<QueueConfig>
  private queue: QueuedRequest<unknown>[] = []
  private isProcessing = false
  private lastRequestTime = 0
  private minInterval: number // 最小請求間隔（毫秒）

  constructor(config: QueueConfig) {
    this.config = {
      jitterMs: 2000,
      ...config
    }
    // 計算最小間隔：60秒 / RPM，再加上一點緩衝
    // 例如 RPM=5 → 間隔 12000ms，RPM=10 → 間隔 6000ms
    this.minInterval = Math.ceil(60000 / this.config.rpm)

    console.log(`[ApiQueue] 初始化佇列 "${this.config.name}"：RPM=${this.config.rpm}, 間隔=${this.minInterval}ms`)
  }

  /**
   * 將請求加入佇列
   * @param execute 要執行的請求函數
   * @param description 請求描述（用於 debug）
   * @returns Promise，當請求完成時 resolve
   */
  enqueue<T>(execute: () => Promise<T>, description?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        execute,
        resolve: resolve as (value: unknown) => void,
        reject,
        description,
        enqueuedAt: Date.now()
      }

      this.queue.push(request as QueuedRequest<unknown>)
      console.log(`[ApiQueue:${this.config.name}] 加入佇列: ${description || '未命名請求'}, 目前等待: ${this.queue.length}`)

      // 如果沒有在處理中，開始處理
      if (!this.isProcessing) {
        this.processQueue()
      }
    })
  }

  /**
   * 處理佇列中的請求
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return
    }

    this.isProcessing = true

    while (this.queue.length > 0) {
      const request = this.queue.shift()!

      // 計算需要等待的時間
      const now = Date.now()
      const timeSinceLastRequest = now - this.lastRequestTime
      const waitTime = Math.max(0, this.minInterval - timeSinceLastRequest)

      // 加入隨機抖動，避免固定節奏
      const jitter = Math.random() * this.config.jitterMs
      const totalWait = waitTime + jitter

      if (totalWait > 0) {
        console.log(`[ApiQueue:${this.config.name}] 等待 ${Math.round(totalWait)}ms 後執行: ${request.description || '未命名請求'}`)
        await this.sleep(totalWait)
      }

      // 執行請求
      try {
        console.log(`[ApiQueue:${this.config.name}] 執行請求: ${request.description || '未命名請求'}`)
        this.lastRequestTime = Date.now()
        const result = await request.execute()
        request.resolve(result)

        const queueTime = Date.now() - request.enqueuedAt
        console.log(`[ApiQueue:${this.config.name}] 請求完成: ${request.description || '未命名請求'}, 總耗時: ${queueTime}ms`)
      } catch (error) {
        console.error(`[ApiQueue:${this.config.name}] 請求失敗: ${request.description || '未命名請求'}`, error)
        request.reject(error as Error)
      }
    }

    this.isProcessing = false
  }

  /**
   * 取得佇列狀態
   */
  getStatus(): QueueStatus {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime
    const nextAvailableIn = Math.max(0, this.minInterval - timeSinceLastRequest)

    return {
      name: this.config.name,
      pending: this.queue.length,
      isProcessing: this.isProcessing,
      nextAvailableAt: Date.now() + nextAvailableIn
    }
  }

  /**
   * 清空佇列（取消所有等待中的請求）
   */
  clear(): void {
    const count = this.queue.length
    for (const request of this.queue) {
      request.reject(new Error('佇列已清空'))
    }
    this.queue = []
    console.log(`[ApiQueue:${this.config.name}] 已清空 ${count} 個等待中的請求`)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ==========================================
// 預設佇列實例
// ==========================================

/** Gemini 2.5 Flash 佇列（RPM: 5） */
export const geminiFlashQueue = new ApiQueue({
  name: 'gemini-flash',
  rpm: 5,
  jitterMs: 1500
})

/** Gemini 2.5 Flash Lite 佇列（RPM: 10） */
export const geminiFlashLiteQueue = new ApiQueue({
  name: 'gemini-flash-lite',
  rpm: 10,
  jitterMs: 1000
})

/** Claude Sonnet 佇列（RPM: 50，Tier 1） */
export const claudeSonnetQueue = new ApiQueue({
  name: 'claude-sonnet',
  rpm: 50,
  jitterMs: 300
})

/** Claude Haiku 佇列（RPM: 50，Tier 1） */
export const claudeHaikuQueue = new ApiQueue({
  name: 'claude-haiku',
  rpm: 50,
  jitterMs: 200
})

// ==========================================
// 便捷函數
// ==========================================

/**
 * 根據模型名稱取得對應的佇列
 */
export function getQueueForModel(model: string): ApiQueue {
  if (model.includes('lite')) {
    return geminiFlashLiteQueue
  }
  return geminiFlashQueue
}

/**
 * 取得所有佇列的狀態
 */
export function getAllQueueStatus(): QueueStatus[] {
  return [
    geminiFlashQueue.getStatus(),
    geminiFlashLiteQueue.getStatus(),
    claudeSonnetQueue.getStatus(),
    claudeHaikuQueue.getStatus()
  ]
}

/**
 * 清空所有佇列
 */
export function clearAllQueues(): void {
  geminiFlashQueue.clear()
  geminiFlashLiteQueue.clear()
  claudeSonnetQueue.clear()
  claudeHaikuQueue.clear()
}

// ==========================================
// Gemini 專用包裝函數
// ==========================================

export type GeminiModelType = 'gemini-2.5-flash' | 'gemini-2.5-flash-lite'

/**
 * 將 Gemini API 請求加入佇列
 * 這是主要的整合入口，各服務應使用此函數來發送 API 請求
 *
 * @param execute 要執行的 API 請求函數
 * @param model 使用的模型名稱
 * @param description 請求描述（用於 debug）
 * @returns Promise，當請求完成時 resolve
 *
 * @example
 * // 動態牆發文
 * const result = await enqueueGeminiRequest(
 *   () => model.generateContent(prompt),
 *   'gemini-2.5-flash-lite',
 *   '動態牆發文'
 * )
 */
export function enqueueGeminiRequest<T>(
  execute: () => Promise<T>,
  model: GeminiModelType,
  description?: string
): Promise<T> {
  const queue = model.includes('lite') ? geminiFlashLiteQueue : geminiFlashQueue
  return queue.enqueue(execute, description)
}

// ==========================================
// Claude 專用包裝函數
// ==========================================

export type ClaudeModelType = 'main' | 'lite'

/**
 * 將 Claude API 請求加入佇列
 * 根據模型類型選擇對應的佇列（Sonnet 或 Haiku）
 *
 * @param execute 要執行的 API 請求函數
 * @param modelType 模型類型：'main'（Sonnet）或 'lite'（Haiku）
 * @param description 請求描述（用於 debug）
 * @returns Promise，當請求完成時 resolve
 *
 * @example
 * // 角色對話（使用 Sonnet）
 * const result = await enqueueClaudeRequest(
 *   () => client.messages.create(params),
 *   'main',
 *   '角色對話：小明'
 * )
 *
 * // 動態牆發文（使用 Haiku）
 * const result = await enqueueClaudeRequest(
 *   () => client.messages.create(params),
 *   'lite',
 *   '動態牆發文：小明'
 * )
 */
export function enqueueClaudeRequest<T>(
  execute: () => Promise<T>,
  modelType: ClaudeModelType,
  description?: string
): Promise<T> {
  const queue = modelType === 'lite' ? claudeHaikuQueue : claudeSonnetQueue
  return queue.enqueue(execute, description)
}
