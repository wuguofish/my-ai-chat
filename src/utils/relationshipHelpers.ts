/**
 * 關係系統工具函數
 */

import { RELATIONSHIP_LEVELS } from './constants'
import type { RelationshipLevel, RelationshipLevelInfo } from '@/types'

/**
 * 取得關係等級的中文名稱
 * 根據是否為戀愛關係調整顯示名稱
 */
export function getRelationshipLevelName(level: RelationshipLevel, isRomantic: boolean = false): string {
  const levelInfo = RELATIONSHIP_LEVELS[level]

  // 根據是否為戀愛關係調整顯示名稱
  if (level === 'close_friend') {
    return isRomantic ? '曖昧' : '好友'
  } else if (level === 'soulmate') {
    return isRomantic ? '戀人' : '摯友'
  }

  return levelInfo.name
}

/**
 * 取得關係等級的完整資訊
 */
export function getRelationshipLevelInfo(level: RelationshipLevel, isRomantic: boolean = false): RelationshipLevelInfo {
  const levelInfo = RELATIONSHIP_LEVELS[level]
  const displayName = getRelationshipLevelName(level, isRomantic)

  return {
    ...levelInfo,
    name: displayName
  }
}

/**
 * 根據親密度取得關係等級
 */
export function getRelationshipLevelByAffection(affection: number): RelationshipLevel {
  const levels: RelationshipLevel[] = ['stranger', 'acquaintance', 'friend', 'close_friend', 'soulmate']

  for (const level of levels) {
    const [min, max] = RELATIONSHIP_LEVELS[level].affectionRange
    if (affection >= min && affection < max) {
      return level
    }
  }

  return 'soulmate' // 預設最高等級
}

/**
 * 格式化關係描述
 * 用於 System Prompt 中
 */
export function formatRelationshipDescription(level: RelationshipLevel, affection: number, isRomantic: boolean, note?: string): string {
  const levelName = getRelationshipLevelName(level, isRomantic)
  const parts: string[] = []

  parts.push(`關係等級：${levelName}`)
  parts.push(`親密度：${affection}/100`)

  if (isRomantic) {
    parts.push('關係性質：戀愛關係')
  }

  if (note && note.trim()) {
    parts.push(`備註：${note}`)
  }

  return parts.join('\n')
}
