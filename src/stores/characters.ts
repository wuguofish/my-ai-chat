/**
 * 角色管理 Store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Character } from '@/types'
import { LIMITS, SCHEDULE_TEMPLATES_V2, SCHEDULE_TEMPLATES } from '@/utils/constants'

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
   * 更新角色情緒狀態
   * @param characterId 角色 ID
   * @param mood 情緒描述（例如："開心"、"有點煩躁"）
   */
  function updateCharacterMood(characterId: string, mood: string) {
    const character = characters.value.find(c => c.id === characterId)
    if (character) {
      character.mood = mood
      character.moodUpdatedAt = Date.now()
    }
  }

  /**
   * 清除角色情緒狀態
   */
  function clearCharacterMood(characterId: string) {
    const character = characters.value.find(c => c.id === characterId)
    if (character) {
      character.mood = undefined
      character.moodUpdatedAt = undefined
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
   * 舊模板 ID 對應到新模板 ID 的映射表
   * 舊版有些模板在新版被合併或重命名
   */
  const OLD_TO_NEW_TEMPLATE_MAP: Record<string, string> = {
    'always-online': 'always-online',
    'office-worker': 'office-worker',
    'student-early': 'student-early',
    'student-night': 'student-night',
    'freelancer-early': 'freelancer',      // 合併為單一「自由工作者」
    'freelancer-night': 'night-owl',       // 夜貓型自由工作者 → 夜貓子
    'internet-addict-early': 'internet-addict',  // 合併為單一「網路成癮者」
    'internet-addict-night': 'internet-addict',  // 合併為單一「網路成癮者」
    'always-busy': 'always-busy'
  }

  /**
   * 為舊角色遷移作息設定到新格式（schedule）
   * - 已有 schedule → 不做任何改動
   * - 有 activePeriods → 嘗試對應到新模板
   * - 沒有任何作息設定 → 使用「上班族」模板
   */
  function migrateCharacterSchedules() {
    const defaultTemplate = SCHEDULE_TEMPLATES_V2.find(t => t.id === 'office-worker')
    if (!defaultTemplate) return

    let migratedCount = 0
    const migrationLog: string[] = []

    characters.value.forEach(character => {
      // 如果已經有新格式 schedule，跳過
      if (character.schedule) return

      let targetTemplateId = 'office-worker'  // 預設

      // 嘗試從舊的 activePeriods 找到對應的舊模板
      if (character.activePeriods && character.activePeriods.length > 0) {
        const matchedOldTemplate = SCHEDULE_TEMPLATES.find(template =>
          JSON.stringify(template.periods) === JSON.stringify(character.activePeriods)
        )

        if (matchedOldTemplate) {
          // 找到對應的舊模板，映射到新模板
          targetTemplateId = OLD_TO_NEW_TEMPLATE_MAP[matchedOldTemplate.id] || 'office-worker'
          migrationLog.push(`${character.name}: ${matchedOldTemplate.id} → ${targetTemplateId}`)
        } else {
          migrationLog.push(`${character.name}: 自訂作息 → office-worker（預設）`)
        }
      } else {
        migrationLog.push(`${character.name}: 無作息設定 → office-worker（預設）`)
      }

      // 取得目標模板
      const targetTemplate = SCHEDULE_TEMPLATES_V2.find(t => t.id === targetTemplateId)
      if (targetTemplate) {
        character.schedule = {
          workdayPeriods: [...targetTemplate.schedule.workdayPeriods],
          holidayPeriods: [...targetTemplate.schedule.holidayPeriods]
        }
      } else {
        character.schedule = {
          workdayPeriods: [...defaultTemplate.schedule.workdayPeriods],
          holidayPeriods: [...defaultTemplate.schedule.holidayPeriods]
        }
      }

      // 清除舊格式欄位
      character.activePeriods = undefined
      character.activeHours = undefined
      migratedCount++
    })

    if (migratedCount > 0) {
      console.log(`✅ 已為 ${migratedCount} 位角色遷移作息設定到新格式（平日/假日分開）`)
      migrationLog.forEach(log => console.log(`   ${log}`))
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
    // 情緒系統
    updateCharacterMood,
    clearCharacterMood,
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
