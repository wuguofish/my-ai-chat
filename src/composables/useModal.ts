/**
 * 全域 Modal 對話框系統
 * 用於取代原生的 alert() 和 confirm()
 */

import { ref } from 'vue'

export interface ModalOptions {
  title?: string
  message: string
  type?: 'info' | 'success' | 'warning' | 'danger'
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
}

interface ModalState {
  isOpen: boolean
  options: ModalOptions
  resolve: ((value: boolean) => void) | null
}

const modalState = ref<ModalState>({
  isOpen: false,
  options: {
    message: ''
  },
  resolve: null
})

export function useModal() {
  /**
   * 顯示確認對話框（有確認和取消按鈕）
   * @returns Promise<boolean> - 使用者點擊確認返回 true，取消返回 false
   */
  const confirm = (
    message: string,
    options?: Partial<Omit<ModalOptions, 'message' | 'showCancel'>>
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      modalState.value = {
        isOpen: true,
        options: {
          message,
          title: options?.title || '確認',
          type: options?.type || 'info',
          confirmText: options?.confirmText || '確定',
          cancelText: options?.cancelText || '取消',
          showCancel: true
        },
        resolve
      }
    })
  }

  /**
   * 顯示警告/危險確認對話框
   */
  const confirmDanger = (
    message: string,
    options?: Partial<Omit<ModalOptions, 'message' | 'showCancel' | 'type'>>
  ): Promise<boolean> => {
    return confirm(message, {
      ...options,
      type: 'danger',
      title: options?.title || '警告',
      confirmText: options?.confirmText || '確定刪除'
    })
  }

  /**
   * 顯示提示對話框（只有確認按鈕）
   * @returns Promise<boolean> - 使用者點擊確認後返回 true
   */
  const alert = (
    message: string,
    options?: Partial<Omit<ModalOptions, 'message' | 'showCancel'>>
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      modalState.value = {
        isOpen: true,
        options: {
          message,
          title: options?.title || '提示',
          type: options?.type || 'info',
          confirmText: options?.confirmText || '確定',
          showCancel: false
        },
        resolve
      }
    })
  }

  /**
   * 關閉 Modal 並回傳結果
   */
  const closeModal = (result: boolean) => {
    if (modalState.value.resolve) {
      modalState.value.resolve(result)
    }
    modalState.value = {
      isOpen: false,
      options: { message: '' },
      resolve: null
    }
  }

  return {
    modalState,
    confirm,
    confirmDanger,
    alert,
    closeModal
  }
}
