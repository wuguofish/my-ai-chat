<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCharacterStore } from '@/stores/characters'
import { useChatRoomsStore } from '@/stores/chatRooms'
import { useMemoriesStore } from '@/stores/memories'
import { useRelationshipsStore } from '@/stores/relationships'
import { useModal } from '@/composables/useModal'
import { googleAuthService } from '@/services/googleAuth'
import { googleDriveService, TokenInvalidError } from '@/services/googleDrive'
import Step1ApiKey from './Step1ApiKey.vue'
import Step2Profile from './Step2Profile.vue'
import Step3Character from './Step3Character.vue'

const { alert, confirm } = useModal()

const router = useRouter()
const userStore = useUserStore()
const characterStore = useCharacterStore()
const chatRoomStore = useChatRoomsStore()
const memoriesStore = useMemoriesStore()
const relationshipsStore = useRelationshipsStore()

const currentStep = ref(0)
const isImporting = ref(false)

const handleStep1Complete = () => {
  currentStep.value = 2
}

const handleStep2Complete = () => {
  currentStep.value = 3
}

const handleStep3Complete = () => {
  // 完成引導，進入主畫面
  router.push('/main')
}

// 匯入本地檔案
const handleImportLocalFile = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        isImporting.value = true
        const data = JSON.parse(e.target?.result as string)

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

        await alert('匯入成功！', { type: 'success' })
        router.push('/main')
      } catch (error) {
        await alert('匯入失敗：檔案格式錯誤', { type: 'danger' })
      } finally {
        isImporting.value = false
      }
    }
    reader.readAsText(file)
  }
}

// 從 Google Drive 匯入
const handleImportFromGoogleDrive = async () => {
  try {
    isImporting.value = true

    // 請求 Google 授權
    await googleAuthService.requestAuth()

    // 從 Google Drive 下載
    const data = await googleDriveService.downloadBackup()

    // 還原資料
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

    await alert('從 Google Drive 匯入成功！', { type: 'success' })
    router.push('/main')
  } catch (error) {
    console.error('匯入失敗:', error)

    // 處理 token 無效錯誤
    if (error instanceof TokenInvalidError) {
      const shouldReauth = await confirm('Google Drive 授權已失效，是否要重新授權？', { type: 'warning' })
      if (shouldReauth) {
        try {
          await googleAuthService.handleTokenInvalid()
          // 重新授權成功，重試匯入
          await alert('重新授權成功！請再次點擊 Google Drive 匯入按鈕。', { type: 'success' })
        } catch (reauthError) {
          await alert('重新授權失敗：' + (reauthError as Error).message, { type: 'danger' })
        }
      }
    } else if ((error as Error).message === '找不到備份檔案') {
      await alert('Google Drive 中沒有找到備份檔案，請先在設定頁面進行備份', { type: 'warning' })
    } else {
      await alert('匯入失敗：' + (error as Error).message, { type: 'danger' })
    }
  } finally {
    isImporting.value = false
  }
}

// 開始新的設定
const handleStartSetup = () => {
  currentStep.value = 1
}
</script>

<template>
  <div class="onboarding">
    <div class="onboarding-container">
      <!-- 歡迎畫面 -->
      <div v-if="currentStep === 0" class="welcome-screen">
        <h1>歡迎使用愛聊天</h1>
        <p>與你的 AI 角色們開始對話</p>

        <button class="btn-primary btn-large" @click="handleStartSetup" :disabled="isImporting">
          開始新的設定
        </button>

        <div class="divider">
          <span>或</span>
        </div>

        <div class="import-options">
          <div class="import-section">
            <h3>已有備份資料？</h3>
            <p class="import-desc">從備份檔案快速還原你的資料</p>

            <div class="import-buttons">
              <label class="import-btn" :class="{ disabled: isImporting }">
                <span class="import-icon">📁</span>
                <div class="import-text">
                  <div class="import-title">{{ isImporting ? '匯入中...' : '本地檔案匯入' }}</div>
                  <div class="import-subtitle">從電腦選擇備份檔案</div>
                </div>
                <input type="file" accept=".json" style="display: none" @change="handleImportLocalFile"
                  :disabled="isImporting">
              </label>

              <button class="import-btn" @click="handleImportFromGoogleDrive" :disabled="isImporting">
                <span class="import-icon">☁️</span>
                <div class="import-text">
                  <div class="import-title">{{ isImporting ? '匯入中...' : 'Google Drive 匯入' }}</div>
                  <div class="import-subtitle">從雲端還原資料</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 步驟 1: API Key -->
      <Step1ApiKey v-if="currentStep === 1" @next="handleStep1Complete" />

      <!-- 步驟 2: 個人資料 -->
      <Step2Profile v-if="currentStep === 2" @next="handleStep2Complete" @back="currentStep = 1" />

      <!-- 步驟 3: 建立角色 -->
      <Step3Character v-if="currentStep === 3" @complete="handleStep3Complete" @back="currentStep = 2" />

      <!-- 步驟指示器 -->
      <div v-if="currentStep > 0" class="step-indicator">
        <div v-for="step in 3" :key="step" class="step-dot"
          :class="{ active: currentStep === step, completed: currentStep > step }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.onboarding-container {
  width: 90%;
  max-width: 500px;
  min-height: 400px;
  background: white;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
}

.welcome-screen {
  text-align: center;
  padding: 20px 0;
}

.welcome-screen h1 {
  font-size: 32px;
  margin-bottom: 8px;
  color: #333;
}

.welcome-screen > p {
  font-size: 16px;
  color: #666;
  margin-bottom: 32px;
}

.import-options {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.import-section h3 {
  font-size: 18px;
  color: #333;
  margin-bottom: 8px;
}

.import-desc {
  font-size: 14px;
  color: #666;
  margin-bottom: 16px;
}

.import-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-btn {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-bg-secondary, #f5f5f5);
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: left;
  width: 100%;
}

.import-btn:hover:not(.disabled) {
  border-color: #667eea;
  background: #f0f5ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

.import-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.import-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.import-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.import-text {
  flex: 1;
}

.import-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.import-subtitle {
  font-size: 13px;
  color: #666;
}

.divider {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #999;
  font-size: 14px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e0e0e0;
}

.btn-large {
  width: 100%;
  padding: 16px 32px;
  font-size: 18px;
}

.btn-primary {
  background: #667eea;
  color: white;
  border: none;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.step-indicator {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 32px;
}

.step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ddd;
  transition: all 0.3s;
}

.step-dot.active {
  background: #667eea;
  transform: scale(1.2);
}

.step-dot.completed {
  background: #52c41a;
}
</style>
