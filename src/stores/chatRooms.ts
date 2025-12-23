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
   * 1. 移除無效的 @ID
   * 2. 同一則訊息內，同樣的 @ID 只保留第一筆
   * 3. 第二次以上出現時，如果後面沒有名字則替換成名字
   * 4. 第一次出現時，如果後面有冗餘的名字則移除名字
   *
   * @param content 訊息內容
   * @param idToName ID 對應名字的 Map（包含 user, all, 和角色 ID）
   * @returns 處理後的訊息
   */
  /**
   * 檢查名字後面是否為「獨立結尾」（空白、標點、或字串結尾）
   * 用於判斷 @ID 後面的名字是否為冗餘（例如 "@all 大家好" 中的 "大家" 不是冗餘）
   */
  function isStandaloneName(afterMatch: string, name: string): boolean {
    if (!afterMatch.startsWith(name)) return false

    const charAfterName = afterMatch[name.length]
    // 名字後面是空白、標點符號、或字串結尾，才算獨立
    if (charAfterName === undefined) return true // 字串結尾
    // 空白或常見標點
    return /[\s，。！？、；：""''「」【】（）,.!?;:()\[\]@]/.test(charAfterName)
  }

  function cleanMentions(content: string, idToName: Map<string, string>): string {
    const mentionedIds = new Set<string>()

    // 使用 while 迴圈逐一處理，避免 replace 的 offset 問題
    const atPattern = /@([a-zA-Z0-9-]+)(\s*)/g
    let lastIndex = 0
    let newResult = ''
    let match

    while ((match = atPattern.exec(content)) !== null) {
      const fullMatch = match[0]
      const id = match[1] || ''
      const normalizedId = id.toLowerCase()
      const name = idToName.get(id)
      const matchStart = match.index
      const matchEnd = matchStart + fullMatch.length

      // 加入 match 之前的文字
      newResult += content.slice(lastIndex, matchStart)

      // 無效的 ID，直接移除
      if (!name) {
        lastIndex = matchEnd
        continue
      }

      // @all 和 @user 是特殊標記，只做去重，不處理冗餘名字
      const isSpecialId = normalizedId === 'all' || normalizedId === 'user'

      if (mentionedIds.has(normalizedId)) {
        // 已經提到過這個 ID，移除重複的 @ID
        // 不加任何東西
      } else {
        // 第一次提到
        mentionedIds.add(normalizedId)

        if (!isSpecialId) {
          // 一般角色：檢查是否有冗餘名字
          const afterMatch = content.slice(matchEnd)
          const hasStandaloneName = isStandaloneName(afterMatch, name)

          if (hasStandaloneName) {
            // @ID 後面有冗餘的獨立名字，保留 @ID 但移除後面的名字
            newResult += fullMatch
            // 跳過後面的名字
            atPattern.lastIndex = matchEnd + name.length
            lastIndex = matchEnd + name.length
            continue
          }
        }

        // 保留原始的 @ID
        newResult += fullMatch
      }

      lastIndex = matchEnd
    }

    // 加入剩餘的文字
    newResult += content.slice(lastIndex)

    return newResult.replace(/ {2,}/g, ' ').trim()
  }

  /**
   * 建立聊天室的 ID → 名字對照表
   * @param roomId 聊天室 ID
   * @returns ID 對應名字的 Map
   */
  function buildIdToNameMap(roomId: string): Map<string, string> {
    const characterStore = useCharacterStore()
    const userStore = useUserStore()
    const room = chatRooms.value.find(r => r.id === roomId)

    const idToName = new Map<string, string>()
    idToName.set('user', userStore.profile?.nickname || '使用者')
    idToName.set('all', '大家')

    if (room) {
      room.characterIds.forEach(charId => {
        const char = characterStore.getCharacterById(charId)
        if (char) {
          idToName.set(char.id, char.name)
        }
      })
    }

    return idToName
  }

  /**
   * 清理訊息中的 @ 提及（對外 API）
   * @param content 訊息內容
   * @param roomId 聊天室 ID
   * @returns 處理後的訊息
   */
  function cleanMessageMentions(content: string, roomId: string): string {
    const idToName = buildIdToNameMap(roomId)
    return cleanMentions(content, idToName)
  }

  function addMessage(roomId: string, message: Omit<Message, 'id' | 'timestamp'>) {
    if (!messages.value[roomId]) {
      messages.value[roomId] = []
    }

    // 清理訊息內容中的 @ 提及（只處理角色的訊息，不處理使用者的訊息）
    const cleanedContent = message.senderId !== 'user'
      ? cleanMessageMentions(message.content, roomId)
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
