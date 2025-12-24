/**
 * 聊天室管理 Store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { ChatRoom, Message } from '@/types'
import { useCharacterStore } from './characters'
import { useUserStore } from './user'

export const useChatRoomsStore = defineStore('chatRooms', () => {
  // State
  const chatRooms = ref<ChatRoom[]>([])
  const messages = ref<Record<string, Message[]>>({})
  const currentRoomId = ref<string | null>(null)
  const drafts = ref<Record<string, string>>({}) // 草稿訊息，key 為 roomId

  // Getters
  const currentRoom = computed(() => {
    if (!currentRoomId.value) return null
    return chatRooms.value.find(r => r.id === currentRoomId.value) || null
  })

  const currentMessages = computed(() => {
    if (!currentRoomId.value) return []
    return messages.value[currentRoomId.value] || []
  })

  const getRoomById = (id: string) => {
    return chatRooms.value.find(r => r.id === id)
  }

  const getMessagesByRoomId = (roomId: string) => {
    return messages.value[roomId] || []
  }

  // Actions
  function createChatRoom(
    name: string,
    characterIds: string[],
    type: 'single' | 'group' = 'single'
  ) {
    const now = new Date().toISOString()
    const newRoom: ChatRoom = {
      id: uuidv4(),
      name,
      type,
      characterIds,
      settings: {
        autoReplyAll: true,
        replyProbability: 0.8
      },
      createdAt: now,
      lastMessageAt: now
    }

    chatRooms.value.push(newRoom)
    messages.value[newRoom.id] = []
    return newRoom.id
  }

  function createSingleChatRoom(characterId: string, characterName: string) {
    return createChatRoom(characterName, [characterId], 'single')
  }

  function createGroupChatRoom(characterIds: string[], groupName: string) {
    return createChatRoom(groupName, characterIds, 'group')
  }

  function getMessages(roomId: string) {
    return messages.value[roomId] || []
  }

  function deleteChatRoom(roomId: string) {
    const index = chatRooms.value.findIndex(r => r.id === roomId)
    if (index !== -1) {
      chatRooms.value.splice(index, 1)
      delete messages.value[roomId]
      if (currentRoomId.value === roomId) {
        currentRoomId.value = null
      }
    }
  }

  function setCurrentRoom(roomId: string | null) {
    currentRoomId.value = roomId
  }

  /**
   * 清理訊息中的 @ 提及
   * - 第一次提到：`@ID 名字` 或 `@ID名字` → `@ID`（保留 @ID，移除冗餘名字）
   * - 第二次以後：`@ID 名字` 或 `@ID名字` 或 `@ID` → `名字`（替換成純名字）
   * - 無效的 @ID：直接移除
   * - @all：特殊處理，不移除冗餘名字
   */
  function cleanMentions(content: string, idToName: Map<string, string>): string {
    // 收集所有有效的 ID（小寫形式）
    const validIds = new Set<string>()
    for (const id of idToName.keys()) {
      validIds.add(id.toLowerCase())
    }

    let result = content

    for (const [id, name] of idToName) {
      const isSpecialId = id.toLowerCase() === 'all'
      const atId = `@${id}`

      // 找第一次出現 @ID 的位置
      const firstIdx = result.indexOf(atId)
      if (firstIdx === -1) continue // 這個 ID 沒出現過

      // 切出第一次 @ID 之後的部分
      let afterFirst = result.substring(firstIdx + atId.length)

      // 處理第一次出現：移除冗餘的名字（如果有的話）
      // @all 特殊處理：不移除第一次的冗餘名字
      if (!isSpecialId) {
        const trimmedAfter = afterFirst.trimStart()
        if (trimmedAfter.startsWith(name)) {
          // 開頭是名字，移除它
          afterFirst = trimmedAfter.substring(name.length)
        }
      }

      // 對剩下的部分做簡單取代（第二次以後的 @ID 都換成名字）
      // 注意：要先處理有名字的情況，再處理純 @ID
      if (!isSpecialId) {
        afterFirst = afterFirst.split(`${atId} ${name}`).join(name)
        afterFirst = afterFirst.split(`${atId}${name}`).join(name)
        afterFirst = afterFirst.split(atId).join(name)
      } else {
        // @all 特殊處理：第二次以後的 @all 大家 換成 大家
        afterFirst = afterFirst.split(`${atId} ${name}`).join(name)
        afterFirst = afterFirst.split(`${atId}${name}`).join(name)
        afterFirst = afterFirst.split(atId).join(name)
      }

      // 拼回去：前面的部分 + @ID + 空白 + 處理過的後半部分
      // 如果原本 @ID 後面沒有任何內容就不加空白
      const prefix = result.substring(0, firstIdx)
      if (afterFirst.length > 0 && !afterFirst.startsWith(' ')) {
        result = `${prefix}${atId} ${afterFirst}`
      } else {
        result = `${prefix}${atId}${afterFirst}`
      }
    }

    // 移除無效的 @ID（UUID 格式但不在 validIds 中的）
    result = result.replace(/@([a-f0-9-]{36})/gi, (match, uuid) => {
      return validIds.has(uuid.toLowerCase()) ? match : ''
    })

    // 清理多餘空白
    return result.replace(/ {2,}/g, ' ').trim()
  }

  /**
   * 建立聊天室的 ID → 名字對照表
   * 包含所有已存在的角色（不只是目前群組成員），以便歷史訊息中的 @提及能正確顯示
   * @returns ID 對應名字的 Map
   */
  function buildIdToNameMap(): Map<string, string> {
    const characterStore = useCharacterStore()
    const userStore = useUserStore()

    const idToName = new Map<string, string>()
    idToName.set('user', userStore.profile?.nickname || '使用者')
    idToName.set('all', '大家')

    // 加入所有已存在的角色，這樣即使成員被移出群組，歷史訊息的 @提及仍能正確顯示
    characterStore.characters.forEach(char => {
      idToName.set(char.id, char.name)
    })

    return idToName
  }

  /**
   * 清理訊息中的 @ 提及（對外 API）
   * @param content 訊息內容
   * @returns 處理後的訊息
   */
  function cleanMessageMentions(content: string): string {
    const idToName = buildIdToNameMap()
    return cleanMentions(content, idToName)
  }

  function addMessage(roomId: string, message: Omit<Message, 'id' | 'timestamp'>) {
    if (!messages.value[roomId]) {
      messages.value[roomId] = []
    }

    // 清理訊息內容中的 @ 提及（只處理角色的訊息，不處理使用者的訊息）
    const cleanedContent = message.senderId !== 'user'
      ? cleanMessageMentions(message.content)
      : message.content

    const newMessage: Message = {
      ...message,
      content: cleanedContent,
      id: uuidv4(),
      timestamp: new Date().toISOString()
    }

    messages.value[roomId].push(newMessage)

    // 更新聊天室的最後訊息時間
    const room = chatRooms.value.find(r => r.id === roomId)
    if (room) {
      room.lastMessageAt = newMessage.timestamp
    }

    return newMessage
  }

  function deleteMessage(roomId: string, messageId: string) {
    if (messages.value[roomId]) {
      const index = messages.value[roomId].findIndex(m => m.id === messageId)
      if (index !== -1) {
        messages.value[roomId].splice(index, 1)
      }
    }
  }

  function deleteMessages(roomId: string, messageIds: string[]) {
    if (messages.value[roomId]) {
      messages.value[roomId] = messages.value[roomId].filter(
        m => !messageIds.includes(m.id)
      )
    }
  }

  function clearMessages(roomId: string) {
    if (messages.value[roomId]) {
      messages.value[roomId] = []
    }
  }

  /**
   * 更新訊息內容
   */
  function updateMessage(roomId: string, messageId: string, newContent: string) {
    if (!messages.value[roomId]) return

    const message = messages.value[roomId].find(m => m.id === messageId)
    if (message) {
      message.content = newContent
    }
  }

  /**
   * 新增系統訊息
   */
  function addSystemMessage(roomId: string, content: string) {
    if (!messages.value[roomId]) {
      messages.value[roomId] = []
    }

    const systemMessage = {
      id: uuidv4(),
      roomId,
      senderId: 'system',
      senderName: '系統',
      content,
      timestamp: new Date().toISOString(),
      type: 'system' as const
    }

    messages.value[roomId].push(systemMessage)

    // 更新聊天室的最後訊息時間
    const room = chatRooms.value.find(r => r.id === roomId)
    if (room) {
      room.lastMessageAt = systemMessage.timestamp
    }
  }

  /**
   * 新增成員到群組（會產生系統訊息）
   */
  function addMemberToRoom(roomId: string, characterId: string, characterName: string) {
    const room = chatRooms.value.find(r => r.id === roomId)
    if (room && !room.characterIds.includes(characterId)) {
      room.characterIds.push(characterId)

      // 只在群組聊天室產生系統訊息
      if (room.type === 'group') {
        addSystemMessage(roomId, `${characterName} 加入了群組`)
      }
    }
  }

  /**
   * 從群組中移除單一成員（會產生系統訊息）
   * @returns 是否成功移除
   */
  function removeMemberFromRoom(roomId: string, characterId: string, characterName: string): boolean {
    const room = chatRooms.value.find(r => r.id === roomId)
    if (!room || room.type !== 'group') return false

    const index = room.characterIds.indexOf(characterId)
    if (index === -1) return false

    room.characterIds.splice(index, 1)
    addSystemMessage(roomId, `${characterName} 已離開群組`)
    return true
  }

  /**
   * 更新聊天室名稱（會產生系統訊息）
   */
  function updateRoomName(roomId: string, newName: string) {
    const room = chatRooms.value.find(r => r.id === roomId)
    if (room) {
      const oldName = room.name
      room.name = newName

      // 只在群組聊天室產生系統訊息
      if (room.type === 'group') {
        addSystemMessage(roomId, `群組名稱從「${oldName}」變更為「${newName}」`)
      }
    }
  }

  /**
   * 從所有群組聊天室中移除指定角色
   * 用於角色被刪除時，保留聊天室但移除該角色的參與
   * 單人聊天室不會被刪除，只會變成「已刪除好友」狀態
   */
  function removeCharacterFromRooms(characterId: string) {
    chatRooms.value.forEach(room => {
      // 只處理群組聊天室
      if (room.type === 'group') {
        const index = room.characterIds.indexOf(characterId)
        if (index !== -1) {
          room.characterIds.splice(index, 1)
        }
      }
      // 單人聊天室保留 characterIds，讓前端可以判斷角色已被刪除
    })
  }

  /**
   * 檢查聊天室是否有已刪除的角色（用於單人聊天室）
   */
  function isRoomCharacterDeleted(roomId: string, getCharacterById: (id: string) => any): boolean {
    const room = chatRooms.value.find(r => r.id === roomId)
    if (!room || room.type !== 'single') return false
    if (room.characterIds.length === 0) return true

    const charId = room.characterIds[0]
    return !charId || !getCharacterById(charId)
  }

  function clearAllData() {
    chatRooms.value = []
    messages.value = {}
    currentRoomId.value = null
    drafts.value = {}
  }

  // 草稿相關函數
  function getDraft(roomId: string): string {
    return drafts.value[roomId] || ''
  }

  function setDraft(roomId: string, content: string) {
    if (content.trim()) {
      drafts.value[roomId] = content
    } else {
      delete drafts.value[roomId]
    }
  }

  function clearDraft(roomId: string) {
    delete drafts.value[roomId]
  }

  return {
    // State
    chatRooms,
    messages,
    currentRoomId,
    drafts,
    // Getters
    currentRoom,
    currentMessages,
    getRoomById,
    getMessagesByRoomId,
    getMessages,
    // Actions
    createChatRoom,
    createSingleChatRoom,
    createGroupChatRoom,
    deleteChatRoom,
    setCurrentRoom,
    addMessage,
    updateMessage,
    addSystemMessage,
    deleteMessage,
    deleteMessages,
    clearMessages,
    addMemberToRoom,
    removeMemberFromRoom,
    updateRoomName,
    removeCharacterFromRooms,
    isRoomCharacterDeleted,
    clearAllData,
    // 草稿相關
    getDraft,
    setDraft,
    clearDraft,
    // @ 提及處理
    cleanMessageMentions,
    buildIdToNameMap
  }
}, {
  persist: {
    key: 'ai-chat-rooms',
    storage: localStorage
  }
})
