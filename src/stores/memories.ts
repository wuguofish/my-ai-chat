/**
 * 記憶管理 Store
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { Memory, CharacterGlobalMemory, RoomContextMemory, MemoryType, MemorySource } from '@/types'

export const useMemoriesStore = defineStore('memories', () => {
  // State
  const characterMemories = ref<Record<string, CharacterGlobalMemory>>({})
  const roomMemories = ref<Record<string, RoomContextMemory>>({})

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
  function addCharacterMemory(
    characterId: string,
    content: string,
    source: MemorySource = 'manual',
    sourceRoomId?: string
  ): Memory {
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
        updatedAt: new Date().toISOString()
      }
    }

    characterMemories.value[characterId].importantMemories.push(memory)
    characterMemories.value[characterId].updatedAt = new Date().toISOString()

    return memory
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
   * 清除角色的所有全域記憶
   */
  function clearCharacterMemories(characterId: string) {
    if (characterMemories.value[characterId]) {
      characterMemories.value[characterId].importantMemories = []
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

    // Character Memories
    getCharacterMemories,
    addCharacterMemory,
    updateCharacterMemory,
    deleteCharacterMemory,
    clearCharacterMemories,

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

    // Clear All
    clearAllData
  }
}, {
  persist: {
    key: 'ai-chat-memories',
    storage: localStorage
  }
})
