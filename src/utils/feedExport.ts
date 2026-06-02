/**
 * 動態牆匯出/匯入工具
 * 支援 JSON 和 Markdown 格式
 */

import type { Post, FeedNotification } from '@/types'

// ==========================================
// 匯出資料型別
// ==========================================

export interface FeedExportData {
  version: string
  exportedAt: string
  posts: Post[]
  notifications?: FeedNotification[]
}

// ==========================================
// 匯出功能
// ==========================================

/**
 * 匯出動態為 JSON 格式
 */
export function exportFeedAsJson(
  posts: Post[],
  notifications?: FeedNotification[],
  includeNotifications: boolean = false
): string {
  const exportData: FeedExportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    posts: posts
  }

  if (includeNotifications && notifications) {
    exportData.notifications = notifications
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * 匯出動態為 Markdown 格式
 */
export function exportFeedAsMarkdown(posts: Post[]): string {
  const lines: string[] = []

  // 標題
  lines.push('# 動態牆備份')
  lines.push('')
  lines.push(`匯出時間：${formatDateTime(Date.now())}`)
  lines.push(`共 ${posts.length} 則動態`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // 按時間排序（最新在前）
  const sortedPosts = [...posts].sort((a, b) => b.timestamp - a.timestamp)

  for (const post of sortedPosts) {
    // 動態標題
    lines.push(`## ${post.authorName}`)
    lines.push('')
    lines.push(`📅 ${formatDateTime(post.timestamp)}`)
    if (post.triggerEvent) {
      lines.push(`🏷️ 觸發事件：${getTriggerEventName(post.triggerEvent)}`)
    }
    lines.push('')

    // 動態內容
    lines.push(post.content)
    lines.push('')

    // 互動統計
    const likeCount = post.likes.length
    const commentCount = post.comments.length
    if (likeCount > 0 || commentCount > 0) {
      lines.push(`❤️ ${likeCount} 個讚 · 💬 ${commentCount} 則留言`)
      lines.push('')
    }

    // 按讚列表
    if (post.likes.length > 0) {
      lines.push('### 按讚')
      lines.push('')
      for (const like of post.likes) {
        const likerName = like.oderId === 'user' ? '我' : like.oderId
        lines.push(`- ${likerName} (${formatDateTime(like.timestamp)})`)
      }
      lines.push('')
    }

    // 留言列表
    if (post.comments.length > 0) {
      lines.push('### 留言')
      lines.push('')
      for (const comment of post.comments) {
        const authorName = comment.authorId === 'user' ? '我' : comment.authorName
        lines.push(`**${authorName}** (${formatDateTime(comment.timestamp)})`)
        if (comment.replyTo) {
          lines.push(`> 回覆 ${comment.replyTo}`)
        }
        lines.push('')
        lines.push(comment.content)
        lines.push('')
      }
    }

    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 下載匯出檔案
 */
export function downloadExportFile(
  content: string,
  filename: string,
  mimeType: string = 'application/json'
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * 匯出動態並下載 JSON 檔案
 */
export function downloadFeedAsJson(
  posts: Post[],
  notifications?: FeedNotification[],
  includeNotifications: boolean = false
): void {
  const json = exportFeedAsJson(posts, notifications, includeNotifications)
  const date = formatDateForFilename(Date.now())
  downloadExportFile(json, `動態牆備份_${date}.json`, 'application/json')
}

/**
 * 匯出動態並下載 Markdown 檔案
 */
export function downloadFeedAsMarkdown(posts: Post[]): void {
  const markdown = exportFeedAsMarkdown(posts)
  const date = formatDateForFilename(Date.now())
  downloadExportFile(markdown, `動態牆備份_${date}.md`, 'text/markdown')
}

// ==========================================
// 匯入功能
// ==========================================

/**
 * 解析 JSON 匯入檔案
 */
export function parseFeedImportJson(jsonString: string): FeedExportData | null {
  try {
    const data = JSON.parse(jsonString)

    // 驗證基本結構
    if (!data.posts || !Array.isArray(data.posts)) {
      console.error('匯入失敗：缺少 posts 陣列')
      return null
    }

    // 驗證每則動態的必要欄位
    for (const post of data.posts) {
      if (!post.id || !post.authorId || !post.content || !post.timestamp) {
        console.error('匯入失敗：動態缺少必要欄位', post)
        return null
      }

      // 確保 likes 和 comments 存在
      if (!Array.isArray(post.likes)) {
        post.likes = []
      }
      if (!Array.isArray(post.comments)) {
        post.comments = []
      }
    }

    return {
      version: data.version || '1.0',
      exportedAt: data.exportedAt || new Date().toISOString(),
      posts: data.posts,
      notifications: data.notifications
    }
  } catch (error) {
    console.error('JSON 解析失敗:', error)
    return null
  }
}

/**
 * 從檔案讀取並解析
 */
export function readImportFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('檔案讀取失敗'))
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, 'utf-8')
  })
}

// ==========================================
// 輔助函數
// ==========================================

/**
 * 格式化日期時間
 */
function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 格式化日期供檔名使用
 */
function formatDateForFilename(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * 取得觸發事件的中文名稱
 */
function getTriggerEventName(event: string): string {
  const eventNames: Record<string, string> = {
    'mood_change': '情緒改變',
    'relationship_change': '關係變化',
    'new_memory': '新的記憶',
    'come_online': '上線',
    'birthday': '生日',
    'holiday': '節日',
    'daily_catchup': '每日動態',
    'user_post': '使用者發文'
  }
  return eventNames[event] || event
}
