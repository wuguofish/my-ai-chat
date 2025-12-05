/**
 * 聊天室管理 Store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { ChatRoom, Message } from '@/types'

export const useChatRoomsStore = defineStore('chatRooms', () => {
  // State
  const chatRooms = ref<ChatRoom[]>([])
  const messages = ref<Record<string, Message[]>>({})
  const currentRoomId = ref<string | null>(null)

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
   * 清理訊息中重複的 @ 提及（同一則訊息內，同樣的 @ID 只保留第一筆）
   */
  function deduplicateMentions(content: string): string {
    const mentionedIds = new Set<string>()

    // 使用正則表達式找到所有 @ 提及（支援數字 ID 和 UUID 格式）
    // 匹配 @數字 或 @UUID（包含字母、數字、連字符）
    return content.replace(/@([a-f0-9-]+|\d+)/gi, (match, id) => {
      const normalizedId = id.toLowerCase() // UUID 不分大小寫
      if (mentionedIds.has(normalizedId)) {
        // 如果已經提到過這個 ID，移除整個 @ 提及
        return ''
      } else {
        // 第一次提到，保留並記錄
        mentionedIds.add(normalizedId)
        return match
      }
    }).replace(/ {2,}/g, ' ').trim() // 清理多餘空格（只清理連續空格，保留換行）
  }

  function addMessage(roomId: string, message: Omit<Message, 'id' | 'timestamp'>) {
    if (!messages.value[roomId]) {
      messages.value[roomId] = []
    }

    // 清理訊息內容中重複的 @ 提及（只處理角色的訊息，不處理使用者的訊息）
    const cleanedContent = message.senderId !== 'user'
      ? deduplicateMentions(message.content)
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

  function addMemberToRoom(roomId: string, characterId: string) {
    const room = chatRooms.value.find(r => r.id === roomId)
    if (room && !room.characterIds.includes(characterId)) {
      room.characterIds.push(characterId)
    }
  }

  function clearAllData() {
    chatRooms.value = []
    messages.value = {}
    currentRoomId.value = null
  }

  return {
    // State
    chatRooms,
    messages,
    currentRoomId,
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
    deleteMessage,
    deleteMessages,
    clearMessages,
    addMemberToRoom,
    clearAllData
  }
}, {
  persist: {
    key: 'ai-chat-rooms',
    storage: localStorage
  }
})
