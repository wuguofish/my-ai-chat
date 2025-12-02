<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCharacterStore } from '@/stores/characters'
import { useChatRoomsStore } from '@/stores/chatRooms'

const router = useRouter()
const userStore = useUserStore()
const characterStore = useCharacterStore()
const chatRoomStore = useChatRoomsStore()

const showApiKey = ref(false)
const apiKeyInput = ref(userStore.apiKey)

// 使用者個人資訊編輯
const showEditProfile = ref(false)
const editingProfile = ref({
  nickname: userStore.userName,
  realName: userStore.profile?.realName || '',
  age: userStore.profile?.age || '',
  gender: userStore.profile?.gender || 'unset',
  profession: userStore.profile?.profession || '',
  bio: userStore.profile?.bio || ''
})

const handleEditProfile = () => {
  showEditProfile.value = true
  editingProfile.value = {
    nickname: userStore.userName,
    realName: userStore.profile?.realName || '',
    age: userStore.profile?.age || '',
    gender: userStore.profile?.gender || 'unset',
    profession: userStore.profile?.profession || '',
    bio: userStore.profile?.bio || ''
  }
}

const handleSaveProfile = () => {
  userStore.updateProfile({
    ...userStore.profile!,
    nickname: editingProfile.value.nickname,
    realName: editingProfile.value.realName,
    age: editingProfile.value.age,
    gender: editingProfile.value.gender as any,
    profession: editingProfile.value.profession,
    bio: editingProfile.value.bio
  })
  showEditProfile.value = false
  alert('個人資訊已更新')
}

const handleCancelEdit = () => {
  showEditProfile.value = false
}

const handleUpdateApiKey = () => {
  if (apiKeyInput.value.trim()) {
    userStore.updateApiKey(apiKeyInput.value.trim())
    alert('API Key 已更新')
  }
}

const handleExportData = () => {
  const data = {
    user: userStore.profile,
    characters: characterStore.characters,
    chatRooms: chatRoomStore.chatRooms
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ai-chat-backup-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const handleImportData = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)

        if (confirm('確定要匯入資料嗎？這會覆蓋現有資料！')) {
          if (data.user) userStore.setProfile(data.user)
          if (data.characters) {
            // 先清空現有角色
            characterStore.clearCharacters()
            data.characters.forEach((char: any) => {
              characterStore.addCharacter(char)
            })
          }
          if (data.chatRooms) {
            // 先清空現有聊天室
            chatRoomStore.clearAllData()
            data.chatRooms.forEach((room: any) => {
              // 使用正確的參數格式呼叫 createChatRoom
              chatRoomStore.createChatRoom(room.name, room.characterIds, room.type)
            })
          }
          alert('匯入成功！')
          router.go(0) // 重新載入頁面
        }
      } catch (error) {
        alert('匯入失敗：檔案格式錯誤')
      }
    }
    reader.readAsText(file)
  }
}

const handleClearData = () => {
  if (confirm('確定要清除所有資料嗎？此操作無法復原！')) {
    if (confirm('再次確認：真的要清除所有資料嗎？')) {
      characterStore.clearCharacters()
      chatRoomStore.clearAllData()
      userStore.clearProfile()
      router.push('/onboarding')
    }
  }
}
</script>

<template>
  <div class="settings">
    <div class="page-header">
      <h2>設定</h2>
    </div>

    <!-- 使用者資訊 -->
    <div class="settings-section">
      <div class="section-header">
        <h3>使用者資訊</h3>
        <button class="btn btn-warning" @click="handleEditProfile">編輯</button>
      </div>

      <div v-if="!showEditProfile" class="user-info">
        <div class="user-avatar">
          <img :src="userStore.userAvatar" alt="頭像">
        </div>
        <div class="user-details">
          <div class="user-name">{{ userStore.userName }}</div>
          <div class="user-meta">
            {{ characterStore.characters.length }} 位好友
          </div>
          <div v-if="userStore.profile?.profession" class="user-meta">
            {{ userStore.profile.profession }}
          </div>
        </div>
      </div>

      <!-- 編輯模式 -->
      <div v-else class="edit-profile-form">
        <div class="form-group">
          <label>暱稱</label>
          <input v-model="editingProfile.nickname" class="input-field" placeholder="暱稱" />
        </div>
        <div class="form-group">
          <label>本名（選填）</label>
          <input v-model="editingProfile.realName" class="input-field" placeholder="本名" />
        </div>
        <div class="form-group">
          <label>年齡（選填）</label>
          <input v-model="editingProfile.age" class="input-field" placeholder="年齡" />
        </div>
        <div class="form-group">
          <label>性別（選填）</label>
          <select v-model="editingProfile.gender" class="input-field">
            <option value="unset">未設定</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </div>
        <div class="form-group">
          <label>職業（選填）</label>
          <input v-model="editingProfile.profession" class="input-field" placeholder="職業" />
        </div>
        <div class="form-group">
          <label>簡介（選填，最多250字）</label>
          <textarea v-model="editingProfile.bio" class="input-field" placeholder="簡介" maxlength="250" rows="3" />
          <div class="char-count">{{ editingProfile.bio.length }}/250</div>
        </div>
        <div class="button-group">
          <button class="btn-primary" @click="handleSaveProfile">儲存</button>
          <button class="btn-secondary" @click="handleCancelEdit">取消</button>
        </div>
      </div>
    </div>

    <!-- API 設定 -->
    <div class="settings-section">
      <h3>API 設定</h3>
      <div class="form-group">
        <label for="apiKey">Gemini API Key</label>
        <div class="api-key-input">
          <input id="apiKey" v-model="apiKeyInput" :type="showApiKey ? 'text' : 'password'" class="input-field"
            placeholder="輸入你的 Gemini API Key">
          <button class="btn btn-info" @click="showApiKey = !showApiKey">
            {{ showApiKey ? '隱藏' : '顯示' }}
          </button>
        </div>
        <button class="btn-primary btn-small" @click="handleUpdateApiKey">
          更新 API Key
        </button>
      </div>
    </div>

    <!-- 資料管理 -->
    <div class="settings-section">
      <h3>資料管理</h3>
      <div class="action-list">
        <button class="action-btn" @click="handleExportData">
          <span class="action-icon">📥</span>
          <div class="action-text">
            <div class="action-title">匯出資料</div>
            <div class="action-desc">備份所有資料到檔案</div>
          </div>
        </button>

        <label class="action-btn">
          <span class="action-icon">📤</span>
          <div class="action-text">
            <div class="action-title">匯入資料</div>
            <div class="action-desc">從檔案還原資料</div>
          </div>
          <input type="file" accept=".json" style="display: none" @change="handleImportData">
        </label>

        <button class="action-btn danger" @click="handleClearData">
          <span class="action-icon">🗑️</span>
          <div class="action-text">
            <div class="action-title">清除所有資料</div>
            <div class="action-desc">刪除所有資料並重新開始</div>
          </div>
        </button>
      </div>
    </div>

    <!-- 關於 -->
    <div class="settings-section">
      <h3>關於</h3>
      <div class="about-info">
        <p><strong>愛聊天 AI Chat</strong></p>
        <p>版本 0.1.0</p>
        <p>使用 Gemini API 提供服務</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  min-height: 100vh;
}

.settings-section {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-2xl);
  margin: var(--spacing-xl);
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  box-shadow: var(--shadow);
}

.settings-section h3 {
  font-size: var(--text-xl);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-xl) 0;
}

/* 使用者資訊 */
.user-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
}

.edit-profile-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.char-count {
  text-align: right;
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-xs);
}

.user-avatar {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  overflow: hidden;
  border: 2px solid var(--color-border);
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-details {
  flex: 1;
}

.user-name {
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.user-meta {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
}

/* API 設定 */
.api-key-input {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}


.btn-small {
  padding: var(--spacing-sm) var(--spacing-xl);
  font-size: var(--text-sm);
}

/* 動作列表 */
.action-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
  background: var(--color-bg-secondary);
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all var(--transition);
  text-align: left;
  width: 100%;
  color: var(--color-text-primary);
}

.action-btn:hover {
  background: var(--color-bg-hover);
  transform: translateX(4px);
}

.action-btn.danger:hover {
  background: #ffebee;
  color: #d32f2f;
}

.action-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.action-text {
  flex: 1;
}

.action-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.action-desc {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* 關於 */
.about-info {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.about-info p {
  margin: 0 0 var(--spacing-sm) 0;
}

.about-info strong {
  color: var(--color-text-primary);
}

@media (max-width: 768px) {
  .settings {
    padding: var(--spacing-md);
  }

  .api-key-input {
    flex-direction: column;
  }
}
</style>
