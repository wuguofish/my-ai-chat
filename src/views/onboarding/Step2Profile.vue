<script setup lang="ts">
import { ref } from 'vue'
import { useUserStore } from '@/stores/user'
import type { UserProfile, Gender } from '@/types'
import { LIMITS } from '@/utils/constants'
import AvatarCropper from '@/components/common/AvatarCropper.vue'

const emit = defineEmits<{
  next: []
  back: []
}>()

const userStore = useUserStore()
const nickname = ref('')
const realName = ref('')
const age = ref('')
const gender = ref<Gender>('unset')
const birthdayMonth = ref('')
const birthdayDay = ref('')
const profession = ref('')
const bio = ref('')
const avatar = ref('')
const error = ref('')

// 裁剪相關
const showCropper = ref(false)
const originalImage = ref('')

const handleNext = () => {
  if (!nickname.value.trim()) {
    error.value = '請輸入暱稱'
    return
  }

  // 取得暫存的 API Key
  const apiKey = sessionStorage.getItem('temp-api-key') || ''

  if (!apiKey) {
    error.value = '找不到 API Key，請重新設定'
    return
  }

  // 組合生日（MM-DD 格式）
  const birthdayValue = birthdayMonth.value && birthdayDay.value
    ? `${birthdayMonth.value}-${birthdayDay.value}`
    : undefined

  // 建立使用者資料
  const userProfile: UserProfile = {
    id: 'user',
    nickname: nickname.value.trim(),
    realName: realName.value.trim() || undefined,
    age: age.value.trim() || undefined,
    gender: gender.value !== 'unset' ? gender.value : undefined,
    birthday: birthdayValue,
    profession: profession.value.trim() || undefined,
    bio: bio.value.trim() || undefined,
    avatar: avatar.value || getDefaultAvatar(nickname.value),
    apiConfig: {
      geminiApiKey: apiKey
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  userStore.setProfile(userProfile)
  sessionStorage.removeItem('temp-api-key')
  error.value = ''
  emit('next')
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

const getDefaultAvatar = (name: string) => {
  // 使用第一個字元生成簡單的頭像
  const initial = name.charAt(0).toUpperCase()
  const canvas = document.createElement('canvas')
  canvas.width = 100
  canvas.height = 100
  const ctx = canvas.getContext('2d')

  if (ctx) {
    // 背景
    ctx.fillStyle = '#667eea'
    ctx.fillRect(0, 0, 100, 100)

    // 文字
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
  <div class="step-content">
    <div class="step-header">
      <h2>步驟 2/3</h2>
      <h3>建立個人資料</h3>
      <p>設定你的個人資料</p>
    </div>

    <div class="form-content">
      <!-- 頭像上傳 -->
      <div class="avatar-upload">
        <div class="avatar-preview">
          <img
            v-if="avatar"
            :src="avatar"
            alt="頭像"
          >
          <div v-else class="avatar-placeholder">
            📷
          </div>
        </div>
        <label for="avatar-input" class="upload-btn">
          上傳頭像
        </label>
        <input
          id="avatar-input"
          type="file"
          accept="image/*"
          style="display: none"
          @change="handleAvatarUpload"
        >
      </div>

      <!-- 暱稱 -->
      <div class="form-group">
        <label for="nickname">暱稱 *</label>
        <input
          id="nickname"
          v-model="nickname"
          type="text"
          placeholder="輸入你的暱稱"
          class="input-field"
          maxlength="20"
        >
      </div>

      <!-- 本名 -->
      <div class="form-group">
        <label for="realName">本名（選填）</label>
        <input
          id="realName"
          v-model="realName"
          type="text"
          placeholder="輸入你的本名"
          class="input-field"
          maxlength="20"
        >
      </div>

      <!-- 性別 -->
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

      <!-- 年齡 -->
      <div class="form-group">
        <label for="age">年齡（選填）</label>
        <input
          id="age"
          v-model="age"
          type="text"
          placeholder="例如：25"
          class="input-field"
          maxlength="3"
        >
      </div>

      <!-- 生日 -->
      <div class="form-group">
        <label for="birthday">生日（選填）</label>
        <div class="birthday-inputs">
          <select
            id="birthday-month"
            v-model="birthdayMonth"
            class="select-field"
          >
            <option value="">月份</option>
            <option v-for="m in 12" :key="m" :value="String(m).padStart(2, '0')">
              {{ m }} 月
            </option>
          </select>
          <select
            id="birthday-day"
            v-model="birthdayDay"
            class="select-field"
          >
            <option value="">日期</option>
            <option v-for="d in 31" :key="d" :value="String(d).padStart(2, '0')">
              {{ d }} 日
            </option>
          </select>
        </div>
      </div>

      <!-- 職業 -->
      <div class="form-group">
        <label for="profession">職業（選填）</label>
        <input
          id="profession"
          v-model="profession"
          type="text"
          placeholder="例如：軟體工程師"
          class="input-field"
          maxlength="30"
        >
      </div>

      <!-- 簡介 -->
      <div class="form-group">
        <label for="bio">簡介（選填）</label>
        <textarea
          id="bio"
          v-model="bio"
          placeholder="簡短介紹一下自己（最多 250 字）"
          class="textarea-field"
          :maxlength="LIMITS.MAX_USER_BIO_LENGTH"
          rows="4"
        />
        <div class="char-count">{{ bio.length }}/{{ LIMITS.MAX_USER_BIO_LENGTH }}</div>
      </div>
    </div>

    <div v-if="error" class="error-message">{{ error }}</div>

    <div class="button-group">
      <button class="btn-secondary" @click="emit('back')">
        上一步
      </button>
      <button class="btn-primary" @click="handleNext">
        下一步
      </button>
    </div>

    <!-- 頭像裁剪器 -->
    <AvatarCropper
      v-if="showCropper"
      :image="originalImage"
      @confirm="handleCropConfirm"
      @cancel="handleCropCancel"
    />
  </div>
</template>

<style scoped>
.step-content {
  padding: 20px 0;
}

.step-header {
  text-align: center;
  margin-bottom: 24px;
}

.step-header h2 {
  font-size: 14px;
  color: #999;
  margin-bottom: 8px;
}

.step-header h3 {
  font-size: 24px;
  color: #333;
  margin-bottom: 8px;
}

.step-header p {
  font-size: 14px;
  color: #666;
}

.form-content {
  max-height: 450px;
  overflow-y: auto;
  padding-right: 8px;
}

/* 捲軸樣式 */
.form-content::-webkit-scrollbar {
  width: 6px;
}

.form-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.form-content::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.form-content::-webkit-scrollbar-thumb:hover {
  background: #999;
}

.avatar-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
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
  resize: none;
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

.birthday-inputs {
  display: flex;
  gap: 12px;
}

.select-field {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.3s;
}

.select-field:focus {
  outline: none;
  border-color: #667eea;
}

.char-count {
  text-align: right;
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.error-message {
  color: #ff4d4f;
  font-size: 13px;
  text-align: center;
  margin-top: 16px;
  margin-bottom: 16px;
}

.button-group {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
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
</style>
