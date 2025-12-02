<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCharacterStore } from '@/stores/characters'
import type { Character, Gender } from '@/types'
import { LIMITS } from '@/utils/constants'
import AvatarCropper from '@/components/common/AvatarCropper.vue'
import { v4 as uuidv4 } from 'uuid'
import {ArrowLeft} from 'lucide-vue-next'

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
const maxOutputTokens = ref<number>(2048)

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
      maxOutputTokens.value = character.maxOutputTokens || 2048
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
    maxOutputTokens: maxOutputTokens.value || undefined,
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
  <div class="header">
    <button class="back-btn" @click="handleCancel">
      <ArrowLeft :size="20" />
      返回
    </button>
    <h3>
      {{ isEditMode ? '編輯好友' : '新增好友' }}
    </h3>
    <label class="toggle-switch">
      <input type="checkbox" v-model="isAdvancedMode">
      <span class="toggle-slider"></span>
      <span class="toggle-label">進階模式</span>
    </label>
  </div>
  <div class="character-form">
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
          <label for="profession">職業（選填）</label>
          <input id="profession" v-model="profession" type="text" placeholder="例如：軟體工程師" class="input-field"
            maxlength="30">
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
            <p style="margin-top: 8px;">
              <strong>💡
                提示：</strong>系統提示詞可用於<span class="text-info">補充特殊設定、禁忌話題或角色獨有的表達模式</span>，會附加在自動生成內容之後。
              <br />因此<span class="text-info">無須重複自動生成的內容</span>。
            </p>
            <p><strong>📝 自動生成的內容包含：</strong></p>
            <ul style="margin: 8px 0; padding-left: 20px; line-height: 1.6;">
              <li>角色基本資料（姓名、背景、性格、說話風格、喜好等）</li>
              <li>目前時間與情境</li>
              <li>使用者資料與關係</li>
              <li>好感度系統規則（含回應格式要求）</li>
              <li>角色記憶（長期與短期）</li>
              <li>結尾指示（避免書信體、強制口語化、動作描述規則等）</li>
            </ul>
          </div>
        </div>

        <div class="form-group">
          <label for="maxOutputTokens">最大輸出 Token 數</label>
          <input id="maxOutputTokens" v-model.number="maxOutputTokens" type="number" min="256" max="8192" step="256"
            placeholder="2048" class="input-field">
          <div class="help-text">
            控制 AI 回應的最大長度。建議值：1024（簡短）、2048（標準）、4096（詳細）
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
  padding: var(--spacing-xl);
}

.header {
  position: sticky;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  top: 0;
  width: 100%;
  padding: var(--spacing-lg);
  border-bottom: 2px solid var(--color-border);
  z-index: var(--z-sticky);
  background: var(--color-bg-secondary);
  margin-bottom: var(--spacing-xl);
}

/* Toggle Switch */
.toggle-switch {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  user-select: none;
}

.toggle-switch input[type="checkbox"] {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  transition: all var(--transition);
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: var(--color-text-white);
  border-radius: var(--radius-full);
  transition: all var(--transition);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-switch input[type="checkbox"]:checked + .toggle-slider {
  background: var(--color-primary);
}

.toggle-switch input[type="checkbox"]:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle-label {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  font-weight: 500;
}

.form-content {
  margin-bottom: var(--spacing-2xl);
}

.form-section {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-2xl);
  margin-bottom: var(--spacing-xl);
  box-shadow: var(--shadow);
}

.form-section h3 {
  font-size: var(--text-2xl);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-lg) 0;
}

.section-desc {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  margin: calc(var(--spacing-sm) * -1) 0 var(--spacing-lg) 0;
}

.avatar-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.avatar-preview {
  width: 100px;
  height: 100px;
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--spacing-md);
  border: 3px solid var(--color-border);
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
  background: var(--color-bg-secondary);
  font-size: 48px;
}

.upload-btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-size: var(--text-base);
  cursor: pointer;
  transition: all var(--transition);
  border: none;
  color: var(--color-text-primary);
}

.upload-btn:hover {
  background: var(--color-bg-hover);
}

.form-group {
  text-align: left;
  margin-bottom: var(--spacing-xl);
}

.form-group label {
  display: block;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}

.input-field,
.textarea-field {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  font-size: var(--text-base);
  font-family: inherit;
  transition: all var(--transition-fast);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.input-field:focus,
.textarea-field:focus {
  outline: none;
  border-color: var(--color-primary);
}

.textarea-field {
  resize: vertical;
}

.radio-group {
  display: flex;
  gap: var(--spacing-lg);
}

.radio-item {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.radio-item input[type="radio"] {
  margin-right: var(--spacing-sm);
  cursor: pointer;
}

.radio-item span {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
}

.char-count {
  text-align: right;
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-xs);
}

.help-text {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-sm);
  font-style: italic;
}

/* 事件列表 */
.event-input-group {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.event-input-group .input-field {
  flex: 1;
}

.btn-add {
  padding: 10px var(--spacing-xl);
  background: var(--color-primary);
  color: var(--color-text-white);
  border: none;
  border-radius: var(--radius);
  font-size: var(--text-base);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
}

.btn-add:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.btn-add:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.event-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
}

.event-text {
  flex: 1;
  font-size: var(--text-base);
  color: var(--color-text-primary);
}

.event-delete {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: var(--color-error);
  color: var(--color-text-white);
  border: none;
  cursor: pointer;
  font-size: var(--text-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
  margin-left: var(--spacing-md);
}

.event-delete:hover {
  background: #d32f2f;
}

.error-message {
  color: var(--color-error);
  font-size: var(--text-base);
  text-align: center;
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-md);
  background: #fff1f0;
  border-radius: var(--radius);
}

.button-group {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
}

.btn-primary,
.btn-secondary {
  padding: var(--spacing-md) var(--spacing-3xl);
  border-radius: var(--radius);
  font-size: var(--text-lg);
  cursor: pointer;
  transition: all var(--transition);
  border: none;
}

.btn-primary {
  background: var(--color-primary);
  color: var(--color-text-white);
}

.btn-primary:hover {
  background: var(--color-primary-dark);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
}

@media (max-width: 768px) {
  .character-form {
    padding: var(--spacing-md);
  }

  .form-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-md);
  }

  .event-input-group {
    flex-direction: column;
  }
}
</style>
