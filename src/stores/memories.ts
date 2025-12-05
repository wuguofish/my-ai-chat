/**
 * 記憶管理 Store
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { Memory, CharacterGlobalMemory, RoomContextMemory, MemorySource } from '@/types'

export const useMemoriesStore = defineStore('memories', () => {
  // State
  const characterMemories = ref<Record<string, CharacterGlobalMemory>>({})
  const roomMemories = ref<Record<string, RoomContextMemory>>({})

  // ==========================================
  // 輔助函數：觸發狀態訊息更新
  // ==========================================

  /**
   * 觸發角色狀態訊息自動生成
   * 這是一個背景任務，不會阻塞主流程
   */
  async function triggerStatusUpdate(characterId: string): Promise<void> {
    try {
      // 動態載入相關 stores 和工具函數（避免循環依賴）
      const { useCharacterStore } = await import('./characters')
      const { useUserStore } = await import('./user')
      const { generateStatusMessage } = await import('@/utils/chatHelpers')

      const characterStore = useCharacterStore()
      const userStore = useUserStore()

      // 檢查 API key
      if (!userStore.apiKey) {
        console.warn('無法生成狀態訊息：未設定 API key')
        return
      }

      // 取得角色資料
      const character = characterStore.getCharacterById(characterId)
      if (!character) {
        console.warn('無法生成狀態訊息：找不到角色', characterId)
        return
      }

      // 取得短期記憶作為上下文
      const shortTermMemories = getCharacterShortTermMemories(characterId)

      // 呼叫 AI 生成狀態訊息
      const statusMessage = await generateStatusMessage(
        character,
        { shortTermMemories },
        userStore.apiKey
      )

      // 更新狀態訊息
      characterStore.updateCharacterStatus(characterId, statusMessage)

      console.log(`✨ 已為 ${character.name} 自動生成狀態訊息: ${statusMessage}`)
    } catch (error) {
      console.error('自動生成狀態訊息時發生錯誤:', error)
      throw error
    }
  }

  // ==========================================
  // 角色全域記憶 (Long-term)
  // ==========================================

  /**
   * 取得角色的全域記憶
   */
  function getCharacterMemories(characterId: string): Memory[] {
    return characterMemories.value[characterId]?.importantMemories || []
  }

  /**
   * 新增角色全域記憶
   */
  async function addCharacterMemory(
    characterId: string,
    content: string,
    source: MemorySource = 'manual',
    sourceRoomId?: string
  ): Promise<Memory> {
    const memory: Memory = {
      id: uuidv4(),
      content,
      type: 'global',
      source,
      createdAt: new Date().toISOString(),
      sourceRoomId
    }

    if (!characterMemories.value[characterId]) {
      characterMemories.value[characterId] = {
        characterId,
        importantMemories: [],
        shortTermMemories: [],
        updatedAt: new Date().toISOString()
      }
    }

    characterMemories.value[characterId].importantMemories.push(memory)
    characterMemories.value[characterId].updatedAt = new Date().toISOString()

    // 觸發狀態訊息生成（背景執行，不阻塞）
    if (source === 'auto') {
      // 只有 AI 自動生成的長期記憶才觸發狀態更新
      triggerStatusUpdate(characterId).catch((err: unknown) => {
        console.warn('自動生成狀態訊息失敗:', err)
      })
    }

    return memory
  }

  /**
   * 批次新增角色全域記憶（避免重複觸發狀態更新）
   * @param contents - 記憶內容陣列
   */
  async function addCharacterMemories(
    characterId: string,
    contents: string[],
    source: MemorySource = 'manual',
    sourceRoomId?: string
  ): Promise<Memory[]> {
    const memories: Memory[] = []

    if (!characterMemories.value[characterId]) {
      characterMemories.value[characterId] = {
        characterId,
        importantMemories: [],
        shortTermMemories: [],
        updatedAt: new Date().toISOString()
      }
    }

    // 批次新增記憶
    for (const content of contents) {
      const memory: Memory = {
        id: uuidv4(),
        content,
        type: 'global',
        source,
        createdAt: new Date().toISOString(),
        sourceRoomId
      }
      characterMemories.value[characterId].importantMemories.push(memory)
      memories.push(memory)
    }

    characterMemories.value[characterId].updatedAt = new Date().toISOString()

    // 批次新增完畢後，只觸發一次狀態更新
    if (source === 'auto' && contents.length > 0) {
      triggerStatusUpdate(characterId).catch((err: unknown) => {
        console.warn('自動生成狀態訊息失敗:', err)
      })
    }

    return memories
  }

  /**
   * 取得角色的短期記憶
   */
  function getCharacterShortTermMemories(characterId: string): Memory[] {
    return characterMemories.value[characterId]?.shortTermMemories || []
  }

  /**
   * 新增角色短期記憶（智慧覆蓋機制）
   * - 未滿 6 筆：直接新增
   * - 已滿 6 筆且全未處理：返回 null（需要先處理記憶）
   * - 已滿 6 筆且有已處理：覆蓋最舊的已處理記憶
   */
  function addCharacterShortTermMemory(
    characterId: string,
    content: string,
    source: MemorySource = 'manual',
    sourceRoomId?: string
  ): Memory | null {
    const memory: Memory = {
      id: uuidv4(),
      content,
      type: 'context',
      source,
      createdAt: new Date().toISOString(),
      sourceRoomId,
      processed: false  // 新記憶預設為未處理
    }

    if (!characterMemories.value[characterId]) {
      characterMemories.value[characterId] = {
        characterId,
        importantMemories: [],
        shortTermMemories: [],
        updatedAt: new Date().toISOString()
      }
    }

    // 確保 shortTermMemories 欄位存在（向後相容舊資料）
    if (!characterMemories.value[characterId].shortTermMemories) {
      characterMemories.value[characterId].shortTermMemories = []
    }

    const memories = characterMemories.value[characterId].shortTermMemories
    const MAX_MEMORIES = 6

    // 情況 1: 未滿 6 筆，直接新增
    if (memories.length < MAX_MEMORIES) {
      memories.push(memory)
      characterMemories.value[characterId].updatedAt = new Date().toISOString()
      return memory
    }

    // 情況 2: 已滿 6 筆
    const unprocessedCount = memories.filter(m => !m.processed).length

    if (unprocessedCount === MAX_MEMORIES) {
      // 6 筆全部未處理 → 返回 null，需要先處理記憶
      return null
    }

    // 情況 3: 有已處理的記憶 → 覆蓋最舊的已處理記憶
    const oldestProcessedIndex = memories.findIndex(m => m.processed)
    if (oldestProcessedIndex !== -1) {
      memories[oldestProcessedIndex] = memory
      characterMemories.value[characterId].updatedAt = new Date().toISOString()
      return memory
    }

    // 理論上不應該到這裡，但安全起見
    return null
  }

  /**
   * 標記角色短期記憶為已處理
   */
  function markCharacterShortTermMemoriesAsProcessed(characterId: string) {
    const characterMem = characterMemories.value[characterId]
    if (!characterMem) return

    // 確保 shortTermMemories 存在（向後相容）
    if (!characterMem.shortTermMemories) {
      characterMem.shortTermMemories = []
    }

    characterMem.shortTermMemories.forEach(m => {
      m.processed = true
    })
    characterMem.updatedAt = new Date().toISOString()
  }

  /**
   * 更新角色短期記憶
   */
  function updateCharacterShortTermMemory(characterId: string, memoryId: string, content: string): boolean {
    const characterMem = characterMemories.value[characterId]
    if (!characterMem || !characterMem.shortTermMemories) return false

    const memory = characterMem.shortTermMemories.find(m => m.id === memoryId)
    if (!memory) return false

    memory.content = content
    characterMem.updatedAt = new Date().toISOString()
    return true
  }

  /**
   * 刪除角色短期記憶
   */
  function deleteCharacterShortTermMemory(characterId: string, memoryId: string): boolean {
    const characterMem = characterMemories.value[characterId]
    if (!characterMem || !characterMem.shortTermMemories) return false

    const index = characterMem.shortTermMemories.findIndex(m => m.id === memoryId)
    if (index === -1) return false

    characterMem.shortTermMemories.splice(index, 1)
    characterMem.updatedAt = new Date().toISOString()
    return true
  }

  /**
   * 檢查角色是否需要處理短期記憶（6 筆全未處理）
   */
  function shouldProcessCharacterMemories(characterId: string): boolean {
    const memories = characterMemories.value[characterId]?.shortTermMemories || []
    if (memories.length < 6) return false

    const unprocessedCount = memories.filter(m => !m.processed).length
    return unprocessedCount === 6
  }

  /**
   * 更新角色全域記憶
   */
  function updateCharacterMemory(characterId: string, memoryId: string, content: string): boolean {
    const memories = characterMemories.value[characterId]
    if (!memories) return false

    const memory = memories.importantMemories.find(m => m.id === memoryId)
    if (!memory) return false

    memory.content = content
    memories.updatedAt = new Date().toISOString()
    return true
  }

  /**
   * 刪除角色全域記憶
   */
  function deleteCharacterMemory(characterId: string, memoryId: string): boolean {
    const memories = characterMemories.value[characterId]
    if (!memories) return false

    const index = memories.importantMemories.findIndex(m => m.id === memoryId)
    if (index === -1) return false

    memories.importantMemories.splice(index, 1)
    memories.updatedAt = new Date().toISOString()
    return true
  }

  /**
   * 清除角色的所有全域記憶（包含短期記憶）
   */
  function clearCharacterMemories(characterId: string) {
    if (characterMemories.value[characterId]) {
      characterMemories.value[characterId].importantMemories = []
      characterMemories.value[characterId].shortTermMemories = []
      characterMemories.value[characterId].updatedAt = new Date().toISOString()
    }
  }

  // ==========================================
  // 聊天室情境記憶 (Short-term)
  // ==========================================

  /**
   * 取得聊天室的情境記憶
   */
  function getRoomMemories(roomId: string): Memory[] {
    return roomMemories.value[roomId]?.contextMemories || []
  }

  /**
   * 取得聊天室摘要
   */
  function getRoomSummary(roomId: string): string {
    return roomMemories.value[roomId]?.summary || ''
  }

  /**
   * 新增聊天室情境記憶（智慧覆蓋機制）
   * - 未滿 6 筆：直接新增
   * - 已滿 6 筆且全未處理：返回 null（需要先處理記憶）
   * - 已滿 6 筆且有已處理：覆蓋最舊的已處理記憶
   */
  function addRoomMemory(
    roomId: string,
    content: string,
    source: MemorySource = 'manual'
  ): Memory | null {
    const memory: Memory = {
      id: uuidv4(),
      content,
      type: 'context',
      source,
      createdAt: new Date().toISOString(),
      sourceRoomId: roomId,
      processed: false  // 新記憶預設為未處理
    }

    if (!roomMemories.value[roomId]) {
      roomMemories.value[roomId] = {
        roomId,
        contextMemories: [],
        summary: '',
        updatedAt: new Date().toISOString()
      }
    }

    const memories = roomMemories.value[roomId].contextMemories
    const MAX_MEMORIES = 6

    // 情況 1: 未滿 6 筆，直接新增
    if (memories.length < MAX_MEMORIES) {
      memories.push(memory)
      roomMemories.value[roomId].updatedAt = new Date().toISOString()
      return memory
    }

    // 情況 2: 已滿 6 筆
    const unprocessedCount = memories.filter(m => !m.processed).length

    if (unprocessedCount === MAX_MEMORIES) {
      // 6 筆全部未處理 → 返回 null，需要先處理記憶
      return null
    }

    // 情況 3: 有已處理的記憶 → 覆蓋最舊的已處理記憶
    const oldestProcessedIndex = memories.findIndex(m => m.processed)
    if (oldestProcessedIndex !== -1) {
      memories[oldestProcessedIndex] = memory
      roomMemories.value[roomId].updatedAt = new Date().toISOString()
      return memory
    }

    // 理論上不應該到這裡，但安全起見
    return null
  }

  /**
   * 更新聊天室情境記憶
   */
  function updateRoomMemory(roomId: string, memoryId: string, content: string): boolean {
    const memories = roomMemories.value[roomId]
    if (!memories) return false

    const memory = memories.contextMemories.find(m => m.id === memoryId)
    if (!memory) return false

    memory.content = content
    memories.updatedAt = new Date().toISOString()
    return true
  }

  /**
   * 刪除聊天室情境記憶
   */
  function deleteRoomMemory(roomId: string, memoryId: string): boolean {
    const memories = roomMemories.value[roomId]
    if (!memories) return false

    const index = memories.contextMemories.findIndex(m => m.id === memoryId)
    if (index === -1) return false

    memories.contextMemories.splice(index, 1)
    memories.updatedAt = new Date().toISOString()
    return true
  }

  /**
   * 更新聊天室摘要
   */
  function updateRoomSummary(roomId: string, summary: string) {
    if (!roomMemories.value[roomId]) {
      roomMemories.value[roomId] = {
        roomId,
        contextMemories: [],
        summary: '',
        updatedAt: new Date().toISOString()
      }
    }

    roomMemories.value[roomId].summary = summary
    roomMemories.value[roomId].updatedAt = new Date().toISOString()
  }

  /**
   * 標記短期記憶為已處理
   */
  function markRoomMemoriesAsProcessed(roomId: string) {
    const memories = roomMemories.value[roomId]
    if (!memories) return

    memories.contextMemories.forEach(m => {
      m.processed = true
    })
    memories.updatedAt = new Date().toISOString()
  }

  /**
   * 檢查是否需要處理記憶（6 筆全未處理）
   */
  function shouldProcessMemories(roomId: string): boolean {
    const memories = roomMemories.value[roomId]?.contextMemories || []
    if (memories.length < 6) return false

    const unprocessedCount = memories.filter(m => !m.processed).length
    return unprocessedCount === 6
  }

  /**
   * 清除聊天室的所有情境記憶（保留摘要）
   */
  function clearRoomMemories(roomId: string) {
    if (roomMemories.value[roomId]) {
      roomMemories.value[roomId].contextMemories = []
      roomMemories.value[roomId].updatedAt = new Date().toISOString()
    }
  }

  /**
   * 清除聊天室的所有資料（包含摘要）
   */
  function clearRoomData(roomId: string) {
    delete roomMemories.value[roomId]
  }

  // ==========================================
  // 資料遷移
  // ==========================================

  /**
   * 將舊版本的 room contextMemories 遷移為新版本格式
   * 適用於從舊版本升級的資料（舊版本只有私聊）
   *
   * 遷移邏輯：
   * 1. 舊記憶 → 角色短期記憶（character-bound）
   * 2. 最後一筆 → 聊天室情境（room summary）
   *
   * @param chatRooms 聊天室列表（用於查詢 room 對應的 characterId）
   */
  function migrateLegacyRoomMemories(chatRooms: any[]) {
    Object.keys(roomMemories.value).forEach(roomId => {
      const roomMem = roomMemories.value[roomId]

      // 如果有舊的 contextMemories 但沒有 summary（新版本的聊天室情境）
      if (roomMem) { 
        if (roomMem.contextMemories && roomMem.contextMemories.length > 0 && !roomMem.summary) {
          const oldMemoriesCount = roomMem.contextMemories.length

          // 找到這個 room 對應的 character（舊版本只有私聊，characterIds 只有一個）
          const room = chatRooms.find(r => r.id === roomId)
          const characterId = room?.characterIds?.[0]

          if (characterId) {
            // 1. 將舊記憶轉成角色短期記憶
            roomMem.contextMemories.forEach(oldMemory => {
              // 使用內部函數新增短期記憶，會自動處理覆蓋邏輯
              addCharacterShortTermMemory(
                characterId,
                oldMemory.content,
                oldMemory.source || 'auto',
                roomId
              )
            })

            // 2. 取最後一筆作為聊天室情境
              const lastMemory = roomMem.contextMemories[roomMem.contextMemories.length - 1]
              
            if (lastMemory) { 
              roomMem.summary = lastMemory.content
            }

            console.log(`已遷移聊天室 ${roomId} 的 ${oldMemoriesCount} 筆舊記憶：`)
            console.log(`  - ${oldMemoriesCount} 筆 → 角色 ${characterId} 的短期記憶`)
            console.log(`  - 最後一筆 → 聊天室情境`)
          } else {
            // 找不到對應角色，只能把最後一筆設為聊天室情境
            const lastMemory = roomMem.contextMemories[roomMem.contextMemories.length - 1]
            if (lastMemory) { 
              roomMem.summary = lastMemory.content
            }              
            console.log(`已遷移聊天室 ${roomId} 的最後一筆記憶為情境（找不到對應角色）`)
          }

          // 清空舊的 contextMemories（已經不再使用）
          roomMem.contextMemories = []
          roomMem.updatedAt = new Date().toISOString()
        }
      }
    })
  }

  // ==========================================
  // 清除所有資料
  // ==========================================

  function clearAllData() {
    characterMemories.value = {}
    roomMemories.value = {}
  }

  return {
    // State
    characterMemories,
    roomMemories,

    // Character Memories (Long-term)
    getCharacterMemories,
    addCharacterMemory,
    addCharacterMemories,
    updateCharacterMemory,
    deleteCharacterMemory,
    clearCharacterMemories,

    // Character Short-term Memories
    getCharacterShortTermMemories,
    addCharacterShortTermMemory,
    updateCharacterShortTermMemory,
    deleteCharacterShortTermMemory,
    markCharacterShortTermMemoriesAsProcessed,
    shouldProcessCharacterMemories,

    // Room Memories
    getRoomMemories,
    getRoomSummary,
    addRoomMemory,
    updateRoomMemory,
    deleteRoomMemory,
    updateRoomSummary,
    markRoomMemoriesAsProcessed,
    shouldProcessMemories,
    clearRoomMemories,
    clearRoomData,

    // Migration
    migrateLegacyRoomMemories,

    // Clear All
    clearAllData
  }
}, {
  persist: {
    key: 'ai-chat-memories',
    storage: localStorage
  }
})
