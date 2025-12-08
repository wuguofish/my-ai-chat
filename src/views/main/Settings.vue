<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCharacterStore } from '@/stores/characters'
import { useChatRoomsStore } from '@/stores/chatRooms'
import { useMemoriesStore } from '@/stores/memories'
import { useRelationshipsStore } from '@/stores/relationships'
import { googleAuthService } from '@/services/googleAuth'
import { googleDriveService } from '@/services/googleDrive'
import { fetchServerVersion, clearCacheAndReload, getVersionInfo, type VersionInfo } from '@/utils/version'
import { validateApiKey } from '@/services/gemini'
import { Eye, EyeOff } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'

const router = useRouter()
const userStore = useUserStore()
const characterStore = useCharacterStore()
const chatRoomStore = useChatRoomsStore()
const memoriesStore = useMemoriesStore()
const relationshipsStore = useRelationshipsStore()

// 版本資訊
const currentVersion = ref('')
const versionInfo = ref<VersionInfo | null>(null)

// 取得版本資訊
const loadVersionInfo = async () => {
  currentVersion.value = await fetchServerVersion()
  versionInfo.value = await getVersionInfo(currentVersion.value) || null
}

// Google Drive 同步狀態
const isGoogleConnected = ref(false)
const isSyncing = ref(false)

// 檢查 Google 連線狀態
const checkGoogleConnection = () => {
  isGoogleConnected.value = googleAuthService.isTokenValid()
}

// 初始化
checkGoogleConnection()
loadVersionInfo()

// 設定 token 失效回調
googleAuthService.setTokenInvalidCallback(async () => {
  return confirm('Google Drive 授權已失效，是否要重新授權？')
})

const showApiKey = ref(false)
const apiKeyInput = ref(userStore.apiKey)
const isValidatingApiKey = ref(false)
const apiKeyValidationResult = ref<{ valid: boolean; error?: string } | null>(null)

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

const handleValidateApiKey = async () => {
  if (!apiKeyInput.value.trim()) {
    alert('請先輸入 API Key')
    return
  }

  try {
    isValidatingApiKey.value = true
    apiKeyValidationResult.value = null

    const result = await validateApiKey(apiKeyInput.value.trim())
    apiKeyValidationResult.value = result

    if (result.valid) {
      alert('✅ API Key 有效且可正常使用')
    } else {
      alert(`❌ ${result.error || 'API Key 無效'}`)
    }
  } catch (error) {
    alert('檢測失敗，請稍後再試')
    console.error('API Key 檢測錯誤:', error)
  } finally {
    isValidatingApiKey.value = false
  }
}

const handleExportData = () => {
  // 讀取記憶/情境追蹤資料
  const memoryTracking = localStorage.getItem('ai-chat-memory-tracking')
  const contextTracking = localStorage.getItem('ai-chat-context-tracking')

  const data = {
    user: userStore.profile,
    characters: characterStore.characters,
    chatRooms: chatRoomStore.chatRooms,
    messages: chatRoomStore.messages,  // 匯出聊天訊息
    memories: {
      characterMemories: memoriesStore.characterMemories,
      roomMemories: memoriesStore.roomMemories
    },
    relationships: {
      userToCharacter: relationshipsStore.userToCharacter,
      characterToCharacter: relationshipsStore.characterToCharacter
    },
    // 記憶/情境處理追蹤資料
    tracking: {
      memory: memoryTracking ? JSON.parse(memoryTracking) : {},
      context: contextTracking ? JSON.parse(contextTracking) : {}
    }
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
          // 還原使用者資料
          if (data.user) userStore.setProfile(data.user)

          // 還原角色資料
          if (data.characters) {
            characterStore.clearCharacters()
            data.characters.forEach((char: any) => {
              characterStore.addCharacter(char)
            })
          }

          // 還原聊天室資料
          if (data.chatRooms || data.messages) {
            chatRoomStore.$patch({
              chatRooms: data.chatRooms || [],
              messages: data.messages || {}
            })
          }

          // 還原記憶資料
          if (data.memories) {
            memoriesStore.$patch({
              characterMemories: data.memories.characterMemories || {},
              roomMemories: data.memories.roomMemories || {}
            })
          }

          // 還原關係資料
          if (data.relationships) {
            relationshipsStore.$patch({
              userToCharacter: data.relationships.userToCharacter || [],
              characterToCharacter: data.relationships.characterToCharacter || []
            })
          }

          // 還原記憶/情境處理追蹤資料
          if (data.tracking) {
            if (data.tracking.memory) {
              localStorage.setItem('ai-chat-memory-tracking', JSON.stringify(data.tracking.memory))
            }
            if (data.tracking.context) {
              localStorage.setItem('ai-chat-context-tracking', JSON.stringify(data.tracking.context))
            }
          }

          // 遷移舊版本的記憶資料（如果有）
          memoriesStore.migrateLegacyRoomMemories(chatRoomStore.chatRooms)

          // 為沒有作息設定的角色加上預設作息
          characterStore.migrateCharacterSchedules()

          alert('匯入成功！')
          window.location.reload()
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

// Google Drive 相關功能
const handleGoogleConnect = async () => {
  try {
    await googleAuthService.requestAuth()
    checkGoogleConnection()
    alert('Google Drive 連線成功！')
  } catch (error) {
    console.error('Google Drive 連線失敗:', error)
    alert('Google Drive 連線失敗，請稍後再試')
  }
}

const handleGoogleDisconnect = () => {
  if (confirm('確定要中斷 Google Drive 連線嗎？')) {
    googleAuthService.signOut()
    checkGoogleConnection()
    alert('已中斷 Google Drive 連線')
  }
}

const handleGoogleBackup = async () => {
  try {
    isSyncing.value = true

    // 確保已連線
    if (!isGoogleConnected.value) {
      await handleGoogleConnect()
    }

    // 讀取記憶/情境追蹤資料
    const memoryTracking = localStorage.getItem('ai-chat-memory-tracking')
    const contextTracking = localStorage.getItem('ai-chat-context-tracking')

    // 準備備份資料（包含完整資料）
    const data = {
      user: userStore.profile,
      characters: characterStore.characters,
      chatRooms: chatRoomStore.chatRooms,
      messages: chatRoomStore.messages,  // 包含聊天訊息
      memories: {
        characterMemories: memoriesStore.characterMemories,
        roomMemories: memoriesStore.roomMemories
      },
      relationships: {
        userToCharacter: relationshipsStore.userToCharacter,
        characterToCharacter: relationshipsStore.characterToCharacter
      },
      // 記憶/情境處理追蹤資料
      tracking: {
        memory: memoryTracking ? JSON.parse(memoryTracking) : {},
        context: contextTracking ? JSON.parse(contextTracking) : {}
      },
      timestamp: new Date().toISOString()
    }

    // 上傳到 Google Drive
    await googleDriveService.uploadBackup(data)
    alert('備份到 Google Drive 成功！')
  } catch (error) {
    console.error('備份失敗:', error)

    alert('備份失敗：' + (error as Error).message)

    // 標記為連線中斷
    isSyncing.value = false
    isGoogleConnected.value = false;

    // 詢問使用者是否要重新授權
    const shouldReauth = confirm('Google Drive 授權已失效，是否要重新授權並繼續備份？')
    if (shouldReauth) {
      try {
        googleAuthService.signOut()
        await googleAuthService.requestAuth()
        checkGoogleConnection()
        // 重新授權成功，重試備份
        if (isGoogleConnected.value) {
          alert('重新授權成功！即將重新執行備份。')
          await handleGoogleBackup()
          return  // 避免 finally 再次設定 isSyncing = false
        }
      } catch (reauthError) {
        alert('重新授權失敗：' + (reauthError as Error).message)
      }
    }
    
  } finally {
    isSyncing.value = false
  }
}

const handleGoogleRestore = async () => {
  try {
    isSyncing.value = true

    // 確保已連線
    if (!isGoogleConnected.value) {
      await handleGoogleConnect()
    }

    if (!confirm('確定要從 Google Drive 還原資料嗎？這會覆蓋現有資料！')) {
      return
    }

    // 從 Google Drive 下載
    const data = await googleDriveService.downloadBackup()

    // 還原資料（包含完整資料）
    if (data.user) userStore.setProfile(data.user)

    if (data.characters) {
      characterStore.clearCharacters()
      data.characters.forEach((char: any) => {
        characterStore.addCharacter(char)
      })
    }

    if (data.chatRooms || data.messages) {
      chatRoomStore.$patch({
        chatRooms: data.chatRooms || [],
        messages: data.messages || {}
      })
    }

    // 還原記憶資料
    if (data.memories) {
      memoriesStore.$patch({
        characterMemories: data.memories.characterMemories || {},
        roomMemories: data.memories.roomMemories || {}
      })
    }

    // 還原關係資料
    if (data.relationships) {
      relationshipsStore.$patch({
        userToCharacter: data.relationships.userToCharacter || [],
        characterToCharacter: data.relationships.characterToCharacter || []
      })
    }

    // 還原記憶/情境處理追蹤資料
    if (data.tracking) {
      if (data.tracking.memory) {
        localStorage.setItem('ai-chat-memory-tracking', JSON.stringify(data.tracking.memory))
      }
      if (data.tracking.context) {
        localStorage.setItem('ai-chat-context-tracking', JSON.stringify(data.tracking.context))
      }
    }

    alert('從 Google Drive 還原成功！')
    window.location.reload()
  } catch (error) {
    console.error('還原失敗:', error)
    
    // 標記為連線中斷
    isSyncing.value = false
    isGoogleConnected.value = false;

    // 詢問使用者是否要重新授權
    const shouldReauth = confirm('Google Drive 授權已失效，是否要重新授權並繼續備份？')
    if (shouldReauth) {
      try {
        googleAuthService.signOut()
        await googleAuthService.requestAuth()
        checkGoogleConnection()

        // 重新授權成功，重試還原
        if (isGoogleConnected.value) {
          alert('重新授權成功！即將重新執行還原。')
          await handleGoogleRestore()
          return  // 避免 finally 再次設定 isSyncing = false
        }
      } catch (reauthError) {
        alert('重新授權失敗：' + (reauthError as Error).message)
      }
    }
    
  } finally {
    isSyncing.value = false
  }
}
</script>

<template>
  <PageHeader title="設定" />
  <div class="page">

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
            <EyeOff v-if="showApiKey" :size="18" />
            <Eye v-else :size="18" />
          </button>
        </div>
        <div class="button-group">
          <button class="btn-primary btn" @click="handleUpdateApiKey">
            更新 API Key
          </button>
          <button class="btn-info btn" @click="handleValidateApiKey" :disabled="isValidatingApiKey">
            {{ isValidatingApiKey ? '檢測中...' : '檢測 API Key' }}
          </button>
        </div>
        <p class="api-key-hint">
          💡 完整資訊請前往 <a href="https://aistudio.google.com/app/api-keys" target="_blank" rel="noopener noreferrer">Google
            AI Studio</a> 查看額度與管理 API Key
        </p>
      </div>
    </div>

    <!-- Google Drive 同步 -->
    <div class="settings-section">
      <h3>Google Drive 同步</h3>
      <div class="google-drive-section">
        <div class="connection-status">
          <span class="status-icon">{{ isGoogleConnected ? '🟢' : '⚪' }}</span>
          <span class="status-text">
            {{ isGoogleConnected ? 'Google Drive 已連線' : 'Google Drive 未連線' }}
          </span>
        </div>

        <div class="action-list">
          <button v-if="!isGoogleConnected" class="action-btn" @click="handleGoogleConnect" :disabled="isSyncing">
            <span class="action-icon">🔗</span>
            <div class="action-text">
              <div class="action-title">連線 Google Drive</div>
              <div class="action-desc">授權連線到你的 Google Drive</div>
            </div>
          </button>

          <button v-else class="action-btn" @click="handleGoogleDisconnect" :disabled="isSyncing">
            <span class="action-icon">🔌</span>
            <div class="action-text">
              <div class="action-title">中斷連線</div>
              <div class="action-desc">取消 Google Drive 授權</div>
            </div>
          </button>

          <button class="action-btn" @click="handleGoogleBackup" :disabled="isSyncing || !isGoogleConnected">
            <span class="action-icon">☁️</span>
            <div class="action-text">
              <div class="action-title">{{ isSyncing ? '備份中...' : '備份到 Google Drive' }}</div>
              <div class="action-desc">將資料備份到雲端</div>
            </div>
          </button>

          <button class="action-btn" @click="handleGoogleRestore" :disabled="isSyncing || !isGoogleConnected">
            <span class="action-icon">📥</span>
            <div class="action-text">
              <div class="action-title">{{ isSyncing ? '還原中...' : '從 Google Drive 還原' }}</div>
              <div class="action-desc">從雲端還原資料</div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- 資料管理 -->
    <div class="settings-section">
      <h3>本地資料管理</h3>
      <div class="action-list">
        <button class="action-btn" @click="handleExportData">
          <span class="action-icon">💾</span>
          <div class="action-text">
            <div class="action-title">匯出資料</div>
            <div class="action-desc">備份所有資料到本地檔案</div>
          </div>
        </button>

        <label class="action-btn">
          <span class="action-icon">📤</span>
          <div class="action-text">
            <div class="action-title">匯入資料</div>
            <div class="action-desc">從本地檔案還原資料</div>
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
      <div class="about-info">
        <div class="about-header">
          <img src="/logo.svg" alt="愛茶的 AI Chat Logo" class="app-logo" />
          <div class="header-text">
            <h4>愛茶的 AI Chat</h4>
            <span class="version-badge">v{{ currentVersion }}</span>
          </div>
        </div>
        <p class="about-desc">
          和專屬於你的 AI 夥伴們泡茶聊天，建立美好的互動記憶。
        </p>

        <div class="about-links">
          <a href="https://github.com/wuguofish/my-ai-chat" target="_blank" class="link-btn">
            <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
              <path
                d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z">
              </path>
            </svg>
            GitHub Repository
          </a>
          <a href="https://wuguofish.github.io/my-ai-chat/CHANGELOG.md" target="_blank" class="link-btn">
            <span>📝</span> 完整更新履歷
          </a>
          <button @click="clearCacheAndReload" class="link-btn">
            <span>🔄</span> 清除快取並重新載入
          </button>
          <a href="https://portaly.cc/atone0331/support" target="_blank" class="link-btn">
            <span>💟</span> Donate
          </a>
        </div>

        <div v-if="versionInfo" class="changelog">
          <h5>最新更新 (v{{ currentVersion }})</h5>
          <ul>
            <li v-for="(feature, index) in versionInfo.features" :key="index">
              {{ feature }}
            </li>
          </ul>
        </div>

        <div class="about-tech">
          <p><strong>技術架構</strong></p>
          <div class="tech-tags">
            <span class="tech-tag">Vue 3</span>
            <span class="tech-tag">TypeScript</span>
            <span class="tech-tag">Pinia</span>
            <span class="tech-tag">Gemini 2.5</span>
          </div>
          <p><strong>AI協作者</strong></p>
          <div class="tech-tags">
            <span class="tech-tag">Claude Code</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

.changelog{
  padding: 1rem;
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
  position: relative;
  margin-bottom: var(--spacing-md);
}

.api-key-input input {
  flex: 1;
  padding-right: 50px; /* 為按鈕留出空間 */
}

.api-key-input .btn {
  position: absolute;
  right: 1px;
  top: 1px;
  bottom: 1px;
  border-radius: 0 var(--radius) var(--radius) 0;
  min-width: 48px;
  padding: 0 var(--spacing-sm);
}

.api-key-hint {
  margin-top: var(--spacing-md);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.api-key-hint a {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
}

.api-key-hint a:hover {
  text-decoration: underline;
}

.btn-small {
  padding: var(--spacing-sm) var(--spacing-xl);
  font-size: var(--text-sm);
}

.btn-icon {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

/* Google Drive 同步 */
.google-drive-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
}

.status-icon {
  font-size: 20px;
}

.status-text {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  font-weight: 500;
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

.about-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
}

.app-logo {
  width: 128px;
  height: 128px;
  flex-shrink: 0;
}

.header-text {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.about-header h4 {
  font-size: var(--text-2xl);
  color: var(--color-text-primary);
  margin: 0;
}

.version-badge {
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
}

.about-desc {
  margin-bottom: var(--spacing-xl);
  line-height: 1.6;
}

.about-links {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
  flex-wrap: wrap;
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--color-text-primary);
  transition: all var(--transition);
  font-size: var(--text-sm);
}

.link-btn:hover {
  background: var(--color-bg-hover);
  transform: translateY(-2px);
}

.changelog h5 {
  font-size: var(--text-lg);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-md);
}

.changelog ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.changelog li {
  padding: var(--spacing-sm) 0;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.about-tech {
  margin-top: var(--spacing-xl);
  padding-top: var(--spacing-xl);
  border-top: 1px solid var(--color-border);
}

.about-tech p {
  margin-bottom: var(--spacing-md);
}

.tech-tags {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-md);
}

.tech-tag {
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(102, 126, 234, 0.1);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
}

.about-info p {
  margin: 0 0 var(--spacing-sm) 0;
}

.about-info strong {
  color: var(--color-text-primary);
}

@media (max-width: 768px) {

  .page {
    padding: 0 var(--spacing-md);
  }

  .api-key-input {
    flex-direction: column;
  }

  .about-links {
    flex-direction: column;
  }
}
</style>
