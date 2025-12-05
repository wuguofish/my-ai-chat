<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { useRouter } from 'vue-router'
import { CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-vue-next'

const { toasts, removeToast } = useToast()
const router = useRouter()

const handleToastClick = (toast: typeof toasts.value[0]) => {
  if (toast.characterId) {
    // 點擊角色上線通知，跳轉到該角色的聊天室
    router.push(`/chat/${toast.characterId}`)
    removeToast(toast.id)
  }
}

const getIcon = (type: string) => {
  switch (type) {
    case 'success':
      return CheckCircle
    case 'error':
      return XCircle
    case 'warning':
      return AlertTriangle
    default:
      return Info
  }
}
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', `toast-${toast.type}`, { 'toast-clickable': toast.characterId }]"
        @click="handleToastClick(toast)"
      >
        <!-- 角色上線通知樣式 -->
        <template v-if="toast.characterId">
          <div class="toast-character">
            <img
              v-if="toast.characterAvatar"
              :src="toast.characterAvatar"
              :alt="toast.characterName"
              class="toast-avatar"
            />
            <div class="toast-avatar-placeholder" v-else>
              {{ toast.characterName?.[0] || '?' }}
            </div>
            <div class="toast-content">
              <p class="toast-message">{{ toast.message }}</p>
              <p class="toast-hint">點擊開始聊天</p>
            </div>
          </div>
        </template>

        <!-- 一般通知樣式 -->
        <template v-else>
          <component :is="getIcon(toast.type)" class="toast-icon" :size="20" />
          <p class="toast-message">{{ toast.message }}</p>
        </template>

        <button class="toast-close" @click.stop="removeToast(toast.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: var(--z-toast, 1200);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  background: white;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  min-width: 300px;
  max-width: 400px;
  pointer-events: auto;
  border-left: 4px solid;
  transition: all var(--transition);
}

.toast-clickable {
  cursor: pointer;
}

.toast-clickable:hover {
  transform: translateX(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Toast 類型顏色 */
.toast-success {
  border-left-color: var(--color-success);
}

.toast-error {
  border-left-color: var(--color-danger);
}

.toast-warning {
  border-left-color: var(--color-warning);
}

.toast-info {
  border-left-color: var(--color-primary);
}

/* 圖示 */
.toast-icon {
  flex-shrink: 0;
}

.toast-success .toast-icon {
  color: var(--color-success);
}

.toast-error .toast-icon {
  color: var(--color-danger);
}

.toast-warning .toast-icon {
  color: var(--color-warning);
}

.toast-info .toast-icon {
  color: var(--color-primary);
}

/* 訊息 */
.toast-message {
  flex: 1;
  margin: 0;
  font-size: var(--text-base);
  color: var(--color-text-primary);
  line-height: 1.5;
}

/* 關閉按鈕 */
.toast-close {
  flex-shrink: 0;
  background: none;
  border: none;
  font-size: 24px;
  color: var(--color-text-tertiary);
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition);
}

.toast-close:hover {
  color: var(--color-text-primary);
}

/* 角色上線通知專用樣式 */
.toast-character {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 1;
}

.toast-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  object-fit: cover;
  flex-shrink: 0;
}

.toast-avatar-placeholder {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  flex-shrink: 0;
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-hint {
  margin: var(--spacing-xs) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
}

/* 動畫 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

/* 手機版適配 */
@media (max-width: 768px) {
  .toast-container {
    top: 10px;
    right: 10px;
    left: 10px;
  }

  .toast {
    min-width: auto;
    max-width: none;
  }
}
</style>
