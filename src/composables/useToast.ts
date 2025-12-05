/**
 * 全域 Toast 通知系統
 */

import { ref } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration: number
  characterId?: string  // 如果是角色上線通知，記錄角色 ID（可點擊跳轉）
  characterName?: string
  characterAvatar?: string
}

const toasts = ref<Toast[]>([])
let toastId = 0

export function useToast() {
  /**
   * 顯示 Toast 通知
   */
  const showToast = (
    message: string,
    type: Toast['type'] = 'info',
    duration: number = 3000,
    options?: {
      characterId?: string
      characterName?: string
      characterAvatar?: string
    }
  ) => {
    const id = `toast-${++toastId}`
    const toast: Toast = {
      id,
      message,
      type,
      duration,
      ...options
    }

    toasts.value.push(toast)

    // 自動移除
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }

  /**
   * 移除指定 Toast
   */
  const removeToast = (id: string) => {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  /**
   * 清除所有 Toast
   */
  const clearAllToasts = () => {
    toasts.value = []
  }

  /**
   * 便捷方法
   */
  const success = (message: string, duration?: number) => {
    return showToast(message, 'success', duration)
  }

  const error = (message: string, duration?: number) => {
    return showToast(message, 'error', duration)
  }

  const info = (message: string, duration?: number) => {
    return showToast(message, 'info', duration)
  }

  const warning = (message: string, duration?: number) => {
    return showToast(message, 'warning', duration)
  }

  /**
   * 角色上線通知（特殊類型）
   */
  const characterOnline = (
    characterId: string,
    characterName: string,
    characterAvatar?: string,
    duration: number = 5000
  ) => {
    return showToast(
      `${characterName} 已上線`,
      'info',
      duration,
      { characterId, characterName, characterAvatar }
    )
  }

  return {
    toasts,
    showToast,
    removeToast,
    clearAllToasts,
    success,
    error,
    info,
    warning,
    characterOnline
  }
}
