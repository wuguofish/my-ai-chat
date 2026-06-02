<script setup lang="ts">
import { useModal } from '@/composables/useModal'
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-vue-next'
import { computed, watch } from 'vue'

const { modalState, closeModal } = useModal()

// 根據類型取得對應圖示
const IconComponent = computed(() => {
  switch (modalState.value.options.type) {
    case 'success':
      return CheckCircle
    case 'warning':
      return AlertTriangle
    case 'danger':
      return XCircle
    default:
      return Info
  }
})

// ESC 關閉 Modal（視為取消）
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && modalState.value.isOpen) {
    closeModal(false)
  }
}

// 監聽 Modal 開關狀態，綁定/解綁鍵盤事件
watch(() => modalState.value.isOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleKeydown)
  } else {
    document.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modalState.isOpen" class="modal-overlay" @click.self="closeModal(false)">
        <div class="modal-container" :class="`modal-${modalState.options.type}`">
          <!-- Header -->
          <div class="modal-header">
            <h3 class="modal-title">{{ modalState.options.title }}</h3>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <component :is="IconComponent" class="modal-icon" :size="48" />
            <p class="modal-message">{{ modalState.options.message }}</p>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <button v-if="modalState.options.showCancel" class="btn-secondary" @click="closeModal(false)">
              {{ modalState.options.cancelText }}
            </button>
            <button class="btn-primary"
              @click="closeModal(true)">
              {{ modalState.options.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 1300);
  padding: var(--spacing-lg);
}

.modal-container {
  background: white;
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 400px;
  overflow: hidden;
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  border-bottom: 1px solid var(--color-border);
  justify-content: center;
}

.modal-icon {
  flex-shrink: 0;
}

.modal-info .modal-icon {
  color: var(--color-primary);
}

.modal-success .modal-icon {
  color: var(--color-success);
}

.modal-warning .modal-icon {
  color: var(--color-warning);
}

.modal-danger .modal-icon {
  color: var(--color-danger);
}

.modal-title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Body */
.modal-body {
  padding: var(--spacing-xl);
  align-items: center;
  text-align: center;
}

.modal-message {
  margin: 0;
  font-size: var(--text-xl);
  color: var(--color-text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg) var(--spacing-xl);
  background: var(--color-bg-secondary);
}

/* 動畫 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}

/* 手機版適配 */
@media (max-width: 768px) {
  .modal-overlay {
    padding: var(--spacing-md);
    align-items: flex-end;
  }

  .modal-container {
    max-width: none;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .modal-footer button {
    width: 100%;
  }
}
</style>
