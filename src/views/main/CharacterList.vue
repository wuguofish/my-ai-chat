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
          <div style="margin-top: 0.3rem;"><span class="meta-item">{{ character.profession }}</span></div>
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
  position: relative;
}

.header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  background: var(--color-bg-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xl);
  border-bottom: 2px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.header h2 {
  font-size: var(--text-4xl);
  color: var(--color-text-primary);
  margin: 0;
}

.count-info {
  font-size: var(--text-base);
  color: var(--color-text-tertiary);
}

/* 空狀態 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px var(--spacing-xl);
  text-align: center;
}

.empty-icon {
  font-size: 80px;
  margin-bottom: var(--spacing-xl);
  opacity: 0.5;
}

.empty-state h3 {
  font-size: var(--text-3xl);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-md);
}

.empty-state p {
  font-size: var(--text-lg);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2xl);
}

/* 好友網格 */
.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--spacing-xl);
  padding: var(--spacing-xl);
  max-width: 1200px;
  margin: 0 auto;
}

.character-card {
  position: relative;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: all var(--transition);
  display: flex;
  flex-direction: row;
  align-items: center;
  text-align: left;
}

.character-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}

.character-avatar {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--spacing-lg);
  border: 3px solid var(--color-border);
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
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.meta-item {
  margin: 0.2rem;
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(0, 0, 0, 0.1);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
}

.delete-btn {
  position: absolute;
  top: var(--spacing-md);
  right: var(--spacing-md);
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--color-error);
  color: var(--color-text-white);
  border: none;
  cursor: pointer;
  font-size: var(--text-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all var(--transition);
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
  bottom: 102px;
  right: var(--spacing-3xl);
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-text-white);
  border: none;
  font-size: 30px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transition: all var(--transition);
  z-index: var(--z-dropdown);
  padding: 0;
}

.fab-add:hover {
  background: var(--color-primary-dark);
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
}

/* 主要按鈕 */
.btn-primary {
  padding: var(--spacing-md) var(--spacing-3xl);
  border-radius: var(--radius);
  font-size: var(--text-lg);
  cursor: pointer;
  transition: all var(--transition);
  border: none;
  background: var(--color-primary);
  color: var(--color-text-white);
}

.btn-primary:hover {
  background: var(--color-primary-dark);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* 上限提示 */
.limit-notice {
  position: fixed;
  bottom: var(--spacing-3xl);
  right: var(--spacing-3xl);
  background: var(--color-warning);
  color: var(--color-text-white);
  padding: var(--spacing-md) var(--spacing-2xl);
  border-radius: var(--radius);
  font-size: var(--text-base);
  box-shadow: var(--shadow);
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
