<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCharacterStore } from '@/stores/characters'
import type { Character } from '@/types'

const router = useRouter()
const route = useRoute()
const characterStore = useCharacterStore()

const characterId = computed(() => route.params.id as string)
const character = ref<Character | null>(null)

onMounted(() => {
  const found = characterStore.getCharacterById(characterId.value)
  if (found) {
    character.value = found
  } else {
    router.push('/main/characters')
  }
})

const handleEdit = () => {
  router.push(`/main/characters/${characterId.value}/edit`)
}

const handleDelete = () => {
  if (character.value && confirm(`確定要刪除好友「${character.value.name}」嗎？`)) {
    characterStore.deleteCharacter(characterId.value)
    router.push('/main/characters')
  }
}

const handleStartChat = () => {
  // TODO: 實作開始聊天功能
  console.log('開始聊天')
}

const handleBack = () => {
  router.back()
}

const getGenderText = (gender?: string) => {
  switch (gender) {
    case 'male': return '男'
    case 'female': return '女'
    default: return '未設定'
  }
}

const getDefaultAvatar = (name: string) => {
  const initial = name.charAt(0).toUpperCase()
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 200
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.fillStyle = '#667eea'
    ctx.fillRect(0, 0, 200, 200)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 96px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initial, 100, 100)
  }

  return canvas.toDataURL()
}
</script>

<template>
  <div v-if="character" class="character-detail">
    <div class="header">
      <button class="back-btn" @click="handleBack">
        ← 返回
      </button>
      <div class="header-actions">
        <button class="btn-secondary" @click="handleEdit">
          編輯
        </button>
        <button class="btn-danger" @click="handleDelete">
          刪除
        </button>
      </div>
    </div>

    <div class="character-card">
      <!-- 頭像和基本資訊 -->
      <div class="profile-section">
        <div class="avatar">
          <img
            :src="character.avatar || getDefaultAvatar(character.name)"
            :alt="character.name"
          >
        </div>
        <div class="basic-info">
          <h1 class="name">{{ character.name }}</h1>
          <div class="meta">
            <span v-if="character.gender" class="meta-item">
              {{ getGenderText(character.gender) }}
            </span>
            <span v-if="character.age" class="meta-item">
              {{ character.age }}
            </span>
          </div>
          <button class="btn-primary btn-chat" @click="handleStartChat">
            💬 開始聊天
          </button>
        </div>
      </div>

      <!-- 詳細資訊 -->
      <div class="detail-sections">
        <!-- 性格 -->
        <div v-if="character.personality" class="detail-section">
          <h3>性格</h3>
          <p>{{ character.personality }}</p>
        </div>

        <!-- 說話風格 -->
        <div v-if="character.speakingStyle" class="detail-section">
          <h3>說話風格</h3>
          <p>{{ character.speakingStyle }}</p>
        </div>

        <!-- 背景故事 -->
        <div v-if="character.background" class="detail-section">
          <h3>背景故事</h3>
          <p>{{ character.background }}</p>
        </div>

        <!-- 喜好 -->
        <div v-if="character.likes || character.dislikes" class="detail-section">
          <h3>喜好</h3>
          <div class="preferences">
            <div v-if="character.likes" class="preference-item">
              <span class="preference-label">喜歡</span>
              <span class="preference-value">{{ character.likes }}</span>
            </div>
            <div v-if="character.dislikes" class="preference-item">
              <span class="preference-label">討厭</span>
              <span class="preference-value">{{ character.dislikes }}</span>
            </div>
          </div>
        </div>

        <!-- 重要事件 -->
        <div v-if="character.events.length > 0" class="detail-section">
          <h3>重要事件</h3>
          <ul class="event-list">
            <li v-for="(event, index) in character.events" :key="index" class="event-item">
              {{ event }}
            </li>
          </ul>
        </div>

        <!-- 系統提示詞（如果有自訂） -->
        <div v-if="character.systemPrompt" class="detail-section">
          <h3>自訂系統提示詞</h3>
          <div class="system-prompt">
            {{ character.systemPrompt }}
          </div>
        </div>

        <!-- 建立和更新時間 -->
        <div class="detail-section meta-info">
          <div class="meta-row">
            <span class="meta-label">建立時間</span>
            <span class="meta-value">{{ new Date(character.createdAt).toLocaleString('zh-TW') }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">更新時間</span>
            <span class="meta-value">{{ new Date(character.updatedAt).toLocaleString('zh-TW') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-detail {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.back-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.back-btn:hover {
  background: #e0e0e0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.character-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.profile-section {
  display: flex;
  align-items: center;
  padding: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  border: 4px solid white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.basic-info {
  flex: 1;
  margin-left: 32px;
  text-align: left;
}

.name {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 12px 0;
}

.meta {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.meta-item {
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  font-size: 14px;
}

.btn-chat {
  margin-top: 12px;
}

.detail-sections {
  text-align: left;
  padding: 32px;
}

.detail-section {
  margin-bottom: 28px;
  padding-bottom: 28px;
  border-bottom: 1px solid #e0e0e0;
}

.detail-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.detail-section h3 {
  font-size: 18px;
  color: #333;
  margin: 0 0 12px 0;
}

.detail-section p {
  font-size: 15px;
  color: #666;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

.preferences {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preference-item {
  display: flex;
  align-items: flex-start;
}

.preference-label {
  min-width: 60px;
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.preference-value {
  flex: 1;
  color: #666;
  font-size: 14px;
}

.event-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.event-item {
  padding: 12px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  color: #333;
}

.event-item:last-child {
  margin-bottom: 0;
}

.system-prompt {
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #333;
  white-space: pre-wrap;
  line-height: 1.5;
}

.meta-info {
  background: #f9f9f9;
  padding: 16px;
  border-radius: 8px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.meta-label {
  font-size: 14px;
  color: #666;
}

.meta-value {
  font-size: 14px;
  color: #333;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  border: none;
}

.btn-primary {
  background: white;
  color: #667eea;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 255, 255, 0.3);
}

.btn-secondary {
  background: #f0f0f0;
  color: #666;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

.btn-danger {
  background: #ff4d4f;
  color: white;
}

.btn-danger:hover {
  background: #d32f2f;
}

@media (max-width: 768px) {
  .character-detail {
    padding: 12px;
  }

  .profile-section {
    flex-direction: column;
    text-align: center;
    padding: 24px;
  }

  .basic-info {
    margin-left: 0;
    margin-top: 20px;
  }

  .detail-sections {
    padding: 20px;
  }

  .preference-item {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
