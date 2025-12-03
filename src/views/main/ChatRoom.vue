<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharacterStore } from '@/stores/characters'
import { useChatRoomsStore } from '@/stores/chatRooms'
import { useUserStore } from '@/stores/user'
import { useRelationshipsStore } from '@/stores/relationships'
import { useMemoriesStore } from '@/stores/memories'
import {
  formatMessageTime,
  formatMessageForAI,
  formatMessageForDisplay,
  determineRespondingCharacters,
  parseMentionedCharacterIds,
  isCharacterOnline,
  getCharacterStatus
} from '@/utils/chatHelpers'
import { getCharacterResponse } from '@/services/gemini'
import { generateMemorySummary, extractLongTermMemories } from '@/services/memoryService'
import { ArrowLeft, Send, Copy, Trash2, X, MessageCircle } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const characterStore = useCharacterStore()
const chatRoomStore = useChatRoomsStore()
const userStore = useUserStore()
const relationshipsStore = useRelationshipsStore()
const memoriesStore = useMemoriesStore()

const roomId = computed(() => route.params.id as string)
const room = computed(() => chatRoomStore.getRoomById(roomId.value))
const messages = computed(() => chatRoomStore.getMessages(roomId.value))

// 角色資訊（單人聊天室）
const character = computed(() => {
  if (!room.value || room.value.type !== 'single') return null
  if (room.value.characterIds.length === 0) return null
  const charId = room.value.characterIds[0]
  if (!charId) return null
  return characterStore.getCharacterById(charId) || null
})

// 群組中的所有角色
const groupCharacters = computed(() => {
  if (!room.value || room.value.type !== 'group') return []
  return room.value.characterIds
    .map(id => characterStore.getCharacterById(id))
    .filter((c): c is NonNullable<typeof c> => c !== null)
})

// 使用者資訊
const userName = computed(() => userStore.userName)
const userAvatar = computed(() => userStore.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName.value)}&background=667eea&color=fff`)

// 單人聊天角色狀態
const characterStatus = computed(() => {
  if (!character.value) return null
  return getCharacterStatus(character.value)
})

const characterStatusText = computed(() => {
  const status = characterStatus.value
  if (!status) return '線上'
  if (status === 'online') return '在線'
  if (status === 'away') return '忙碌中'
  return '離線'
})

// 取得訊息發送者的頭像
const getSenderAvatar = (senderId: string, senderName: string) => {
  if (senderId === 'user') {
    return userAvatar.value
  }

  // 角色頭像
  const char = characterStore.getCharacterById(senderId)
  return char?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=764ba2&color=fff`
}

// 格式化訊息內容（將 @ID 轉換為 @名字）
const formatMessageContent = (content: string) => {
  if (!room.value) return content

  // 取得聊天室中的所有角色
  const allCharacters = room.value.characterIds
    .map(id => characterStore.getCharacterById(id))
    .filter((c): c is NonNullable<typeof c> => c !== null)

  return formatMessageForDisplay(content, allCharacters, userName.value)
}

// 輸入框
const messageInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const isLoading = ref(false)

// 訊息選單與多選刪除
const showMessageMenu = ref(false)
const selectedMessageForMenu = ref<string | null>(null)
const menuPosition = ref({ x: 0, y: 0 })
const isMultiSelectMode = ref(false)
const selectedMessagesForDelete = ref<Set<string>>(new Set())

// 群組成員 Modal
const showMembersModal = ref(false)

// 滾動到底部
const scrollToBottom = async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 記憶處理：每 15 則訊息生成短期記憶
const handleMemoryGeneration = async () => {
  if (!character.value) return

  const currentMessages = messages.value

  // 每 15 則訊息觸發一次記憶生成
  if (currentMessages.length % 15 !== 0) return

  try {
    const apiKey = userStore.apiKey
    if (!apiKey) return

    // 取得最近 15 則訊息
    const recentMessages = currentMessages.slice(-15)

    // 生成短期記憶摘要
    const summary = await generateMemorySummary(apiKey, recentMessages)

    // 嘗試新增短期記憶
    const result = memoriesStore.addRoomMemory(roomId.value, summary, 'auto')

    // 如果返回 null，表示需要處理記憶（6 筆全未處理）
    if (result === null) {
      console.log('短期記憶已滿，開始提取長期記憶...')
      await processShortTermMemories()

      // 處理完後，再次嘗試新增
      memoriesStore.addRoomMemory(roomId.value, summary, 'auto')
    }
  } catch (error) {
    console.error('記憶生成失敗:', error)
    // 靜默失敗，不影響正常對話
  }
}

// 處理短期記憶，提取長期記憶
const processShortTermMemories = async () => {
  if (!character.value) return

  try {
    const apiKey = userStore.apiKey
    if (!apiKey) return

    // 取得所有短期記憶
    const shortTermMemories = memoriesStore.getRoomMemories(roomId.value)

    if (shortTermMemories.length === 0) return

    // 呼叫 AI 提取長期記憶
    const longTermMemoryContents = await extractLongTermMemories(apiKey, shortTermMemories)

    // 將提取的長期記憶存入角色記憶
    for (const content of longTermMemoryContents) {
      memoriesStore.addCharacterMemory(
        character.value.id,
        content,
        'auto',
        roomId.value
      )
    }

    // 標記所有短期記憶為已處理
    memoriesStore.markRoomMemoriesAsProcessed(roomId.value)

    console.log(`成功提取 ${longTermMemoryContents.length} 條長期記憶`)
  } catch (error) {
    console.error('處理短期記憶失敗:', error)
    // 靜默失敗，不影響正常對話
  }
}

// 發送訊息
const handleSendMessage = async () => {
  if (!messageInput.value.trim() || isLoading.value || !room.value) return

  const userMessage = messageInput.value.trim()
  messageInput.value = ''

  // 判斷是單人還是群組聊天
  if (room.value.type === 'single') {
    await handleSingleChatMessage(userMessage)
  } else {
    await handleGroupChatMessage(userMessage)
  }
}

// 處理單人聊天訊息
const handleSingleChatMessage = async (userMessage: string) => {
  if (!character.value) return

  // 新增使用者訊息
  chatRoomStore.addMessage(roomId.value, {
    roomId: roomId.value,
    senderId: 'user',
    senderName: userName.value,
    content: userMessage
  })

  scrollToBottom()

  // 等待角色回應
  isLoading.value = true

  try {
    const apiKey = userStore.apiKey
    if (!apiKey) {
      alert('尚未設定 API Key，請到設定頁面設定')
      return
    }

    // 取得使用者與角色的關係
    const userRelationship = relationshipsStore.getUserCharacterRelationship(character.value.id)

    // 取得角色的長期記憶
    const longTermMemories = memoriesStore.getCharacterMemories(character.value.id)

    // 取得聊天室的短期記憶
    const shortTermMemories = memoriesStore.getRoomMemories(roomId.value)

    // 取得聊天室摘要
    const roomSummary = memoriesStore.getRoomSummary(roomId.value)

    const aiResponse = await getCharacterResponse({
      apiKey,
      character: character.value,
      user: userStore.profile || {
        id: 'user',
        nickname: userName.value,
        avatar: userAvatar.value,
        apiConfig: {
          geminiApiKey: apiKey
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      room: room.value,
      messages: messages.value.slice(0, -1),
      userMessage,
      context: {
        userRelationship,
        longTermMemories,
        shortTermMemories,
        roomSummary
      }
    })

    // 更新好感度
    if (aiResponse.newAffection !== undefined) {
      relationshipsStore.updateAffection(character.value.id, aiResponse.newAffection)
    }

    // 新增角色訊息
    chatRoomStore.addMessage(roomId.value, {
      roomId: roomId.value,
      senderId: character.value.id,
      senderName: character.value.name,
      content: aiResponse.text
    })

    scrollToBottom()

    // 記憶處理
    await handleMemoryGeneration()
  } catch (error) {
    console.error('Failed to get character response:', error)
    alert('取得回應時發生錯誤')
  } finally {
    isLoading.value = false
  }
}

// 處理群組聊天訊息
const handleGroupChatMessage = async (userMessage: string) => {
  if (!room.value) return

  // 取得聊天室中的所有角色
  const allCharacters = room.value.characterIds
    .map(id => characterStore.getCharacterById(id))
    .filter((c): c is NonNullable<typeof c> => c !== null)

  if (allCharacters.length === 0) return

  // 轉換使用者訊息：@名字 → @ID
  const messageForAI = formatMessageForAI(userMessage, allCharacters, userName.value)

  // 新增使用者訊息（儲存原始訊息）
  chatRoomStore.addMessage(roomId.value, {
    roomId: roomId.value,
    senderId: 'user',
    senderName: userName.value,
    content: userMessage
  })

  scrollToBottom()

  // 等待角色回應
  isLoading.value = true

  try {
    const apiKey = userStore.apiKey
    if (!apiKey) {
      alert('尚未設定 API Key，請到設定頁面設定')
      return
    }

    // 多輪對話邏輯
    const MAX_ROUNDS = 10 // 最多 10 輪
    let currentRound = 0
    const conversationHistory: Array<{ senderId: string; content: string }> = [
      { senderId: 'user', content: messageForAI }
    ]

    // 記錄最近兩輪的對話模式，用於偵測無限循環
    let lastTwoRoundsPattern: string[] = []

    while (currentRound < MAX_ROUNDS) {
      currentRound++

      // 決定這一輪要回應的角色
      let respondingCharacterIds: string[]

      if (currentRound === 1) {
        // 第一輪：在線角色 + 被 @ 的角色
        respondingCharacterIds = determineRespondingCharacters(messageForAI, allCharacters)
      } else {
        // 後續輪：只有被上一輪訊息 @ 的角色
        const lastRoundMessages = conversationHistory.slice(-(conversationHistory.length - (currentRound - 2)))
        const mentionedIds = new Set<string>()

        lastRoundMessages.forEach(msg => {
          const mentioned = parseMentionedCharacterIds(msg.content, allCharacters.map(c => c.id))
          mentioned.forEach(id => mentionedIds.add(id))
        })

        // 排除使用者
        respondingCharacterIds = Array.from(mentionedIds).filter(id => id !== 'user')
      }

      // 沒有角色要回應，結束對話
      if (respondingCharacterIds.length === 0) {
        console.log(`第 ${currentRound} 輪：沒有角色需要回應，結束對話`)
        break
      }

      // 偵測無限循環：檢查是否連續兩輪都是同樣的角色在互相 @
      const currentPattern = respondingCharacterIds.sort().join(',')
      lastTwoRoundsPattern.push(currentPattern)

      if (lastTwoRoundsPattern.length > 2) {
        lastTwoRoundsPattern.shift() // 只保留最近兩輪
      }

      // 如果連續兩輪都是同樣的角色組合，視為無限循環，強制結束
      if (lastTwoRoundsPattern.length === 2 && lastTwoRoundsPattern[0] === lastTwoRoundsPattern[1]) {
        console.log(`偵測到無限循環（${currentPattern}），強制結束對話`)
        break
      }

      console.log(`第 ${currentRound} 輪：${respondingCharacterIds.length} 位角色回應`)

      // 依序讓角色回應
      for (const charId of respondingCharacterIds) {
        const currentCharacter = characterStore.getCharacterById(charId)
        if (!currentCharacter) continue

        // 判斷角色是否為離線但被 @all 吵醒
        const isOffline = !isCharacterOnline(currentCharacter)
        const hasAtAll = /@all/i.test(messageForAI)
        const isOfflineButMentioned = isOffline && hasAtAll

        // 取得使用者與角色的關係
        const userRelationship = relationshipsStore.getUserCharacterRelationship(currentCharacter.id)

        // 取得角色間的關係
        const characterRelationships = relationshipsStore.getCharacterRelationships(currentCharacter.id)

        // 取得群聊中的其他角色
        const otherCharactersInRoom = allCharacters.filter(c => c.id !== currentCharacter.id)

        // 取得角色的長期記憶
        const longTermMemories = memoriesStore.getCharacterMemories(currentCharacter.id)

        // 取得聊天室的短期記憶
        const shortTermMemories = memoriesStore.getRoomMemories(roomId.value)

        // 取得聊天室摘要
        const roomSummary = memoriesStore.getRoomSummary(roomId.value)

        // 呼叫 AI
        const aiResponse = await getCharacterResponse({
          apiKey,
          character: currentCharacter,
          user: userStore.profile || {
            id: 'user',
            nickname: userName.value,
            avatar: userAvatar.value,
            apiConfig: {
              geminiApiKey: apiKey
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          room: room.value,
          messages: messages.value.slice(0, -1),
          userMessage: messageForAI,
          context: {
            userRelationship,
            characterRelationships,
            otherCharactersInRoom,
            longTermMemories,
            shortTermMemories,
            roomSummary,
            isOfflineButMentioned
          }
        })

        // 更新好感度
        if (aiResponse.newAffection !== undefined) {
          relationshipsStore.updateAffection(currentCharacter.id, aiResponse.newAffection)
        }

        // 轉換 AI 回應：@名字 → @ID（為了偵測提及）
        const aiResponseForAI = formatMessageForAI(aiResponse.text, allCharacters, userName.value)

        // 記錄到對話歷史（用於下一輪判斷）
        conversationHistory.push({
          senderId: currentCharacter.id,
          content: aiResponseForAI
        })

        // 新增角色訊息（儲存原始訊息）
        chatRoomStore.addMessage(roomId.value, {
          roomId: roomId.value,
          senderId: currentCharacter.id,
          senderName: currentCharacter.name,
          content: aiResponse.text
        })

        scrollToBottom()
      }
    }

    // 記憶處理
    await handleMemoryGeneration()
  } catch (error) {
    console.error('Failed to get character response:', error)
    alert('取得回應時發生錯誤')
  } finally {
    isLoading.value = false
  }
}

// 偵測是否為觸控裝置（手機/平板）
const isTouchDevice = () => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

// 處理 Enter 送出
const handleKeydown = (event: KeyboardEvent) => {
  // 在手機上，Enter 就是換行，不送出訊息（需要點按鈕）
  // 在桌面上，Enter 送出，Shift+Enter 換行
  if (!isTouchDevice() && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSendMessage()
  }
}

// 訊息長按/點擊事件
const handleMessageLongPress = (messageId: string, event: MouseEvent | TouchEvent) => {
  if (isMultiSelectMode.value) return

  selectedMessageForMenu.value = messageId

  // 取得點擊位置
  if ('touches' in event && event.touches && event.touches[0]) {
    menuPosition.value = { x: event.touches[0].clientX, y: event.touches[0].clientY }
  } else if ('clientX' in event) {
    menuPosition.value = { x: event.clientX, y: event.clientY }
  }

  showMessageMenu.value = true
}

// 關閉選單
const closeMessageMenu = () => {
  showMessageMenu.value = false
  selectedMessageForMenu.value = null
}

// 複製訊息
const handleCopyMessage = () => {
  if (!selectedMessageForMenu.value) return

  const message = messages.value.find(m => m.id === selectedMessageForMenu.value)
  if (message) {
    navigator.clipboard.writeText(message.content)
  }

  closeMessageMenu()
}

// 進入多選刪除模式
const handleEnterDeleteMode = () => {
  isMultiSelectMode.value = true
  selectedMessagesForDelete.value.clear()

  // 如果有選中的訊息，自動加入多選
  if (selectedMessageForMenu.value) {
    selectedMessagesForDelete.value.add(selectedMessageForMenu.value)
  }

  closeMessageMenu()
}

// 切換訊息選中狀態（多選模式）
const toggleMessageSelection = (messageId: string) => {
  if (!isMultiSelectMode.value) return

  if (selectedMessagesForDelete.value.has(messageId)) {
    selectedMessagesForDelete.value.delete(messageId)
  } else {
    selectedMessagesForDelete.value.add(messageId)
  }
}

// 取消多選模式
const handleCancelMultiSelect = () => {
  isMultiSelectMode.value = false
  selectedMessagesForDelete.value.clear()
}

// 批次刪除訊息
const handleBatchDelete = () => {
  if (selectedMessagesForDelete.value.size === 0) return

  const messageIds = Array.from(selectedMessagesForDelete.value)
  chatRoomStore.deleteMessages(roomId.value, messageIds)

  isMultiSelectMode.value = false
  selectedMessagesForDelete.value.clear()
}

// 返回列表
const handleBack = () => {
  router.push('/main/chats')
}

onMounted(() => {
  if (!room.value) {
    alert('找不到聊天室')
    router.push('/main/chats')
    return
  }

  chatRoomStore.setCurrentRoom(roomId.value)
  scrollToBottom()
})
</script>

<template>
  <div v-if="room && (character || groupCharacters.length > 0)" class="chat-room page">
    <!-- Header -->
    <div class="chat-header">
      <button v-if="!isMultiSelectMode" class="back-btn" @click="handleBack">
        <ArrowLeft :size="24" />
      </button>
      <button v-else class="back-btn" @click="handleCancelMultiSelect">
        <X :size="24" />
      </button>

      <!-- 單人聊天 Header -->
      <div v-if="!isMultiSelectMode && room.type === 'single' && character" class="chat-header-info">
        <div class="avatar-wrapper">
          <div class="avatar">
            <img :src="character.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(character.name)}&background=764ba2&color=fff`" :alt="character.name">
          </div>
          <div v-if="characterStatus" :class="['status-indicator', characterStatus]" />
        </div>
        <div class="info">
          <h2 class="name">{{ character.name }}</h2>
          <p class="status">{{ characterStatusText }}</p>
        </div>
      </div>

      <!-- 群組聊天 Header -->
      <div v-if="!isMultiSelectMode && room.type === 'group'" class="chat-header-info group-header">
        <div class="group-avatars">
          <div
            v-for="(char, index) in groupCharacters.slice(0, 3)"
            :key="char.id"
            class="avatar-small"
            :style="{ zIndex: 3 - index }"
          >
            <img :src="char.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=764ba2&color=fff`" :alt="char.name">
          </div>
          <span v-if="groupCharacters.length > 3" class="more-count">+{{ groupCharacters.length - 3 }}</span>
        </div>
        <div class="info">
          <h2 class="name">{{ room.name }}</h2>
          <p class="status">{{ groupCharacters.length }} 位成員</p>
        </div>
        <button class="btn-secondary btn-sm members-btn" @click="showMembersModal = true">
          成員
        </button>
      </div>

      <div v-else-if="isMultiSelectMode" class="multi-select-header">
        <h2 class="name">已選取 {{ selectedMessagesForDelete.size }} 則訊息</h2>
      </div>

      <div class="spacer"></div>

      <button v-if="isMultiSelectMode" class="delete-btn btn btn-danger" :disabled="selectedMessagesForDelete.size === 0" @click="handleBatchDelete">
        刪除
      </button>
    </div>

    <!-- Messages -->
    <div ref="messagesContainer" class="messages-container">
      <div v-if="messages.length === 0" class="empty-messages">
        <div class="empty-icon">
          <MessageCircle :size="64" :stroke-width="1.5" />
        </div>
        <p v-if="room.type === 'single' && character">開始和 {{ character.name }} 聊天吧！</p>
        <p v-else-if="room.type === 'group'">開始群組聊天吧！</p>
      </div>

      <div
        v-for="message in messages"
        :key="message.id"
        :class="[
          'message',
          message.senderId === 'user' ? 'user-message' : 'character-message',
          { 'multi-select-mode': isMultiSelectMode, 'selected': selectedMessagesForDelete.has(message.id) }
        ]"
        @click="isMultiSelectMode ? toggleMessageSelection(message.id) : null"
        @contextmenu.prevent="handleMessageLongPress(message.id, $event)"
      >
        <!-- 多選模式的 checkbox -->
        <div v-if="isMultiSelectMode" class="message-checkbox">
          <input
            type="checkbox"
            :checked="selectedMessagesForDelete.has(message.id)"
            @change="toggleMessageSelection(message.id)"
          >
        </div>

        <div class="message-avatar">
          <img :src="getSenderAvatar(message.senderId, message.senderName)" :alt="message.senderName">
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="sender-name">{{ message.senderName }}</span>
            <span class="message-time">{{ formatMessageTime(message.timestamp) }}</span>
          </div>
          <div class="message-text">{{ formatMessageContent(message.content) }}</div>
        </div>
      </div>

      <!-- Loading indicator -->
      <div v-if="isLoading" class="message character-message loading-message">
        <div class="message-avatar">
          <div class="typing-placeholder-avatar"></div>
        </div>
        <div class="message-content">
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Message Menu -->
    <div v-if="showMessageMenu" class="message-menu-overlay" @click="closeMessageMenu">
      <div
        class="message-menu"
        :style="{ top: menuPosition.y + 'px', left: menuPosition.x + 'px' }"
        @click.stop
      >
        <button class="menu-item" @click="handleCopyMessage">
          <Copy :size="18" />
          <span>複製</span>
        </button>
        <button class="menu-item delete" @click="handleEnterDeleteMode">
          <Trash2 :size="18" />
          <span>刪除</span>
        </button>
      </div>
    </div>

    <!-- Input -->
    <div class="input-container">
      <textarea
        v-model="messageInput"
        class="message-input"
        :placeholder="isTouchDevice() ? '輸入訊息...' : '輸入訊息... (Enter 送出，Shift+Enter 換行)'"
        rows="1"
        :disabled="isLoading"
        @keydown="handleKeydown"
      ></textarea>
      <button
        class="send-btn"
        :disabled="!messageInput.trim() || isLoading"
        @click="handleSendMessage"
      >
        <Send :size="20" />
      </button>
    </div>

    <!-- 群組成員 Modal -->
    <div v-if="showMembersModal" class="modal-overlay" @click="showMembersModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>群組成員</h3>
          <button class="modal-close" @click="showMembersModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="members-list">
            <div v-for="char in groupCharacters" :key="char.id" class="member-item">
              <div class="member-avatar-wrapper">
                <div class="member-avatar">
                  <img :src="char.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=764ba2&color=fff`" :alt="char.name">
                </div>
                <div :class="['status-indicator', getCharacterStatus(char)]" />
              </div>
              <div class="member-info">
                <h4 class="member-name">{{ char.name }}</h4>
                <p class="member-status">
                  {{ getCharacterStatus(char) === 'online' ? '在線' : getCharacterStatus(char) === 'away' ? '忙碌中' : '離線' }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-room {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
}

/* Header */
.chat-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg) var(--spacing-xl);
  background: var(--color-bg-primary);
  border-bottom: 2px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  z-index: 10;
}

.back-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--text-xl);
  color: var(--color-text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: var(--radius);
  transition: all var(--transition);
}

.back-btn:hover {
  background: var(--color-bg-hover);
}

.chat-header-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.chat-header-info .avatar-wrapper {
  position: relative;
}

.chat-header-info .avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-bg-secondary);
}

.chat-header-info .avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 狀態指示器 */
.status-indicator {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  border-radius: var(--radius-full);
  border: 2px solid var(--color-bg-primary);
}

.status-indicator.online {
  background: #52c41a;
}

.status-indicator.away {
  background: #faad14;
}

.status-indicator.offline {
  background: #999;
}

.chat-header-info .info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.chat-header-info .name {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.chat-header-info .status {
  font-size: var(--text-sm);
  color: var(--color-success);
  margin: 0;
}

/* 群組頭像 */
.group-avatars {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.avatar-small {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-bg-primary);
  margin-left: -8px;
}

.avatar-small:first-child {
  margin-left: 0;
}

.avatar-small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.more-count {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-weight: 600;
  margin-left: var(--spacing-xs);
}

/* Loading 佔位頭像 */
.typing-placeholder-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.spacer {
  flex: 1;
}

/* Messages */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.empty-messages {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
}

.empty-icon {
  margin-bottom: var(--spacing-lg);
  opacity: 0.3;
  color: var(--color-text-tertiary);
}

.message {
  display: flex;
  gap: var(--spacing-md);
  max-width: 70%;
  animation: messageSlideIn 0.3s ease-out;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.user-message {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.character-message {
  align-self: flex-start;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.message-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.sender-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.message-time {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.message-text {
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  line-height: 1.5;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.user-message .message-text {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-text-white);
}

.character-message .message-text {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}

/* Typing indicator */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
  animation: typingAnimation 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typingAnimation {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-10px);
  }
}

/* Input */
.input-container {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-lg) var(--spacing-xl);
  background: var(--color-bg-primary);
  border-top: 2px solid var(--color-border);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}

.message-input {
  flex: 1;
  padding: var(--spacing-md) var(--spacing-lg);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  font-family: inherit;
  resize: none;
  min-height: 48px;
  max-height: 120px;
  transition: all var(--transition-fast);
}

.message-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.message-input:disabled {
  background: var(--color-bg-secondary);
  cursor: not-allowed;
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md) var(--spacing-xl);
  background: var(--color-primary);
  color: var(--color-text-white);
  border: none;
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
  min-width: 56px;
}

.send-btn:hover:not(:disabled) {
  background: var(--color-primary-dark);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Multi-select mode */
.multi-select-header {
  display: flex;
  align-items: center;
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-checkbox {
  display: flex;
  align-items: center;
  margin-right: var(--spacing-md);
}

.message-checkbox input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.message.multi-select-mode {
  cursor: pointer;
}

.message.multi-select-mode.selected {
  background: rgba(102, 126, 234, 0.1);
  border-radius: var(--radius-lg);
}

/* Message Menu */
.message-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: transparent;
}

.message-menu {
  position: fixed;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-xs);
  min-width: 150px;
  z-index: 1001;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  padding: var(--spacing-md) var(--spacing-lg);
  text-align: left;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  font-size: var(--text-base);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.menu-item:hover {
  background: var(--color-bg-hover);
}

.menu-item.delete {
  color: var(--color-danger);
}

.menu-item.delete:hover {
  background: rgba(244, 67, 54, 0.1);
}

/* 成員按鈕 */
.members-btn {
  margin-left: auto;
}

/* 成員 Modal */
.members-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  max-height: 60vh;
  overflow-y: auto;
}

.member-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
  transition: all var(--transition);
}

.member-item:hover {
  background: var(--color-bg-hover);
}

.member-avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.member-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-bg-primary);
}

.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.member-status {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: 0;
}

@media (max-width: 768px) {
  .chat-header {
    padding: var(--spacing-md) var(--spacing-lg);
  }

  .messages-container {
    padding: var(--spacing-md);
  }

  .message {
    max-width: 85%;
  }

  .input-container {
    padding: var(--spacing-md) var(--spacing-lg);
  }
}
</style>
