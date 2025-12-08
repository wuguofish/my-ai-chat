/**
 * 角色管理 Store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Character } from '@/types'
import { LIMITS, SCHEDULE_TEMPLATES } from '@/utils/constants'

export const useCharacterStore = defineStore('characters', () => {
  // State
  const characters = ref<Character[]>([])

  // Getters
  const characterCount = computed(() => characters.value.length)
  const canAddMore = computed(() => characterCount.value < LIMITS.MAX_CHARACTERS)

  // 根據 ID 取得角色
  const getCharacterById = (id: string) => {
    return characters.value.find(c => c.id === id)
  }

  // 根據名稱取得角色
  const getCharacterByName = (name: string) => {
    return characters.value.find(c => c.name === name)
  }

  // Actions
  function addCharacter(character: Character) {
    if (!canAddMore.value) {
      throw new Error(`好友數量已達上限（${LIMITS.MAX_CHARACTERS}位）`)
    }
    characters.value.push(character)
    return character
  }

  function updateCharacter(character: Character) {
    const index = characters.value.findIndex(c => c.id === character.id)
    if (index !== -1) {
      characters.value[index] = character
    }
  }

  function deleteCharacter(id: string) {
    const index = characters.value.findIndex(c => c.id === id)
    if (index !== -1) {
      characters.value.splice(index, 1)
    }
  }

  function clearCharacters() {
    characters.value = []
  }

  /**
   * 更新角色狀態訊息
   */
  function updateCharacterStatus(characterId: string, message: string) {
    const character = characters.value.find(c => c.id === characterId)
    if (character) {
      character.statusMessage = message
      character.statusUpdatedAt = Date.now()
    }
  }

  /**
   * 清除角色狀態訊息
   */
  function clearCharacterStatus(characterId: string) {
    const character = characters.value.find(c => c.id === characterId)
    if (character) {
      character.statusMessage = undefined
      character.statusUpdatedAt = undefined
    }
  }

  /**
   * 更新角色在特定聊天室的最後已讀狀態
   * 每次角色發送訊息時應該呼叫此函數
   */
  function updateLastRead(characterId: string, chatRoomId: string, timestamp: number, messageId?: string) {
    const character = characters.value.find(c => c.id === characterId)
    if (character) {
      if (!character.lastReadMessages) {
        character.lastReadMessages = {}
      }
      character.lastReadMessages[chatRoomId] = {
        lastReadAt: timestamp,
        lastReadMessageId: messageId
      }
    }
  }

  /**
   * 取得角色在特定聊天室的最後已讀時間
   */
  function getLastReadTime(characterId: string, chatRoomId: string): number | null {
    const character = characters.value.find(c => c.id === characterId)
    return character?.lastReadMessages?.[chatRoomId]?.lastReadAt ?? null
  }

  /**
   * 為沒有作息設定的舊角色加上預設作息（上班族）
   */
  function migrateCharacterSchedules() {
    const officeWorkerTemplate = SCHEDULE_TEMPLATES.find(t => t.id === 'office-worker')
    if (!officeWorkerTemplate) return

    let migratedCount = 0

    characters.value.forEach(character => {
      // 如果角色沒有 activePeriods 或是空陣列，加上預設值
      if (!character.activePeriods || character.activePeriods.length === 0) {
        character.activePeriods = [...officeWorkerTemplate.periods]
        migratedCount++
      }
    })

    if (migratedCount > 0) {
      console.log(`已為 ${migratedCount} 位角色設定預設作息（上班族）`)
    }
  }

  return {
    // State
    characters,
    // Getters
    characterCount,
    canAddMore,
    getCharacterById,
    getCharacterByName,
    // Actions
    addCharacter,
    updateCharacter,
    deleteCharacter,
    clearCharacters,
    updateCharacterStatus,
    clearCharacterStatus,
    // 未讀訊息系統
    updateLastRead,
    getLastReadTime,
    // Migration
    migrateCharacterSchedules
  }
}, {
  persist: {
    key: 'ai-chat-characters',
    storage: localStorage
  }
})
