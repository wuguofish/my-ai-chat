<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCharacterStore } from '@/stores/characters'
import { useChatRoomsStore } from '@/stores/chatRooms'
import { formatMessageTime, getCharacterStatus, formatMessageForDisplay } from '@/utils/chatHelpers'
import PageHeader from '@/components/common/PageHeader.vue'
import type { ChatRoom } from '@/types'

const router = useRouter()
const characterStore = useCharacterStore()
const chatRoomStore = useChatRoomsStore()

const characterCount = computed(() => characterStore.characters.length)
const chatRooms = computed(() => chatRoomStore.chatRooms)

const userStore = useUserStore()

// 使用者資訊
const userName = computed(() => userStore.userName)
// 新增聊天室 Modal
const showNewChatModal = ref(false)
const chatType = ref<'single' | 'group'>('single') // 聊天類型
const selectedCharacterId = ref('')
const selectedGroupCharacterIds = ref<string[]>([]) // 群組成員
const groupChatName = ref('')

const availableCharacters = computed(() => {
  // 取得所有還沒有單人聊天室的角色
  const existingRoomCharacterIds = chatRooms.value
    .filter(room => room.type === 'single')
    .flatMap(room => room.characterIds)

  return characterStore.characters.filter(
    char => !existingRoomCharacterIds.includes(char.id)
  )
})

const allCharacters = computed(() => characterStore.characters)


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

const handleCreateGroupChat = () => {
  if (selectedGroupCharacterIds.value.length === 0) {
    alert('請至少選擇一位成員')
    return
  }

  const characterNames = selectedGroupCharacterIds.value
    .map(id => characterStore.getCharacterById(id)?.name)
    .filter((name): name is string => name !== undefined)

  // 如果沒有自訂名稱，自動生成
  const finalGroupName = groupChatName.value.trim() || characterNames.join('、')

  // 建立群組聊天室
  const roomId = chatRoomStore.createGroupChatRoom(selectedGroupCharacterIds.value, finalGroupName)

  showNewChatModal.value = false
  selectedGroupCharacterIds.value = []
  groupChatName.value = ''

  // 導航到聊天室
  router.push(`/main/chats/${roomId}`)
}

const toggleGroupMember = (charId: string) => {
  const index = selectedGroupCharacterIds.value.indexOf(charId)
  if (index > -1) {
    selectedGroupCharacterIds.value.splice(index, 1)
  } else {
    selectedGroupCharacterIds.value.push(charId)
  }
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

  let contentPreview = formatMessageForDisplay(lastMessage.content, allCharacters.value, userName.value);

  return `${lastMessage.senderName}: ${contentPreview}`
}

const getLastMessageTime = (room: ChatRoom) => {
  return formatMessageTime(room.lastMessageAt)
}

// 取得單人聊天室角色的狀態
const getCharacterStatusForRoom = (room: ChatRoom) => {
  if (room.type !== 'single' || room.characterIds.length === 0) return null

  const charId = room.characterIds[0]
  if (!charId) return null

  const character = characterStore.getCharacterById(charId)
  if (!character) return null

  return getCharacterStatus(character)
}
</script>

<template>
  <div class="page">
    <PageHeader title="聊天">
      <template #actions>
        <button class="btn btn-primary-outline btn-sm" @click="showNewChatModal = true">
          + 新增聊天
        </button>
      </template>
    </PageHeader>

    <!-- 聊天室列表 -->
    <div v-if="chatRooms.length > 0" class="chat-rooms-container">
      <div v-for="room in chatRooms" :key="room.id" class="chat-room-item" @click="handleOpenChatRoom(room.id)">
        <div class="avatar-wrapper">
          <div class="avatar">
            <img :src="getChatRoomAvatar(room)" :alt="room.name">
          </div>
          <!-- 狀態指示器（僅單人聊天） -->
          <div v-if="getCharacterStatusForRoom(room)" :class="['status-indicator', getCharacterStatusForRoom(room)]" />
        </div>
        <div class="chat-info">
          <div class="chat-header">
            <h3 class="chat-name">{{ room.name }}</h3>
            <span class="chat-time">{{ getLastMessageTime(room) }}</span>
          </div>
          <p class="last-message" v-html="getLastMessagePreview(room.id)"></p>
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
          <!-- 選擇聊天類型 -->
          <div class="form-group">
            <label>聊天類型</label>
            <div class="chat-type-tabs">
              <button :class="['chat-type-tab', { active: chatType === 'single' }]" @click="chatType = 'single'">
                單人聊天
              </button>
              <button :class="['chat-type-tab', { active: chatType === 'group' }]" @click="chatType = 'group'">
                群組聊天
              </button>
            </div>
          </div>

          <!-- 單人聊天 -->
          <div v-if="chatType === 'single'">
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

          <!-- 群組聊天 -->
          <div v-else-if="chatType === 'group'">
            <div v-if="allCharacters.length > 0" class="form-group">
              <label>群組名稱（選填）</label>
              <input v-model="groupChatName" type="text" class="input-field" placeholder="例如：愛聊天群組">
              <p class="form-hint">留空將自動使用成員名稱</p>
            </div>

            <div v-if="allCharacters.length > 0" class="form-group">
              <label>選擇成員（{{ selectedGroupCharacterIds.length }} / {{ allCharacters.length }}）</label>
              <div class="character-grid">
                <div v-for="char in allCharacters" :key="char.id"
                  :class="['character-card', { selected: selectedGroupCharacterIds.includes(char.id) }]"
                  @click="toggleGroupMember(char.id)">
                  <div class="character-avatar">
                    <img
                      :src="char.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=764ba2&color=fff`"
                      :alt="char.name">
                  </div>
                  <div class="character-name">{{ char.name }}</div>
                  <div v-if="selectedGroupCharacterIds.includes(char.id)" class="selected-badge">✓</div>
                </div>
              </div>
              <p class="form-hint">至少選擇一位成員</p>
            </div>

            <div v-else class="empty-notice">
              <p>還沒有任何角色！</p>
              <p class="text-secondary">請先到「好友」頁面新增角色</p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showNewChatModal = false">取消</button>
          <button v-if="chatType === 'single' && availableCharacters.length > 0" class="btn btn-primary"
            :disabled="!selectedCharacterId" @click="handleCreateSingleChat">
            開始聊天
          </button>
          <button v-else-if="chatType === 'group' && allCharacters.length > 0" class="btn btn-primary"
            :disabled="selectedGroupCharacterIds.length === 0" @click="handleCreateGroupChat">
            建立群組
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

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

.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.chat-room-item .avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-bg-secondary);
}

.chat-room-item .avatar img {
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

/* 聊天類型選擇 */
.chat-type-tabs {
  display: flex;
  gap: var(--spacing-sm);
  background: var(--color-bg-secondary);
  padding: var(--spacing-xs);
  border-radius: var(--radius);
}

.chat-type-tab {
  flex: 1;
  padding: var(--spacing-md) var(--spacing-lg);
  background: transparent;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  transition: all var(--transition);
}

.chat-type-tab:hover {
  background: var(--color-bg-hover);
}

.chat-type-tab.active {
  background: var(--color-primary);
  color: white;
  font-weight: 600;
}

/* 群組成員選擇 */
.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--spacing-md);
  max-height: 300px;
  overflow-y: auto;
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
}

.character-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-md);
  background: var(--color-bg-primary);
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all var(--transition);
}

.character-card:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-primary);
  transform: scale(1.05);
}

.character-card.selected {
  background: var(--color-primary-light, #e8ebfd);
  border-color: var(--color-primary);
}

.character-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
  background: var(--color-bg-secondary);
}

.character-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-name {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  text-align: center;
  font-weight: 500;
}

.selected-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
}

:deep(.tag-text) {
  color: var(--color-info)!important;
}

@media (max-width: 768px) {
  .chat-room-item .avatar {
    width: 48px;
    height: 48px;
  }

  .chat-name {
    font-size: var(--text-base);
  }

  .character-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  }
}
</style>
