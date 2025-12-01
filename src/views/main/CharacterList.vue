<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCharacterStore } from '@/stores/characters'
import type { Character } from '@/types'

const router = useRouter()
const characterStore = useCharacterStore()

const characters = computed(() => characterStore.characters)
const characterCount = computed(() => characters.value.length)
const canAddMore = computed(() => characterCount.value < 15)

const handleAddCharacter = () => {
  router.push('/main/characters/new')
}

const handleViewCharacter = (character: Character) => {
  router.push(`/main/characters/${character.id}`)
}

const handleDeleteCharacter = (character: Character) => {
  if (confirm(`確定要刪除好友「${character.name}」嗎？`)) {
    characterStore.deleteCharacter(character.id)
  }
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
  const colors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a']
  const colorIndex = name.length % colors.length
  const color = colors[colorIndex]

  const canvas = document.createElement('canvas')
  canvas.width = 80
  canvas.height = 80
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.fillRect(0, 0, 80, 80)
    ctx.fillStyle = color || '#ffffff'
    ctx.font = 'bold 36px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initial, 40, 40)
  }

  return canvas.toDataURL()
}
</script>

<template>
  <div class="character-list">
    <div class="header">
      <h2>好友</h2>
      <div class="count-info">{{ characterCount }}/15 位好友</div>
    </div>

    <!-- 空狀態 -->
    <div v-if="characterCount === 0" class="empty-state">
      <div class="empty-icon">👥</div>
      <h3>還沒有 AI 好友</h3>
      <p>建立你的第一個 AI 好友，開始有趣的對話吧！</p>
      <button class="btn-primary" @click="handleAddCharacter">
        新增好友
      </button>
    </div>

    <!-- 好友列表 -->
    <div v-else class="character-grid">
      <div v-for="character in characters" :key="character.id" class="character-card"
        @click="handleViewCharacter(character)">
        <div class="character-avatar">
          <img :src="character.avatar || getDefaultAvatar(character.name)" :alt="character.name">
        </div>
        <div class="character-info">
          <h3 class="character-name">{{ character.name }}</h3>
          <span class="meta-item">{{ getGenderText(character.gender) }}</span>
          <span class="meta-item">{{ character.age }}歲</span>
        </div>
      </div>
    </div>

    <!-- 新增按鈕（當已有好友時） -->
    <button v-if="characterCount > 0 && canAddMore" class="fab-add" @click="handleAddCharacter">
      ＋
    </button>

    <!-- 已達上限提示 -->
    <div v-if="!canAddMore" class="limit-notice">
      已達好友數量上限（15位）
    </div>
  </div>
</template>

<style scoped>
.character-list {
/*  min-height: 100vh;*/
  position: relative;
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 2px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header h2 {
  font-size: 28px;
  color: #333;
  margin: 0;
}

.count-info {
  font-size: 14px;
  color: #999;
}

/* 空狀態 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 80px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 24px;
  color: #333;
  margin-bottom: 12px;
}

.empty-state p {
  font-size: 16px;
  color: #666;
  margin-bottom: 24px;
}

/* 好友網格 */
.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.character-card {
  position: relative;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  flex-direction: row;
  align-items:center;
  text-align: left;
}

.character-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.character-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 16px;
  border: 3px solid #e0e0e0;
  
}

.character-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-info {
  flex: 1;
  width: 100%;
  padding-left: 2rem;
  padding-bottom: 1rem;
}

.character-name {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin: 0 0 8px 0;
}

.meta-item {
  margin: 0.2rem;
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  font-size: 14px;
}

.delete-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #ff4d4f;
  color: white;
  border: none;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.3s;
}

.character-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #d32f2f;
  transform: scale(1.1);
}

/* 浮動新增按鈕 */
.fab-add {
  position: fixed;
  bottom: 92px;
  right: 32px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #667eea;
  color: white;
  border: none;
  font-size: 30px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transition: all 0.3s;
  z-index: 100;
  padding: 0rem;
}

.fab-add:hover {
  background: #5568d3;
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
}

/* 主要按鈕 */
.btn-primary {
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
  border: none;
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* 上限提示 */
.limit-notice {
  position: fixed;
  bottom: 32px;
  right: 32px;
  background: #ff9800;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

@media (max-width: 768px) {
  .character-grid {
    grid-template-columns: 1fr;
  }

  .fab-add {
    right: 20px;
    width: 56px;
    height: 56px;
    font-size: 30px;
  }
}
</style>
