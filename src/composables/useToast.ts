/**
 * 全域 Toast 通知系統
 */

import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'feed_like' | 'feed_comment' | 'feed_mention'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
  characterId?: string  // 如果是角色相關通知，記錄角色 ID（可點擊跳轉）
  characterName?: string
  characterAvatar?: string
  postId?: string       // 動態牆相關通知的動態 ID
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
      postId?: string
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

  /**
   * 動態牆按讚通知
   */
  const feedLike = (
    characterId: string,
    characterName: string,
    characterAvatar?: string,
    postId?: string,
    duration: number = 4000
  ) => {
    return showToast(
      `${characterName} 對你的動態按讚`,
      'feed_like',
      duration,
      { characterId, characterName, characterAvatar, postId }
    )
  }

  /**
   * 動態牆留言通知
   */
  const feedComment = (
    characterId: string,
    characterName: string,
    commentPreview: string,
    characterAvatar?: string,
    postId?: string,
    duration: number = 5000
  ) => {
    const preview = commentPreview.length > 20 ? commentPreview.slice(0, 20) + '...' : commentPreview
    return showToast(
      `${characterName} 留言：${preview}`,
      'feed_comment',
      duration,
      { characterId, characterName, characterAvatar, postId }
    )
  }

  /**
   * 動態牆 @ 提及通知
   */
  const feedMention = (
    characterId: string,
    characterName: string,
    contentPreview: string,
    characterAvatar?: string,
    postId?: string,
    duration: number = 5000
  ) => {
    const preview = contentPreview.length > 20 ? contentPreview.slice(0, 20) + '...' : contentPreview
    return showToast(
      `${characterName} 在動態中提到了你：${preview}`,
      'feed_mention',
      duration,
      { characterId, characterName, characterAvatar, postId }
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
    characterOnline,
    feedLike,
    feedComment,
    feedMention
  }
}
