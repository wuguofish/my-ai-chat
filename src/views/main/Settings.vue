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
            data.characters.forEach((char: any) => {
              characterStore.addCharacter(char)
            })
          }
          if (data.chatRooms) {
            data.chatRooms.forEach((room: any) => {
              chatRoomStore.createChatRoom(room)
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
    <div class="header">
      <h2>設定</h2>
    </div>

    <!-- 使用者資訊 -->
    <div class="settings-section">
      <h3>使用者資訊</h3>
      <div class="user-info">
        <div class="user-avatar">
          <img :src="userStore.userAvatar" alt="頭像">
        </div>
        <div class="user-details">
          <div class="user-name">{{ userStore.userName }}</div>
          <div class="user-meta">
            {{ characterStore.characters.length }} 位好友
          </div>
        </div>
      </div>
    </div>

    <!-- API 設定 -->
    <div class="settings-section">
      <h3>API 設定</h3>
      <div class="form-group">
        <label for="apiKey">Gemini API Key</label>
        <div class="api-key-input">
          <input
            id="apiKey"
            v-model="apiKeyInput"
            :type="showApiKey ? 'text' : 'password'"
            class="input-field"
            placeholder="輸入你的 Gemini API Key"
          >
          <button class="btn-toggle" @click="showApiKey = !showApiKey">
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
          <input
            type="file"
            accept=".json"
            style="display: none"
            @change="handleImportData"
          >
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

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: white;
  padding: 20px;
  border-bottom: 2px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header h2 {
  font-size: 28px;
  color: #333;
  margin: 0;
}

.settings-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin: 20px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.settings-section h3 {
  font-size: 18px;
  color: #333;
  margin: 0 0 20px 0;
}

/* 使用者資訊 */
.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid #e0e0e0;
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
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.user-meta {
  font-size: 14px;
  color: #666;
}

/* API 設定 */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.api-key-input {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.input-field {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  transition: all 0.3s;
}

.input-field:focus {
  outline: none;
  border-color: #667eea;
}

.btn-toggle {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.btn-toggle:hover {
  background: #808080;
}

.btn-primary {
  padding: 10px 24px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary:hover {
  background: #5568d3;
}

.btn-small {
  padding: 8px 20px;
  font-size: 13px;
}

/* 動作列表 */
.action-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f5f5f5;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: left;
  width: 100%;
}

.action-btn:hover {
  background: #e8e8e8;
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
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.action-desc {
  font-size: 13px;
  color: #666;
}

/* 關於 */
.about-info {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}

.about-info p {
  margin: 0 0 8px 0;
}

.about-info strong {
  color: #333;
}

@media (max-width: 768px) {
  .settings {
    padding: 12px;
  }

  .api-key-input {
    flex-direction: column;
  }
}
</style>
