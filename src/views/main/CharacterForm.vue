<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCharacterStore } from '@/stores/characters'
import type { Character, Gender } from '@/types'
import { LIMITS } from '@/utils/constants'
import AvatarCropper from '@/components/common/AvatarCropper.vue'
import { v4 as uuidv4 } from 'uuid'

const router = useRouter()
const route = useRoute()
const characterStore = useCharacterStore()

const isEditMode = computed(() => !!route.params.id)
const editingCharacterId = computed(() => route.params.id as string)

// 表單模式
const isAdvancedMode = ref(false)

// 基本資料
const name = ref('')
const gender = ref<Gender>('unset')
const age = ref('')
const profession = ref('')
const personality = ref('')
const speakingStyle = ref('')
const background = ref('')
const likes = ref('')
const dislikes = ref('')
const avatar = ref('')

// 進階資料
const systemPrompt = ref('')

// 事件記憶
const events = ref<string[]>([])
const newEvent = ref('')

// 裁剪相關
const showCropper = ref(false)
const originalImage = ref('')

const error = ref('')

// 載入編輯資料
onMounted(() => {
  if (isEditMode.value) {
    const character = characterStore.getCharacterById(editingCharacterId.value)
    if (character) {
      name.value = character.name
      gender.value = character.gender || 'unset'
      age.value = character.age || ''
      profession.value = character.profession || ''
      personality.value = character.personality || ''
      speakingStyle.value = character.speakingStyle || ''
      background.value = character.background || ''
      likes.value = character.likes || ''
      dislikes.value = character.dislikes || ''
      avatar.value = character.avatar
      systemPrompt.value = character.systemPrompt || ''
      events.value = [...character.events]
    } else {
      router.push('/main/characters')
    }
  }
})

const handleSubmit = () => {
  // 驗證必填欄位
  if (!name.value.trim()) {
    error.value = '請輸入好友名稱'
    return
  }

  if (!personality.value.trim()) {
    error.value = '請輸入性格描述'
    return
  }

  const characterData: Character = {
    id: isEditMode.value ? editingCharacterId.value : uuidv4(),
    name: name.value.trim(),
    gender: gender.value !== 'unset' ? gender.value : undefined,
    age: age.value.trim() || undefined,
    profession: profession.value.trim() || undefined,
    personality: personality.value.trim(),
    speakingStyle: speakingStyle.value.trim() || undefined,
    background: background.value.trim() || undefined,
    likes: likes.value.trim() || undefined,
    dislikes: dislikes.value.trim() || undefined,
    avatar: avatar.value || getDefaultAvatar(name.value),
    systemPrompt: systemPrompt.value.trim() || undefined,
    events: events.value.filter(e => e.trim() !== ''),
    createdAt: isEditMode.value
      ? characterStore.getCharacterById(editingCharacterId.value)?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  if (isEditMode.value) {
    characterStore.updateCharacter(characterData)
  } else {
    characterStore.addCharacter(characterData)
  }

  router.push('/main/characters')
}

const handleCancel = () => {
  router.back()
}

const handleAvatarUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      originalImage.value = e.target?.result as string
      showCropper.value = true
    }
    reader.readAsDataURL(file)
  }
}

const handleCropConfirm = (croppedImage: string) => {
  avatar.value = croppedImage
  showCropper.value = false
  originalImage.value = ''
}

const handleCropCancel = () => {
  showCropper.value = false
  originalImage.value = ''
}

const addEvent = () => {
  if (newEvent.value.trim() && events.value.length < LIMITS.MAX_CHARACTER_EVENTS) {
    events.value.push(newEvent.value.trim())
    newEvent.value = ''
  }
}

const removeEvent = (index: number) => {
  events.value.splice(index, 1)
}

const getDefaultAvatar = (name: string) => {
  const initial = name.charAt(0).toUpperCase()
  const canvas = document.createElement('canvas')
  canvas.width = 100
  canvas.height = 100
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.fillStyle = '#667eea'
    ctx.fillRect(0, 0, 100, 100)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initial, 50, 50)
  }

  return canvas.toDataURL()
}
</script>

<template>
  <div class="character-form">
    <div class="form-header">
      <h2>{{ isEditMode ? '編輯好友' : '新增好友' }}</h2>
      <button class="mode-toggle" @click="isAdvancedMode = !isAdvancedMode">
        {{ isAdvancedMode ? '切換為基本模式' : '切換為進階模式' }}
      </button>
    </div>

    <div class="form-content">
      <!-- 頭像上傳 -->
      <div class="form-section">
        <h3>頭像</h3>
        <div class="avatar-upload">
          <div class="avatar-preview">
            <img v-if="avatar" :src="avatar" alt="頭像">
            <div v-else class="avatar-placeholder">
              📷
            </div>
          </div>
          <label for="avatar-input" class="upload-btn">
            上傳頭像
          </label>
          <input id="avatar-input" type="file" accept="image/*" style="display: none" @change="handleAvatarUpload">
        </div>
      </div>

      <!-- 基本資料 -->
      <div class="form-section">
        <h3>基本資料</h3>

        <div class="form-group">
          <label for="name">名稱 *</label>
          <input id="name" v-model="name" type="text" placeholder="輸入好友的名稱" class="input-field" maxlength="20">
        </div>

        <div class="form-group">
          <label>性別（選填）</label>
          <div class="radio-group">
            <label class="radio-item">
              <input v-model="gender" type="radio" value="male">
              <span>男</span>
            </label>
            <label class="radio-item">
              <input v-model="gender" type="radio" value="female">
              <span>女</span>
            </label>
            <label class="radio-item">
              <input v-model="gender" type="radio" value="unset">
              <span>未設定</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="age">年齡（選填）</label>
          <input id="age" v-model="age" type="text" placeholder="例如：25" class="input-field" maxlength="10">
        </div>

        <div class="form-group">
          <label for="personality">性格 *</label>
          <textarea id="personality" v-model="personality" placeholder="描述這個好友的性格特質（例如：開朗活潑、善解人意）"
            class="textarea-field" :maxlength="LIMITS.MAX_CHARACTER_PERSONALITY_LENGTH" rows="3" />
          <div class="char-count">{{ personality.length }}/{{ LIMITS.MAX_CHARACTER_PERSONALITY_LENGTH }}</div>
        </div>

        <div class="form-group">
          <label for="speakingStyle">說話風格（選填）</label>
          <textarea id="speakingStyle" v-model="speakingStyle" placeholder="描述說話的方式和語氣（例如：溫柔體貼、幽默風趣）"
            class="textarea-field" :maxlength="LIMITS.MAX_CHARACTER_SPEAKING_STYLE_LENGTH" rows="3" />
          <div class="char-count">{{ speakingStyle.length }}/{{ LIMITS.MAX_CHARACTER_SPEAKING_STYLE_LENGTH }}</div>
        </div>

        <div class="form-group">
          <label for="background">背景故事（選填）</label>
          <textarea id="background" v-model="background" placeholder="描述背景和經歷" class="textarea-field"
            :maxlength="LIMITS.MAX_CHARACTER_BACKGROUND_LENGTH" rows="4" />
          <div class="char-count">{{ background.length }}/{{ LIMITS.MAX_CHARACTER_BACKGROUND_LENGTH }}</div>
        </div>

        <div class="form-group">
          <label for="likes">喜歡的事物（選填）</label>
          <input id="likes" v-model="likes" type="text" placeholder="例如：音樂、旅行、美食" class="input-field" maxlength="100">
        </div>

        <div class="form-group">
          <label for="dislikes">討厭的事物（選填）</label>
          <input id="dislikes" v-model="dislikes" type="text" placeholder="例如：吵鬧、不誠實" class="input-field"
            maxlength="100">
        </div>
      </div>

      <!-- 進階模式 -->
      <div v-if="isAdvancedMode" class="form-section">
        <h3>進階設定</h3>
        <div class="form-group">
          <label for="systemPrompt">系統提示詞</label>
          <textarea id="systemPrompt" v-model="systemPrompt" placeholder="自訂系統提示詞（留空則使用預設）" class="textarea-field"
            :maxlength="LIMITS.MAX_SYSTEM_PROMPT_LENGTH" rows="6" />
          <div class="char-count">{{ systemPrompt.length }}/{{ LIMITS.MAX_SYSTEM_PROMPT_LENGTH }}</div>
          <div class="help-text">
            提示：系統提示詞會覆蓋上述基本資料自動生成的設定
          </div>
        </div>
      </div>

      <!-- 事件記憶 -->
      <div class="form-section">
        <h3>重要事件（選填）</h3>
        <p class="section-desc">記錄與這位好友相關的重要事件或記憶（最多 {{ LIMITS.MAX_CHARACTER_EVENTS }} 筆）</p>

        <div class="event-input-group">
          <input v-model="newEvent" type="text" placeholder='輸入事件描述' class="input-field" maxlength="200"
            @keyup.enter="addEvent">
          <button class="btn-add" :disabled="events.length >= LIMITS.MAX_CHARACTER_EVENTS" @click="addEvent">
            新增
          </button>
        </div>

        <div v-if="events.length > 0" class="event-list">
          <div v-for="(event, index) in events" :key="index" class="event-item">
            <span class="event-text">{{ event }}</span>
            <button class="event-delete" @click="removeEvent(index)">✕</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-message">{{ error }}</div>

    <div class="button-group">
      <button class="btn-secondary" @click="handleCancel">
        取消
      </button>
      <button class="btn-primary" @click="handleSubmit">
        {{ isEditMode ? '儲存' : '建立' }}
      </button>
    </div>

    <!-- 頭像裁剪器 -->
    <AvatarCropper v-if="showCropper" :image="originalImage" @confirm="handleCropConfirm" @cancel="handleCropCancel" />
  </div>
</template>

<style scoped>
.character-form {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #e0e0e0;
}

.form-header h2 {
  font-size: 28px;
  color: #333;
  margin: 0;
}

.mode-toggle {
  padding: 8px 16px;
  background: #f0f0f0;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.mode-toggle:hover {
  background: #e0e0e0;
}

.form-content {
  margin-bottom: 24px;
}

.form-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.form-section h3 {
  font-size: 20px;
  color: #333;
  margin: 0 0 16px 0;
}

.section-desc {
  font-size: 14px;
  color: #666;
  margin: -8px 0 16px 0;
}

.avatar-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.avatar-preview {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 12px;
  border: 3px solid #e0e0e0;
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  font-size: 48px;
}

.upload-btn {
  padding: 8px 16px;
  background: #f0f0f0;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.upload-btn:hover {
  background: #e0e0e0;
}

.form-group {
  text-align: left;
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.input-field,
.textarea-field {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  transition: all 0.3s;
}

.input-field:focus,
.textarea-field:focus {
  outline: none;
  border-color: #667eea;
}

.textarea-field {
  resize: vertical;
}

.radio-group {
  display: flex;
  gap: 16px;
}

.radio-item {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.radio-item input[type="radio"] {
  margin-right: 6px;
  cursor: pointer;
}

.radio-item span {
  font-size: 14px;
  color: #666;
}

.char-count {
  text-align: right;
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.help-text {
  font-size: 13px;
  color: #999;
  margin-top: 8px;
  font-style: italic;
}

/* 事件列表 */
.event-input-group {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.event-input-group .input-field {
  flex: 1;
}

.btn-add {
  padding: 10px 20px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.btn-add:hover:not(:disabled) {
  background: #5568d3;
}

.btn-add:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
}

.event-text {
  flex: 1;
  font-size: 14px;
  color: #333;
}

.event-delete {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ff4d4f;
  color: white;
  border: none;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  margin-left: 12px;
}

.event-delete:hover {
  background: #d32f2f;
}

.error-message {
  color: #ff4d4f;
  font-size: 14px;
  text-align: center;
  margin-bottom: 16px;
  padding: 12px;
  background: #fff1f0;
  border-radius: 8px;
}

.button-group {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.btn-primary,
.btn-secondary {
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
  border: none;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #f0f0f0;
  color: #666;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

@media (max-width: 768px) {
  .character-form {
    padding: 12px;
  }

  .form-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .event-input-group {
    flex-direction: column;
  }
}
</style>
