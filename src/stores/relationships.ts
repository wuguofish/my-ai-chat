import { defineStore } from 'pinia'
import type {
  UserCharacterRelationship,
  CharacterRelationship,
  CharacterRelationType,
  RelationshipLevel
} from '@/types'
import { getRelationshipLevelByAffection } from '@/utils/relationshipHelpers'

interface RelationshipsState {
  userToCharacter: UserCharacterRelationship[]
  characterToCharacter: CharacterRelationship[]
}

export const useRelationshipsStore = defineStore('relationships', {
  state: (): RelationshipsState => ({
    userToCharacter: [],
    characterToCharacter: []
  }),

  getters: {
    // 取得使用者與特定角色的關係
    getUserCharacterRelationship: (state) => (characterId: string) => {
      
      return state.userToCharacter.find(r => r.characterId === characterId)
    },

    // 取得特定角色與其他角色的關係
    getCharacterRelationships: (state) => (characterId: string) => {
      return state.characterToCharacter.filter(
        r => r.fromCharacterId === characterId || r.toCharacterId === characterId
      )
    },

    // 取得兩個角色之間的關係（單向：from → to）
    getRelationshipBetween: (state) => (fromId: string, toId: string) => {
      return state.characterToCharacter.find(
        r => r.fromCharacterId === fromId && r.toCharacterId === toId
      )
    },

    // 取得兩個角色對彼此的關係（雙向查詢）
    getRelationshipPair: (state) => (char1Id: string, char2Id: string) => {
      const fromChar1 = state.characterToCharacter.find(
        r => r.fromCharacterId === char1Id && r.toCharacterId === char2Id
      )
      const fromChar2 = state.characterToCharacter.find(
        r => r.fromCharacterId === char2Id && r.toCharacterId === char1Id
      )
      return { fromChar1, fromChar2 }
    },

    // 根據好感度計算關係等級（使用統一的 helper 函數）
    calculateRelationshipLevel: () => (affection: number): RelationshipLevel => {
      return getRelationshipLevelByAffection(affection)
    }
  },

  actions: {
    // 初始化使用者與角色的關係
    initUserCharacterRelationship(characterId: string) {
      const existing = this.userToCharacter.find(r => r.characterId === characterId)
      if (!existing) {
        this.userToCharacter.push({
          characterId,
          level: 'stranger',
          affection: 0,
          isRomantic: false,
          note: '',
          updatedAt: new Date().toISOString()
        })
      }
    },

    // 更新好感度
    async updateAffection(characterId: string, affection: number) {
      const relationship = this.userToCharacter.find(r => r.characterId === characterId)
      if (relationship) {
        const oldLevel = relationship.level
        relationship.affection = affection // 允許負數好感度
        const newLevel = this.calculateRelationshipLevel(relationship.affection)
        relationship.level = newLevel
        relationship.updatedAt = new Date().toISOString()

        // 如果關係等級變化了，觸發狀態訊息更新
        if (oldLevel !== newLevel) {
          console.log(`✨ 關係等級變化: ${oldLevel} → ${newLevel}`)
          this.triggerStatusUpdateOnRelationshipChange(characterId).catch((err: unknown) => {
            console.warn('關係等級變化時自動生成狀態訊息失敗:', err)
          })
        }
      }
    },

    /**
     * 觸發狀態訊息更新（關係變化時）
     */
    async triggerStatusUpdateOnRelationshipChange(characterId: string): Promise<void> {
      try {
        // 動態載入 stores 和工具函數
        const { useCharacterStore } = await import('./characters')
        const { useUserStore } = await import('./user')
        const { useMemoriesStore } = await import('./memories')
        const { generateStatusMessage } = await import('@/utils/chatHelpers')

        const characterStore = useCharacterStore()
        const userStore = useUserStore()
        const memoriesStore = useMemoriesStore()

        // 檢查 API key
        if (!userStore.apiKey) return

        // 取得角色
        const character = characterStore.getCharacterById(characterId)
        if (!character) return

        // 取得短期記憶
        const shortTermMemories = memoriesStore.getCharacterShortTermMemories(characterId)

        // 生成狀態訊息（帶入角色情緒）
        const statusMessage = await generateStatusMessage(
          character,
          { shortTermMemories, mood: character.mood },
          userStore.apiKey,
          userStore.profile?.age
        )

        // 更新
        characterStore.updateCharacterStatus(characterId, statusMessage)
        console.log(`✨ 已為 ${character.name} 因關係變化生成狀態訊息: ${statusMessage}`)
      } catch (error) {
        console.error('關係變化時生成狀態訊息失敗:', error)
        throw error
      }
    },

    // 設定親密關係開關
    toggleRomantic(characterId: string, isRomantic: boolean) {
      const relationship = this.userToCharacter.find(r => r.characterId === characterId)
      if (relationship) {
        relationship.isRomantic = isRomantic
        relationship.updatedAt = new Date().toISOString()
      }
    },

    // 更新關係備註
    updateRelationshipNote(characterId: string, note: string) {
      const relationship = this.userToCharacter.find(r => r.characterId === characterId)
      if (relationship) {
        relationship.note = note
        relationship.updatedAt = new Date().toISOString()
      }
    },

    // 新增角色間關係
    addCharacterRelationship(relationship: CharacterRelationship, bidirectional: boolean = false) {
      const existing = this.characterToCharacter.find(
        r =>
          r.fromCharacterId === relationship.fromCharacterId &&
          r.toCharacterId === relationship.toCharacterId
      )
      if (!existing) {
        this.characterToCharacter.push(relationship)
      }

      // 如果是雙向關係，同時建立反向關係
      if (bidirectional) {
        const reverseExists = this.characterToCharacter.find(
          r =>
            r.fromCharacterId === relationship.toCharacterId &&
            r.toCharacterId === relationship.fromCharacterId
        )
        if (!reverseExists) {
          this.characterToCharacter.push({
            fromCharacterId: relationship.toCharacterId,
            toCharacterId: relationship.fromCharacterId,
            relationshipType: relationship.relationshipType,
            description: relationship.description,
            note: relationship.note
          })
        }
      }
    },

    // 更新角色間關係
    updateCharacterRelationship(
      fromCharacterId: string,
      toCharacterId: string,
      updates: Partial<CharacterRelationship>,
      bidirectional: boolean = false
    ) {
      const relationship = this.characterToCharacter.find(
        r => r.fromCharacterId === fromCharacterId && r.toCharacterId === toCharacterId
      )
      if (relationship) {
        Object.assign(relationship, updates)
      }

      // 如果是雙向同步
      if (bidirectional) {
        const reverseRelationship = this.characterToCharacter.find(
          r => r.fromCharacterId === toCharacterId && r.toCharacterId === fromCharacterId
        )
        if (reverseRelationship) {
          // 反向關係已存在，更新它
          Object.assign(reverseRelationship, updates)
        } else if (relationship) {
          // 反向關係不存在，建立新的反向關係
          this.characterToCharacter.push({
            fromCharacterId: toCharacterId,
            toCharacterId: fromCharacterId,
            relationshipType: updates.relationshipType || relationship.relationshipType,
            description: updates.description || relationship.description,
            note: updates.note !== undefined ? updates.note : relationship.note
          })
        }
      }
    },

    // 刪除角色間關係（雙向檢查）
    deleteCharacterRelationship(fromCharacterId: string, toCharacterId: string) {
      const index = this.characterToCharacter.findIndex(
        r =>
          (r.fromCharacterId === fromCharacterId && r.toCharacterId === toCharacterId) ||
          (r.fromCharacterId === toCharacterId && r.toCharacterId === fromCharacterId)
      )
      if (index !== -1) {
        this.characterToCharacter.splice(index, 1)
      }
    },

    // 刪除與特定角色相關的所有關係
    deleteAllRelationshipsForCharacter(characterId: string) {
      // 刪除使用者與該角色的關係
      const userRelIndex = this.userToCharacter.findIndex(r => r.characterId === characterId)
      if (userRelIndex !== -1) {
        this.userToCharacter.splice(userRelIndex, 1)
      }

      // 刪除該角色與其他角色的所有關係
      this.characterToCharacter = this.characterToCharacter.filter(
        r => r.fromCharacterId !== characterId && r.toCharacterId !== characterId
      )
    },

    // 更新角色關係的 LLM 狀態（如果關係不存在會自動建立）
    updateRelationshipState(
      fromId: string,
      toId: string,
      type: CharacterRelationType,
      state?: string
    ) {
      const existing = this.characterToCharacter.find(
        r => r.fromCharacterId === fromId && r.toCharacterId === toId
      )

      if (existing) {
        const oldType = existing.relationshipType
        // 更新現有關係
        existing.relationshipType = type
        if (state !== undefined) {
          existing.state = state
        }
        existing.updatedAt = Date.now()

        // 如果關係類型改變了，觸發雙方的狀態訊息更新
        if (oldType !== type) {
          console.log(`✨ 角色間關係類型變化: ${oldType} → ${type} (${fromId} → ${toId})`)
          // 觸發 fromId 角色的狀態訊息更新
          this.triggerStatusUpdateOnRelationshipChange(fromId).catch((err: unknown) => {
            console.warn('角色間關係變化時自動生成狀態訊息失敗:', err)
          })
          // 也觸發 toId 角色的狀態訊息更新（被影響的一方）
          this.triggerStatusUpdateOnRelationshipChange(toId).catch((err: unknown) => {
            console.warn('角色間關係變化時自動生成狀態訊息失敗:', err)
          })
        }
      } else {
        // 建立新關係
        this.characterToCharacter.push({
          fromCharacterId: fromId,
          toCharacterId: toId,
          relationshipType: type,
          description: '',
          state,
          updatedAt: Date.now()
        })

        // 新建立的關係也觸發狀態訊息更新（如果不是 neutral）
        if (type !== 'neutral') {
          console.log(`✨ 角色間新關係建立: ${type} (${fromId} → ${toId})`)
          this.triggerStatusUpdateOnRelationshipChange(fromId).catch((err: unknown) => {
            console.warn('新關係建立時自動生成狀態訊息失敗:', err)
          })
          this.triggerStatusUpdateOnRelationshipChange(toId).catch((err: unknown) => {
            console.warn('新關係建立時自動生成狀態訊息失敗:', err)
          })
        }
      }
    },

    // 刪除角色關係的 LLM 狀態（只刪除 state，保留關係本身）
    deleteRelationshipState(fromId: string, toId: string) {
      const existing = this.characterToCharacter.find(
        r => r.fromCharacterId === fromId && r.toCharacterId === toId
      )
      if (existing) {
        delete existing.state
        existing.updatedAt = Date.now()
      }
    },

    // 清空所有關係資料
    clearAllRelationships() {
      this.userToCharacter = []
      this.characterToCharacter = []
    }
  },

  persist: true
})
