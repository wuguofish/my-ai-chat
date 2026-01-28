/**
 * 動態牆 Store
 * 管理動態、按讚、留言和通知
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Post, PostComment, FeedNotification, PostTriggerEvent } from '@/types'
import { LIMITS, FEED_EVENT_COOLDOWN } from '@/utils/constants'
import { obfuscatedSerializer } from '@/utils/dataObfuscation'

export const useFeedStore = defineStore('feed', () => {
  // ==========================================
  // State
  // ==========================================

  /** 所有動態（最多 120 則） */
  const posts = ref<Post[]>([])

  /** 通知列表（最多 50 則） */
  const notifications = ref<FeedNotification[]>([])

  /** 上次每日補發的日期 (YYYY-MM-DD) */
  const lastDailyCatchup = ref<string | null>(null)

  /** 角色最後瀏覽動態牆的時間戳 */
  const characterLastFeedCheck = ref<Record<string, number>>({})

  /** 各事件類型的最後觸發時間（用於冷卻判斷） */
  const lastEventTrigger = ref<Record<string, Record<PostTriggerEvent, number>>>({})

  // ==========================================
  // Getters
  // ==========================================

  /** 按時間排序的動態（最新在前） */
  const sortedPosts = computed(() => {
    return [...posts.value].sort((a, b) => b.timestamp - a.timestamp)
  })

  /** 未讀通知 */
  const unreadNotifications = computed(() => {
    return notifications.value.filter(n => !n.read)
  })

  /** 未讀通知數量 */
  const unreadCount = computed(() => unreadNotifications.value.length)

  /** 根據 ID 取得動態 */
  const getPostById = (postId: string) => {
    return posts.value.find(p => p.id === postId)
  }

  /** 取得角色最後瀏覽時間 */
  const getCharacterLastCheck = (characterId: string) => {
    return characterLastFeedCheck.value[characterId] || 0
  }

  /** 取得角色在特定時間之後的未讀動態 */
  const getUnreadPostsForCharacter = (characterId: string) => {
    const lastCheck = getCharacterLastCheck(characterId)
    return posts.value.filter(p => p.timestamp > lastCheck)
  }

  // ==========================================
  // Actions
  // ==========================================

  /**
   * 新增動態
   */
  function addPost(post: Omit<Post, 'id' | 'likes' | 'comments'> & { id?: string }) {
    const newPost: Post = {
      id: post.id || `post-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      authorId: post.authorId,
      authorName: post.authorName,
      content: post.content,
      timestamp: post.timestamp,
      triggerEvent: post.triggerEvent,
      likes: [],
      comments: []
    }

    posts.value.unshift(newPost)

    // 檢查是否超過上限
    if (posts.value.length > LIMITS.MAX_POSTS) {
      // 移除最舊的動態
      posts.value = posts.value.slice(0, LIMITS.MAX_POSTS)
    }

    return newPost
  }

  /**
   * 刪除動態
   */
  function deletePost(postId: string) {
    const index = posts.value.findIndex(p => p.id === postId)
    if (index !== -1) {
      posts.value.splice(index, 1)
      // 同時刪除相關通知
      notifications.value = notifications.value.filter(n => n.postId !== postId)
    }
  }

  /**
   * 新增按讚
   */
  function addLike(postId: string, oderId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return false

    // 檢查是否已按讚
    const existingLike = post.likes.find(l => l.oderId === oderId)
    if (existingLike) return false

    post.likes.push({
      oderId,
      timestamp: Date.now()
    })

    return true
  }

  /**
   * 移除按讚
   */
  function removeLike(postId: string, oderId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return false

    const index = post.likes.findIndex(l => l.oderId === oderId)
    if (index !== -1) {
      post.likes.splice(index, 1)
      return true
    }

    return false
  }

  /**
   * 檢查是否已按讚
   */
  function hasLiked(postId: string, oderId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return false
    return post.likes.some(l => l.oderId === oderId)
  }

  /**
   * 新增留言
   */
  function addComment(
    postId: string,
    comment: Omit<PostComment, 'id' | 'timestamp' | 'floor'> & { id?: string; timestamp?: number; floor?: number }
  ) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return null

    // 檢查留言數量上限
    if (post.comments.length >= LIMITS.MAX_COMMENTS_PER_POST) {
      console.warn(`動態 ${postId} 的留言數已達上限`)
      return null
    }

    // 計算樓層編號（從 1 開始）
    const nextFloor = comment.floor ?? (post.comments.length + 1)

    const newComment: PostComment = {
      id: comment.id || `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      authorId: comment.authorId,
      authorName: comment.authorName,
      content: comment.content,
      timestamp: comment.timestamp || Date.now(),
      floor: nextFloor,
      replyTo: comment.replyTo,
      replyToFloors: comment.replyToFloors
    }

    post.comments.push(newComment)
    return newComment
  }

  /**
   * 刪除留言
   */
  function deleteComment(postId: string, commentId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return false

    const index = post.comments.findIndex(c => c.id === commentId)
    if (index !== -1) {
      post.comments.splice(index, 1)
      return true
    }

    return false
  }

  /**
   * 對留言按讚
   */
  function addCommentLike(postId: string, commentId: string, oderId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return false

    const comment = post.comments.find(c => c.id === commentId)
    if (!comment) return false

    // 初始化 likes 陣列
    if (!comment.likes) {
      comment.likes = []
    }

    // 檢查是否已按讚
    const existingLike = comment.likes.find(l => l.oderId === oderId)
    if (existingLike) return false

    comment.likes.push({
      oderId,
      timestamp: Date.now()
    })

    return true
  }

  /**
   * 移除留言按讚
   */
  function removeCommentLike(postId: string, commentId: string, oderId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return false

    const comment = post.comments.find(c => c.id === commentId)
    if (!comment || !comment.likes) return false

    const index = comment.likes.findIndex(l => l.oderId === oderId)
    if (index !== -1) {
      comment.likes.splice(index, 1)
      return true
    }

    return false
  }

  /**
   * 檢查是否已對留言按讚
   */
  function hasCommentLiked(postId: string, commentId: string, oderId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return false

    const comment = post.comments.find(c => c.id === commentId)
    if (!comment || !comment.likes) return false

    return comment.likes.some(l => l.oderId === oderId)
  }

  /**
   * 新增通知
   */
  function addNotification(notification: Omit<FeedNotification, 'id' | 'timestamp' | 'read'>) {
    const newNotification: FeedNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...notification,
      timestamp: Date.now(),
      read: false
    }

    notifications.value.unshift(newNotification)

    // 檢查是否超過上限
    if (notifications.value.length > LIMITS.MAX_NOTIFICATIONS) {
      notifications.value = notifications.value.slice(0, LIMITS.MAX_NOTIFICATIONS)
    }

    return newNotification
  }

  /**
   * 標記通知已讀
   */
  function markNotificationRead(notificationId: string) {
    const notification = notifications.value.find(n => n.id === notificationId)
    if (notification) {
      notification.read = true
    }
  }

  /**
   * 標記全部通知已讀
   */
  function markAllNotificationsRead() {
    notifications.value.forEach(n => {
      n.read = true
    })
  }

  /**
   * 更新角色瀏覽動態牆的時間
   */
  function updateCharacterFeedCheck(characterId: string, timestamp?: number) {
    characterLastFeedCheck.value[characterId] = timestamp || Date.now()
  }

  /**
   * 更新每日補發日期
   */
  function updateDailyCatchup(date: string) {
    lastDailyCatchup.value = date
  }

  /**
   * 檢查今天是否已執行過每日補發
   */
  function hasDailyCatchupToday() {
    const today = new Date().toISOString().split('T')[0]
    return lastDailyCatchup.value === today
  }

  /**
   * 記錄事件觸發時間（用於冷卻判斷）
   */
  function recordEventTrigger(characterId: string, event: PostTriggerEvent) {
    if (!lastEventTrigger.value[characterId]) {
      lastEventTrigger.value[characterId] = {} as Record<PostTriggerEvent, number>
    }
    lastEventTrigger.value[characterId][event] = Date.now()
  }

  /**
   * 檢查事件是否在冷卻中
   * @param cooldownMs 可選，如果不傳則從 FEED_EVENT_COOLDOWN 取得
   */
  function isEventOnCooldown(characterId: string, event: PostTriggerEvent, cooldownMs?: number) {
    // 使用 import 的常數取得冷卻時間
    const cooldown = cooldownMs ?? FEED_EVENT_COOLDOWN[event] ?? 0

    // 如果沒有冷卻時間設定，代表不需要冷卻
    if (cooldown === 0) return false

    const lastTrigger = lastEventTrigger.value[characterId]?.[event]
    if (!lastTrigger) return false
    return Date.now() - lastTrigger < cooldown
  }

  /**
   * 設定事件冷卻（記錄觸發時間）
   */
  function setEventCooldown(characterId: string, event: PostTriggerEvent, _cooldownMs?: number) {
    // 直接呼叫 recordEventTrigger 記錄當前時間
    recordEventTrigger(characterId, event)
  }

  /**
   * 標記今天已完成每日補發
   */
  function setDailyCatchupDone() {
    const today = new Date().toISOString().split('T')[0] as string
    lastDailyCatchup.value = today
  }

  /**
   * 清理舊動態（保留最近 N 天）
   */
  function clearOldPosts(keepDays: number = 7) {
    const cutoffTime = Date.now() - keepDays * 24 * 60 * 60 * 1000
    const oldPostIds = posts.value
      .filter(p => p.timestamp < cutoffTime)
      .map(p => p.id)

    posts.value = posts.value.filter(p => p.timestamp >= cutoffTime)

    // 同時清理相關通知
    notifications.value = notifications.value.filter(n => !oldPostIds.includes(n.postId))

    return oldPostIds.length
  }

  /**
   * 取得需要摘要的舊貼文（超過指定時間且未摘要）
   * @param hoursAgo 超過幾小時的貼文
   */
  function getUnsummarizedOldPosts(hoursAgo: number = 36): Post[] {
    const cutoffTime = Date.now() - hoursAgo * 60 * 60 * 1000
    return posts.value.filter(p => p.timestamp < cutoffTime && !p.summarized)
  }

  /**
   * 標記貼文已摘要
   */
  function markPostSummarized(postId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (post) {
      post.summarized = true
    }
  }

  /**
   * 清除所有資料（用於重置）
   */
  function clearAll() {
    posts.value = []
    notifications.value = []
    lastDailyCatchup.value = null
    characterLastFeedCheck.value = {}
    lastEventTrigger.value = {}
  }

  return {
    // State
    posts,
    notifications,
    lastDailyCatchup,
    characterLastFeedCheck,
    lastEventTrigger,

    // Getters
    sortedPosts,
    unreadNotifications,
    unreadCount,
    getPostById,
    getCharacterLastCheck,
    getUnreadPostsForCharacter,

    // Actions
    addPost,
    deletePost,
    addLike,
    removeLike,
    hasLiked,
    addComment,
    deleteComment,
    addCommentLike,
    removeCommentLike,
    hasCommentLiked,
    addNotification,
    markNotificationRead,
    markAllNotificationsRead,
    updateCharacterFeedCheck,
    updateDailyCatchup,
    hasDailyCatchupToday,
    setDailyCatchupDone,
    recordEventTrigger,
    isEventOnCooldown,
    setEventCooldown,
    clearOldPosts,
    getUnsummarizedOldPosts,
    markPostSummarized,
    clearAll
  }
}, {
  persist: {
    key: 'ai-chat-feed',
    storage: localStorage,
    serializer: obfuscatedSerializer
  }
})
