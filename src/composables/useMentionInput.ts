/**
 * useMentionInput - 共用的 @ mention 輸入框邏輯
 * 用於 ChatRoom 和 Feed 的輸入框
 */

import { ref, computed, nextTick, type Ref, type ComputedRef } from 'vue'

export interface MentionOption {
  id: string       // 插入到輸入框的 ID，例如 '@all' 或 '@角色名'
  name: string     // 顯示名稱
  type: 'all' | 'user' | 'character'
  avatar?: string  // 頭像 URL（角色用）
}

export interface UseMentionInputOptions {
  /** 輸入框的 ref */
  inputRef: Ref<HTMLTextAreaElement | HTMLInputElement | null>
  /** 輸入框的 v-model 值 */
  inputValue: Ref<string>
  /** 可選擇的 mention 對象列表 */
  mentionOptions: ComputedRef<MentionOption[]> | Ref<MentionOption[]>
  /** 是否啟用 mention 功能（可選，預設 true） */
  enabled?: Ref<boolean> | ComputedRef<boolean>
}

export interface UseMentionInputReturn {
  /** 是否顯示 mention 選單 */
  showMentionMenu: Ref<boolean>
  /** 選單位置 */
  mentionMenuPosition: Ref<{ top: number; left: number }>
  /** 處理輸入變化（偵測 @ 符號） */
  handleInputChange: () => void
  /** 選擇 mention 對象 */
  selectMention: (option: MentionOption) => void
  /** 處理 Escape 鍵關閉選單 */
  handleMentionKeydown: (event: KeyboardEvent) => boolean
  /** 關閉選單 */
  closeMentionMenu: () => void
}

export function useMentionInput(options: UseMentionInputOptions): UseMentionInputReturn {
  const { inputRef, inputValue, mentionOptions, enabled } = options

  // 狀態
  const showMentionMenu = ref(false)
  const mentionMenuPosition = ref({ top: 0, left: 0 })
  const mentionCursorPosition = ref(0) // 記錄 @ 符號的位置

  // 檢查是否啟用
  const isEnabled = computed(() => {
    if (!enabled) return true
    return enabled.value
  })

  /**
   * 處理輸入變化，偵測 @ 符號
   */
  const handleInputChange = () => {
    if (!isEnabled.value) return

    const input = inputRef.value
    if (!input) return

    const cursorPos = input.selectionStart || 0
    const textBeforeCursor = inputValue.value.substring(0, cursorPos)

    // 檢查游標前最後一個字元是否為 @
    if (textBeforeCursor.endsWith('@')) {
      // 確保有可選擇的對象
      if (mentionOptions.value.length === 0) return

      // 顯示選單
      showMentionMenu.value = true
      mentionCursorPosition.value = cursorPos

      // 計算選單位置（在輸入框上方）
      const rect = input.getBoundingClientRect()
      mentionMenuPosition.value = {
        left: rect.left + 20,
        top: rect.top - 10
      }
    } else {
      // 隱藏選單
      showMentionMenu.value = false
    }
  }

  /**
   * 選擇 mention 對象
   */
  const selectMention = (option: MentionOption) => {
    const input = inputRef.value
    if (!input) return

    const cursorPos = mentionCursorPosition.value
    const beforeAt = inputValue.value.substring(0, cursorPos - 1) // 移除 @
    const afterCursor = inputValue.value.substring(cursorPos)

    // 插入選擇的 ID（如 @all 或 @角色名）
    inputValue.value = beforeAt + option.id + ' ' + afterCursor

    // 設定游標位置到插入文字後
    nextTick(() => {
      const newCursorPos = (beforeAt + option.id + ' ').length
      input.setSelectionRange(newCursorPos, newCursorPos)
      input.focus()
    })

    // 隱藏選單
    showMentionMenu.value = false
  }

  /**
   * 處理 Escape 鍵關閉選單
   * @returns 是否已處理事件（true = 已處理，呼叫端應 preventDefault）
   */
  const handleMentionKeydown = (event: KeyboardEvent): boolean => {
    if (showMentionMenu.value && event.key === 'Escape') {
      showMentionMenu.value = false
      return true
    }
    return false
  }

  /**
   * 關閉選單
   */
  const closeMentionMenu = () => {
    showMentionMenu.value = false
  }

  return {
    showMentionMenu,
    mentionMenuPosition,
    handleInputChange,
    selectMention,
    handleMentionKeydown,
    closeMentionMenu
  }
}
