/**
 * 角色狀態相關的共用 composable
 * 提供狀態判斷、狀態文字、狀態樣式類別等功能
 */

import { computed, type ComputedRef, type Ref } from 'vue'
import type { Character, CharacterStatus } from '@/types'
import { getCharacterStatus } from '@/utils/chatHelpers'

/**
 * 狀態文字對應
 */
export const STATUS_TEXT: Record<CharacterStatus, string> = {
  online: '在線',
  away: '忙碌中',
  offline: '離線'
}

/**
 * 狀態顏色 CSS 類別對應（用於文字顏色）
 */
export const STATUS_TEXT_CLASS: Record<CharacterStatus, string> = {
  online: 'text-status-online',
  away: 'text-status-away',
  offline: 'text-status-offline'
}

/**
 * 取得狀態文字
 */
export function getStatusText(status: CharacterStatus): string {
  return STATUS_TEXT[status]
}

/**
 * 取得狀態文字顏色類別
 */
export function getStatusTextClass(status: CharacterStatus): string {
  return STATUS_TEXT_CLASS[status]
}

/**
 * 單一角色的狀態 composable
 * @param character 角色 ref（可為 null）
 */
export function useCharacterStatus(character: Ref<Character | null | undefined>) {
  // 當前狀態
  const status: ComputedRef<CharacterStatus> = computed(() => {
    if (!character.value) return 'offline'
    return getCharacterStatus(character.value)
  })

  // 狀態文字
  const statusText = computed(() => getStatusText(status.value))

  // 狀態文字顏色類別
  const statusTextClass = computed(() => getStatusTextClass(status.value))

  // 狀態指示燈類別（用於 .status-dot 或 .status-indicator）
  const statusDotClass = computed(() => status.value)

  return {
    status,
    statusText,
    statusTextClass,
    statusDotClass
  }
}

/**
 * 取得角色狀態的工具函數（非 reactive 版本）
 * 適用於 v-for 迴圈中或需要傳入角色物件的場景
 */
export function getCharacterStatusInfo(character: Character) {
  const status = getCharacterStatus(character)
  return {
    status,
    statusText: getStatusText(status),
    statusTextClass: getStatusTextClass(status)
  }
}
