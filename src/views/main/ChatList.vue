<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCharacterStore } from '@/stores/characters'
import { useChatRoomsStore } from '@/stores/chatRooms'
import { formatMessageTime } from '@/utils/chatHelpers'
import type { ChatRoom } from '@/types'

const router = useRouter()
const characterStore = useCharacterStore()
const chatRoomStore = useChatRoomsStore()

const characterCount = computed(() => characterStore.characters.length)
const chatRooms = computed(() => chatRoomStore.chatRooms)

// 新增聊天室 Modal
const showNewChatModal = ref(false)
const selectedCharacterId = ref('')

const availableCharacters = computed(() => {
  // 取得所有還沒有單人聊天室的角色
  const existingRoomCharacterIds = chatRooms.value
    .filter(room => room.type === 'single')
    .flatMap(room => room.characterIds)

  return characterStore.characters.filter(
    char => !existingRoomCharacterIds.includes(char.id)
  )
})

const handleCreateSingleChat = () => {
  if (!selectedCharacterId.value) {
    alert('請選擇一位角色')
    return
  }

  const character = characterStore.getCharacterById(selectedCharacterId.value)
  if (!character) return

  // 建立新的單人聊天室
  const roomId = chatRoomStore.createSingleChatRoom(character.id, character.name)

  showNewChatModal.value = false
  selectedCharacterId.value = ''

  // 導航到聊天室
  router.push(`/main/chats/${roomId}`)
}

const handleOpenChatRoom = (roomId: string) => {
  router.push(`/main/chats/${roomId}`)
}

const getChatRoomAvatar = (room: ChatRoom) => {
  if (room.avatar) return room.avatar

  // 單人聊天室使用角色頭像
  if (room.type === 'single' && room.characterIds.length > 0) {
    const charId = room.characterIds[0]
    if (charId) {
      const character = characterStore.getCharacterById(charId)
      // 如果沒有頭像，使用預設頭像
      return character?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(room.name)}&background=667eea&color=fff`
    }
  }

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(room.name)}&background=667eea&color=fff`
}

const getLastMessagePreview = (roomId: string) => {
  const messages = chatRoomStore.getMessages(roomId)
  if (messages.length === 0) return '開始對話吧！'

  const lastMessage = messages[messages.length - 1]
  if (!lastMessage) return '開始對話吧！'

  return `${lastMessage.senderName}: ${lastMessage.content}`
}

const getLastMessageTime = (room: ChatRoom) => {
  return formatMessageTime(room.lastMessageAt)
}
</script>

<template>
  <div class="chat-list">
    <div class="page-header">
      <h2>聊天</h2>
      <button class="btn btn-primary btn-sm" @click="showNewChatModal = true">
        + 新增聊天
      </button>
    </div>

    <!-- 聊天室列表 -->
    <div v-if="chatRooms.length > 0" class="chat-rooms-container">
      <div
        v-for="room in chatRooms"
        :key="room.id"
        class="chat-room-item"
        @click="handleOpenChatRoom(room.id)"
      >
        <div class="avatar">
          <img :src="getChatRoomAvatar(room)" :alt="room.name">
        </div>
        <div class="chat-info">
          <div class="chat-header">
            <h3 class="chat-name">{{ room.name }}</h3>
            <span class="chat-time">{{ getLastMessageTime(room) }}</span>
          </div>
          <p class="last-message">{{ getLastMessagePreview(room.id) }}</p>
        </div>
      </div>
    </div>

    <!-- 空狀態 -->
    <div v-else class="empty-state">
      <div class="empty-state-icon">💭</div>
      <h3>還沒有聊天室</h3>
      <p>點擊上方的「新增聊天」開始對話吧！</p>
      <p class="text-secondary">目前你有 {{ characterCount }} 位好友</p>
    </div>

    <!-- 新增聊天 Modal -->
    <div v-if="showNewChatModal" class="modal-overlay" @click="showNewChatModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>新增聊天</h3>
          <button class="modal-close" @click="showNewChatModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="availableCharacters.length > 0" class="form-group">
            <label>選擇聊天對象</label>
            <select v-model="selectedCharacterId" class="input-field">
              <option value="">請選擇角色</option>
              <option v-for="char in availableCharacters" :key="char.id" :value="char.id">
                {{ char.name }}
              </option>
            </select>
            <p class="form-hint">選擇一位角色開始單人聊天</p>
          </div>
          <div v-else class="empty-notice">
            <p>所有角色都已經有聊天室了！</p>
            <p class="text-secondary">你可以到「好友」頁面新增更多角色</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showNewChatModal = false">取消</button>
          <button
            v-if="availableCharacters.length > 0"
            class="btn btn-primary"
            :disabled="!selectedCharacterId"
            @click="handleCreateSingleChat"
          >
            開始聊天
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-list {
  min-height: 100vh;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-rooms-container {
  padding: var(--spacing-md);
}

.chat-room-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  margin-bottom: var(--spacing-md);
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: var(--shadow-sm);
}

.chat-room-item:hover {
  background: var(--color-bg-hover);
  transform: translateX(4px);
  box-shadow: var(--shadow);
}

.chat-room-item .avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--color-bg-secondary);
}

.chat-room-item .avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-info {
  flex: 1;
  min-width: 0;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xs);
}

.chat-name {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-time {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  flex-shrink: 0;
  margin-left: var(--spacing-md);
}

.last-message {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-notice {
  text-align: center;
  padding: var(--spacing-xl);
}

.empty-notice p {
  margin: var(--spacing-sm) 0;
}

@media (max-width: 768px) {
  .chat-room-item .avatar {
    width: 48px;
    height: 48px;
  }

  .chat-name {
    font-size: var(--text-base);
  }
}
</style>
