import { defineStore } from 'pinia'
import type {
  UserCharacterRelationship,
  CharacterRelationship,
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
    updateAffection(characterId: string, affection: number) {
      const relationship = this.userToCharacter.find(r => r.characterId === characterId)
      if (relationship) {
        relationship.affection = Math.max(0, affection) // 確保不低於 0
        relationship.level = this.calculateRelationshipLevel(relationship.affection)
        relationship.updatedAt = new Date().toISOString()
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

    // 清空所有關係資料
    clearAllRelationships() {
      this.userToCharacter = []
      this.characterToCharacter = []
    }
  },

  persist: true
})
