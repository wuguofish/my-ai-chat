/**
 * 角色管理 Store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Character } from '@/types'
import { LIMITS } from '@/utils/constants'

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
    clearCharacters
  }
}, {
  persist: {
    key: 'ai-chat-characters',
    storage: localStorage
  }
})
