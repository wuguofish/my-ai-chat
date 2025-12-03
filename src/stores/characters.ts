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
    // Migration
    migrateCharacterSchedules
  }
}, {
  persist: {
    key: 'ai-chat-characters',
    storage: localStorage
  }
})
