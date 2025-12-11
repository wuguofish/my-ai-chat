<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { Heart, MessageCircle, Send, Bell, MoreVertical, FileJson, FileText, Upload, Trash2, X, Users, Reply } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import { useFeedStore } from '@/stores/feed'
import { useUserStore } from '@/stores/user'
import { useCharacterStore } from '@/stores/characters'
import { scheduleCharacterInteractions, triggerCommentReplies, formatFeedContentForDisplay } from '@/services/feedService'
import { downloadFeedAsJson, downloadFeedAsMarkdown, readImportFile, parseFeedImportJson } from '@/utils/feedExport'
import { useToast } from '@/composables/useToast'
import { useMentionInput, type MentionOption } from '@/composables/useMentionInput'
import type { Post, PostComment } from '@/types'

const feedStore = useFeedStore()
const userStore = useUserStore()
const characterStore = useCharacterStore()
const toast = useToast()

// 發文輸入
const newPostContent = ref('')
const isPosting = ref(false)
const postInputRef = ref<HTMLTextAreaElement | null>(null)

// @ 選單可選擇的對象（所有好友）
const mentionOptions = computed((): MentionOption[] => {
  const options: MentionOption[] = []

  // @all（所有人）
  options.push({ id: '@all', name: 'all（所有人）', type: 'all' })

  // 所有好友
  characterStore.characters.forEach(char => {
    options.push({
      id: `@${char.name}`,
      name: char.name,
      type: 'character',
      avatar: char.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=764ba2&color=fff`
    })
  })

  return options
})

// 發文框 mention（使用 composable）
const {
  showMentionMenu: showPostMentionMenu,
  mentionMenuPosition: postMentionMenuPosition,
  handleInputChange: handlePostInputChange,
  selectMention: selectPostMention,
  handleMentionKeydown: handlePostMentionKeydown
} = useMentionInput({
  inputRef: postInputRef,
  inputValue: newPostContent,
  mentionOptions
})

// 留言輸入（每個動態一個）
const commentInputs = ref<Record<string, string>>({})
const commentInputRefs = ref<Record<string, HTMLInputElement | null>>({})
const expandedComments = ref<Set<string>>(new Set())

// 留言框 mention 狀態（每個動態各自維護）
const showCommentMentionMenu = ref<Record<string, boolean>>({})
const commentMentionMenuPosition = ref<Record<string, { top: number; left: number }>>({})
const commentMentionCursorPosition = ref<Record<string, number>>({})

// 樓層高亮狀態（格式：postId-floor）
const highlightedFloor = ref<string | null>(null)
let highlightTimeout: ReturnType<typeof setTimeout> | null = null

// 處理留言輸入變化（偵測 @ 符號）
const handleCommentInputChange = (postId: string) => {
  const input = commentInputRefs.value[postId]
  if (!input) return

  const cursorPos = input.selectionStart || 0
  const textBeforeCursor = (commentInputs.value[postId] || '').substring(0, cursorPos)

  if (textBeforeCursor.endsWith('@')) {
    showCommentMentionMenu.value[postId] = true
    commentMentionCursorPosition.value[postId] = cursorPos

    const rect = input.getBoundingClientRect()
    commentMentionMenuPosition.value[postId] = {
      left: rect.left + 20,
      top: rect.top - 10
    }
  } else {
    showCommentMentionMenu.value[postId] = false
  }
}

// 選擇留言 mention 對象
const selectCommentMention = (postId: string, option: MentionOption) => {
  const input = commentInputRefs.value[postId]
  if (!input) return

  const cursorPos = commentMentionCursorPosition.value[postId] || 0
  const currentValue = commentInputs.value[postId] || ''
  const beforeAt = currentValue.substring(0, cursorPos - 1)
  const afterCursor = currentValue.substring(cursorPos)

  commentInputs.value[postId] = beforeAt + option.id + ' ' + afterCursor
  showCommentMentionMenu.value[postId] = false

  // 聚焦並設定游標位置
  setTimeout(() => {
    if (input) {
      const newCursorPos = (beforeAt + option.id + ' ').length
      input.setSelectionRange(newCursorPos, newCursorPos)
      input.focus()
    }
  }, 0)
}

// 處理發文框鍵盤事件
const handlePostKeydown = (event: KeyboardEvent) => {
  // 如果 mention 選單開啟，Escape 關閉選單
  if (handlePostMentionKeydown(event)) {
    event.preventDefault()
    return
  }

  // Ctrl+Enter 送出
  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault()
    handlePost()
  }
}

// 處理留言輸入的鍵盤事件
const handleCommentKeydown = (postId: string, event: KeyboardEvent) => {
  if (showCommentMentionMenu.value[postId] && event.key === 'Escape') {
    showCommentMentionMenu.value[postId] = false
    event.preventDefault()
    return
  }

  // Enter 送出留言
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    const post = feedStore.posts.find(p => p.id === postId)
    if (post) {
      handleComment(post)
    }
  }
}

// 通知面板
const showNotificationPanel = ref(false)

// 更多選單
const showMoreMenu = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// 按讚名單彈出視窗
const showLikesModal = ref(false)
const likesModalTitle = ref('')
const likesModalList = ref<{ id: string; name: string; avatar: string }[]>([])

// 匯出 JSON
const handleExportJson = () => {
  if (feedStore.posts.length === 0) {
    toast.warning('沒有可匯出的動態')
    return
  }
  downloadFeedAsJson(feedStore.posts, feedStore.notifications, true)
  toast.success('動態已匯出為 JSON 檔案')
  showMoreMenu.value = false
}

// 匯出 Markdown
const handleExportMarkdown = () => {
  if (feedStore.posts.length === 0) {
    toast.warning('沒有可匯出的動態')
    return
  }
  downloadFeedAsMarkdown(feedStore.posts)
  toast.success('動態已匯出為 Markdown 檔案')
  showMoreMenu.value = false
}

// 觸發匯入檔案選擇
const handleImportClick = () => {
  fileInputRef.value?.click()
  showMoreMenu.value = false
}

// 處理匯入檔案
const handleFileImport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const content = await readImportFile(file)
    const importData = parseFeedImportJson(content)

    if (!importData) {
      toast.error('匯入失敗：檔案格式不正確')
      return
    }

    // 確認匯入
    const existingCount = feedStore.posts.length
    const importCount = importData.posts.length

    if (existingCount > 0) {
      const confirmMsg = `即將匯入 ${importCount} 則動態。目前已有 ${existingCount} 則動態，匯入的動態會與現有動態合併。確定要繼續嗎？`
      if (!window.confirm(confirmMsg)) {
        return
      }
    }

    // 合併動態（避免重複 ID）
    const existingIds = new Set(feedStore.posts.map(p => p.id))
    let addedCount = 0

    for (const post of importData.posts) {
      if (!existingIds.has(post.id)) {
        feedStore.addPost(post)
        addedCount++
      }
    }

    toast.success(`成功匯入 ${addedCount} 則新動態`)
  } catch (error) {
    console.error('匯入失敗:', error)
    toast.error('匯入失敗：檔案讀取錯誤')
  } finally {
    // 清除 input 以便重複選擇同一檔案
    input.value = ''
  }
}

// 格式化時間
const formatTime = (timestamp: number) => {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  if (hours < 24) return `${hours} 小時前`
  if (days < 7) return `${days} 天前`

  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

// 取得作者頭像（根據 authorId 動態查詢）
const getAuthorAvatar = (authorId: string) => {
  if (authorId === 'user') {
    return userStore.profile?.avatar || '/default-avatar.png'
  }
  const character = characterStore.getCharacterById(authorId)
  return character?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(character?.name || '?')}&background=764ba2&color=fff`
}

// 格式化動態/留言內容（處理 @mentions）
const formatContent = (content: string) => {
  return formatFeedContentForDisplay(
    content,
    characterStore.characters,
    userStore.profile?.nickname || '你'
  )
}

// 格式化留言內容（處理 replyToFloors + @mentions + 樓層回覆格式）
const formatCommentContent = (comment: PostComment, _postId: string) => {
  let result = ''

  // 如果有 replyToFloors 且內容開頭沒有「回#」格式，先加上樓層指引器
  if (comment.replyToFloors && comment.replyToFloors.length > 0) {
    // 檢查內容是否已經有樓層回覆格式開頭
    const hasFloorPrefix = /^回\s*#\d+/.test(comment.content)
    if (!hasFloorPrefix) {
      const floorLinks = comment.replyToFloors.map((floor: number) =>
        `<span class="reply-floor-link" data-floor="${floor}">#${floor}</span>`
      ).join(' ')
      result = `<span class="comment-reply-indicator">回 ${floorLinks}：</span>`
    }
  }

  // 再處理內容本身（包含樓層格式轉換和 @mentions）
  result += formatContent(comment.content)

  return result
}

// 發布動態
const handlePost = async () => {
  if (!newPostContent.value.trim() || isPosting.value) return

  isPosting.value = true

  try {
    const newPost = feedStore.addPost({
      authorId: 'user',
      authorName: userStore.profile?.nickname || '我',
      content: newPostContent.value.trim(),
      timestamp: Date.now(),
      triggerEvent: 'user_post'
    })

    newPostContent.value = ''

    // 觸發在線角色的即時互動（有隨機延遲）
    if (newPost) {
      scheduleCharacterInteractions(newPost.id).catch(err => {
        console.warn('排程角色互動失敗:', err)
      })
    }
  } finally {
    isPosting.value = false
  }
}

// 按讚/取消按讚
const toggleLike = (post: Post) => {
  const hasLiked = feedStore.hasLiked(post.id, 'user')
  if (hasLiked) {
    feedStore.removeLike(post.id, 'user')
  } else {
    feedStore.addLike(post.id, 'user')
  }
}

// 檢查是否已按讚
const isLikedByUser = (post: Post) => {
  return feedStore.hasLiked(post.id, 'user')
}

// 取得按讚者名稱顯示文字（最多顯示 2 人）
const getLikeText = (post: Post) => {
  const names = post.likes.map(like => {
    if (like.oderId === 'user') return '你'
    const character = characterStore.getCharacterById(like.oderId)
    return character?.name || '未知'
  })

  if (names.length <= 2) {
    return names.join('和')
  }
  // 超過 2 人：「某某和某某等 N 人」
  return `${names[0]}和${names[1]}等 ${names.length} 人`
}

// 展開/收合留言
const toggleComments = (postId: string) => {
  if (expandedComments.value.has(postId)) {
    expandedComments.value.delete(postId)
  } else {
    expandedComments.value.add(postId)
  }
}

// 發送留言
const handleComment = (post: Post) => {
  const content = commentInputs.value[post.id]?.trim()
  if (!content) return

  const newComment = feedStore.addComment(post.id, {
    authorId: 'user',
    authorName: userStore.profile?.nickname || '我',
    content
  })

  commentInputs.value[post.id] = ''

  // 確保留言區展開
  expandedComments.value.add(post.id)

  // 觸發留言回覆鏈（使用者留言會重置輪次）
  if (newComment) {
    triggerCommentReplies(post.id, newComment, true).catch(err => {
      console.warn('觸發留言回覆鏈失敗:', err)
    })
  }
}

// 切換通知面板
const toggleNotificationPanel = () => {
  showNotificationPanel.value = !showNotificationPanel.value
  if (showNotificationPanel.value) {
    // 打開時標記全部已讀
    feedStore.markAllNotificationsRead()
  }
}

// 留言按讚/取消按讚
const toggleCommentLike = (postId: string, commentId: string) => {
  const hasLiked = feedStore.hasCommentLiked(postId, commentId, 'user')
  if (hasLiked) {
    feedStore.removeCommentLike(postId, commentId, 'user')
  } else {
    feedStore.addCommentLike(postId, commentId, 'user')
  }
}

// 檢查是否已對留言按讚
const isCommentLikedByUser = (postId: string, commentId: string) => {
  return feedStore.hasCommentLiked(postId, commentId, 'user')
}

// 取得留言按讚數
const getCommentLikeCount = (post: Post, commentId: string) => {
  const comment = post.comments.find(c => c.id === commentId)
  return comment?.likes?.length || 0
}

// 顯示動態按讚名單
const showPostLikes = (post: Post) => {
  if (post.likes.length === 0) return

  likesModalTitle.value = '按讚的人'
  likesModalList.value = post.likes.map(like => {
    if (like.oderId === 'user') {
      return {
        id: 'user',
        name: userStore.profile?.nickname || '我',
        avatar: userStore.profile?.avatar || '/default-avatar.png'
      }
    }
    const character = characterStore.getCharacterById(like.oderId)
    return {
      id: like.oderId,
      name: character?.name || '未知',
      avatar: character?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(character?.name || '?')}&background=764ba2&color=fff`
    }
  })
  showLikesModal.value = true
}

// 顯示留言按讚名單
const showCommentLikes = (post: Post, commentId: string) => {
  const comment = post.comments.find(c => c.id === commentId)
  if (!comment?.likes || comment.likes.length === 0) return

  likesModalTitle.value = '按讚的人'
  likesModalList.value = comment.likes.map(like => {
    if (like.oderId === 'user') {
      return {
        id: 'user',
        name: userStore.profile?.nickname || '我',
        avatar: userStore.profile?.avatar || '/default-avatar.png'
      }
    }
    const character = characterStore.getCharacterById(like.oderId)
    return {
      id: like.oderId,
      name: character?.name || '未知',
      avatar: character?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(character?.name || '?')}&background=764ba2&color=fff`
    }
  })
  showLikesModal.value = true
}

// 關閉按讚名單彈出視窗
const closeLikesModal = () => {
  showLikesModal.value = false
}

// 動態列表
const posts = computed(() => feedStore.sortedPosts)

/**
 * 點擊回覆按鈕，在輸入框插入「回#N：」
 */
const handleReplyToFloor = (postId: string, floor: number) => {
  // 確保留言區展開
  expandedComments.value.add(postId)

  // 取得當前輸入內容
  const currentValue = commentInputs.value[postId] || ''

  // 在開頭插入「回#N：」
  const replyPrefix = `回#${floor}：`

  // 如果已經有相同的回覆前綴，不重複插入
  if (currentValue.startsWith(replyPrefix)) {
    // 只聚焦輸入框
    nextTick(() => {
      const input = commentInputRefs.value[postId]
      if (input) {
        input.focus()
      }
    })
    return
  }

  // 插入回覆前綴
  commentInputs.value[postId] = replyPrefix + currentValue

  // 聚焦輸入框並將游標移到最後
  nextTick(() => {
    const input = commentInputRefs.value[postId]
    if (input) {
      input.focus()
      const len = (commentInputs.value[postId] || '').length
      input.setSelectionRange(len, len)
    }
  })
}

/**
 * 點擊「回 #N」指示器，高亮被回覆的樓層
 */
const handleHighlightFloor = (postId: string, floor: number) => {
  // 清除之前的高亮
  if (highlightTimeout) {
    clearTimeout(highlightTimeout)
  }

  // 設定新的高亮
  highlightedFloor.value = `${postId}-${floor}`

  // 3 秒後自動取消高亮
  highlightTimeout = setTimeout(() => {
    highlightedFloor.value = null
  }, 3000)
}

/**
 * 處理內容區塊的點擊事件（事件委派）
 * 用於處理 v-html 渲染的樓層連結點擊
 */
const handleContentClick = (event: MouseEvent, postId: string) => {
  const target = event.target as HTMLElement
  // 檢查是否點擊了樓層連結
  if (target.classList.contains('reply-floor-link') && target.dataset.floor) {
    event.stopPropagation()
    const floor = parseInt(target.dataset.floor, 10)
    if (!isNaN(floor)) {
      handleHighlightFloor(postId, floor)
    }
  }
}

/**
 * 檢查是否為高亮樓層
 */
const isFloorHighlighted = (postId: string, floor: number | undefined) => {
  if (!floor) return false
  return highlightedFloor.value === `${postId}-${floor}`
}

// 刪除動態（僅限使用者自己的動態）
const handleDeletePost = (post: Post) => {
  if (post.authorId !== 'user') return

  const confirmMsg = post.comments.length > 0
    ? `確定要刪除這則動態嗎？這則動態有 ${post.comments.length} 則留言，刪除後將無法復原。`
    : '確定要刪除這則動態嗎？刪除後將無法復原。'

  if (window.confirm(confirmMsg)) {
    feedStore.deletePost(post.id)
    toast.success('動態已刪除')
  }
}

// 點擊外部關閉更多選單
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('.more-menu-wrapper')) {
    showMoreMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="page">
    <PageHeader title="動態牆">
      <template #actions>
        <!-- 更多選單 -->

        <div class="header-btn-wrapper"><!-- 通知按鈕 -->
          <button class="header-btn notification-btn" @click="toggleNotificationPanel">
            <Bell :size="20" />
            <span v-if="feedStore.unreadCount > 0" class="notification-badge">
              {{ feedStore.unreadCount > 99 ? '99+' : feedStore.unreadCount }}
            </span>
          </button>

          <div class="more-menu-wrapper">
            <button class="header-btn" @click="showMoreMenu = !showMoreMenu">
              <MoreVertical :size="20" />
            </button>
            <div v-if="showMoreMenu" class="more-menu" @click.stop>
              <button class="menu-item" @click="handleExportJson">
                <FileJson :size="18" />
                <span>匯出為 JSON</span>
              </button>
              <button class="menu-item" @click="handleExportMarkdown">
                <FileText :size="18" />
                <span>匯出為 Markdown</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item" @click="handleImportClick">
                <Upload :size="18" />
                <span>匯入動態</span>
              </button>
            </div>
          </div></div>

        
      </template>
    </PageHeader>

    <!-- 隱藏的檔案輸入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json"
      style="display: none"
      @change="handleFileImport"
    />

    <div class="feed-content">
      <!-- 發文區域 -->
      <div class="post-composer">
        <div class="composer-avatar">
          <img
            :src="userStore.profile?.avatar || '/default-avatar.png'"
            :alt="userStore.profile?.nickname"
          />
        </div>
        <div class="composer-input-wrapper">
          <textarea
            ref="postInputRef"
            v-model="newPostContent"
            placeholder="分享你的想法... (輸入 @ 可提及好友)"
            rows="2"
            class="composer-input"
            @input="handlePostInputChange"
            @keydown="handlePostKeydown"
          />
          <button
            class="composer-submit"
            :disabled="!newPostContent.trim() || isPosting"
            @click="handlePost"
          >
            <Send :size="18" />
          </button>
        </div>

        <!-- 發文框 @ 選單 -->
        <div v-if="showPostMentionMenu" class="mention-menu"
          :style="{ top: postMentionMenuPosition.top + 'px', left: postMentionMenuPosition.left + 'px' }">
          <div v-for="option in mentionOptions" :key="option.id" class="mention-option" @click="selectPostMention(option)">
            <div class="mention-avatar">
              <template v-if="option.type === 'all'">
                <Users :size="20" class="mention-icon" />
              </template>
              <template v-else>
                <img :src="option.avatar" :alt="option.name" />
              </template>
            </div>
            <span class="mention-name">{{ option.name }}</span>
          </div>
        </div>
      </div>

      <!-- 動態列表 -->
      <div class="posts-list">
        <div v-if="posts.length === 0" class="empty-state">
          <p>還沒有任何動態</p>
          <p class="empty-hint">發布第一則動態，或等待好友們分享吧！</p>
        </div>

        <article v-for="post in posts" :key="post.id" class="post-card">
          <!-- 動態頭部 -->
          <div class="post-header">
            <div class="post-avatar">
              <img
                :src="getAuthorAvatar(post.authorId)"
                :alt="post.authorName"
              />
            </div>
            <div class="post-meta">
              <span class="post-author">{{ post.authorName }}</span>
              <span class="post-time">{{ formatTime(post.timestamp) }}</span>
            </div>
            <!-- 刪除按鈕（僅使用者自己的動態） -->
            <button
              v-if="post.authorId === 'user'"
              class="post-delete-btn"
              title="刪除動態"
              @click="handleDeletePost(post)"
            >
              <Trash2 :size="16" />
            </button>
          </div>

          <!-- 動態內容 -->
          <div class="post-content" v-html="formatContent(post.content)"></div>

          <!-- 互動按鈕 -->
          <div class="post-actions">
            <button
              :class="['action-btn', 'like-btn', { liked: isLikedByUser(post) }]"
              @click="toggleLike(post)"
            >
              <Heart :size="18" :fill="isLikedByUser(post) ? 'currentColor' : 'none'" />
              <span v-if="post.likes.length > 0">{{ post.likes.length }}</span>
            </button>

            <button class="action-btn comment-btn" @click="toggleComments(post.id)">
              <MessageCircle :size="18" />
              <span v-if="post.comments.length > 0">{{ post.comments.length }}</span>
            </button>
          </div>

          <!-- 按讚名單 -->
          <div v-if="post.likes.length > 0" class="like-list" @click="showPostLikes(post)">
            {{ getLikeText(post) }}說讚
          </div>

          <!-- 留言區 -->
          <div v-if="expandedComments.has(post.id) || post.comments.length > 0" class="comments-section">
            <!-- 留言列表 -->
            <div v-if="post.comments.length > 0" class="comments-list">
              <div
                v-for="comment in post.comments"
                :key="comment.id"
                :class="['comment-item', { highlighted: isFloorHighlighted(post.id, comment.floor) }]"
                :data-floor-id="`${post.id}-${comment.floor}`"
              >
                <div class="comment-floor" v-if="comment.floor">#{{ comment.floor }}</div>
                <div class="comment-avatar">
                  <img
                    :src="getAuthorAvatar(comment.authorId)"
                    :alt="comment.authorName"
                  />
                </div>
                <div class="comment-body">
                  <span class="comment-author">{{ comment.authorName }}</span>
                  <span
                    class="comment-content"
                    v-html="formatCommentContent(comment, post.id)"
                    @click="handleContentClick($event, post.id)"
                  ></span>
                  <div class="comment-footer">
                    <span class="comment-time">{{ formatTime(comment.timestamp) }}</span>
                    <button
                      v-if="comment.floor"
                      class="comment-reply-btn"
                      title="回覆這則留言"
                      @click="handleReplyToFloor(post.id, comment.floor)"
                    >
                      <Reply :size="12" />
                      <span>回覆</span>
                    </button>
                    <button
                      :class="['comment-like-btn', { liked: isCommentLikedByUser(post.id, comment.id) }]"
                      @click="toggleCommentLike(post.id, comment.id)"
                    >
                      <Heart :size="12" :fill="isCommentLikedByUser(post.id, comment.id) ? 'currentColor' : 'none'" />
                      <span
                        v-if="getCommentLikeCount(post, comment.id) > 0"
                        class="comment-like-count"
                        @click.stop="showCommentLikes(post, comment.id)"
                      >{{ getCommentLikeCount(post, comment.id) }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 留言輸入框 -->
            <div class="comment-input-wrapper">
              <textarea
                :ref="(el) => commentInputRefs[post.id] = el as HTMLInputElement"
                v-model="commentInputs[post.id]"
                type="text"
                placeholder="留言... (輸入 @ 可提及好友)"
                class="comment-input"
                :rows="1"
                @input="handleCommentInputChange(post.id)"
                @keydown="handleCommentKeydown(post.id, $event)" />
              <button
                class="comment-submit"
                :disabled="!commentInputs[post.id]?.trim()"
                @click="handleComment(post)"
              >
                <Send :size="16" />
              </button>

              <!-- 留言框 @ 選單 -->
              <div v-if="showCommentMentionMenu[post.id]" class="mention-menu"
                :style="{ top: (commentMentionMenuPosition[post.id]?.top || 0) + 'px', left: (commentMentionMenuPosition[post.id]?.left || 0) + 'px' }">
                <div v-for="option in mentionOptions" :key="option.id" class="mention-option" @click="selectCommentMention(post.id, option)">
                  <div class="mention-avatar">
                    <template v-if="option.type === 'all'">
                      <Users :size="20" class="mention-icon" />
                    </template>
                    <template v-else>
                      <img :src="option.avatar" :alt="option.name" />
                    </template>
                  </div>
                  <span class="mention-name">{{ option.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- 通知面板（暫時簡易版，Phase 3 會完善） -->
    <div v-if="showNotificationPanel" class="notification-panel-overlay" @click="toggleNotificationPanel">
      <div class="notification-panel" @click.stop>
        <div class="panel-header">
          <h3>通知</h3>
          <button class="close-btn" @click="toggleNotificationPanel">×</button>
        </div>
        <div class="panel-content">
          <div v-if="feedStore.notifications.length === 0" class="empty-notifications">
            目前沒有通知
          </div>
          <div
            v-for="notif in feedStore.notifications"
            :key="notif.id"
            :class="['notification-item', { unread: !notif.read }]"
          >
            <img :src="getAuthorAvatar(notif.actorId)" :alt="notif.actorName" class="notif-avatar" />
            <div class="notif-content">
              <span class="notif-actor">{{ notif.actorName }}</span>
              <span class="notif-action">
                {{
                  notif.type === 'like' ? '對你的動態按讚' :
                  notif.type === 'comment' ? '回覆了你的動態' :
                  notif.type === 'comment_like' ? '對你的留言按讚' :
                  '在動態中提及你'
                }}
              </span>
              <p class="notif-preview">{{ notif.postPreview }}</p>
              <span class="notif-time">{{ formatTime(notif.timestamp) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 按讚名單彈出視窗 -->
    <Teleport to="body">
      <div v-if="showLikesModal" class="likes-modal-overlay" @click="closeLikesModal">
        <div class="likes-modal" @click.stop>
          <div class="likes-modal-header">
            <h3>{{ likesModalTitle }}</h3>
            <button class="likes-modal-close" @click="closeLikesModal">
              <X :size="20" />
            </button>
          </div>
          <div class="likes-modal-list">
            <div v-for="liker in likesModalList" :key="liker.id" class="likes-modal-item">
              <img :src="liker.avatar" :alt="liker.name" class="likes-modal-avatar" />
              <span class="likes-modal-name">{{ liker.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.feed-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
}

.feed-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
}

/* 發文區域 */
.post-composer {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  margin-bottom: var(--spacing-lg);
  box-shadow: var(--shadow-sm);
}

.composer-avatar img {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  object-fit: cover;
}

.composer-input-wrapper {
  flex: 1;
  display: flex;
  flex-direction: row;
  gap: var(--spacing-sm);
}

.composer-input {
  width: 100%;
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  resize: none;
  font-size: var(--text-base);
  font-family: inherit;

}

.composer-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.composer-submit {
  align-self: flex-end;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition);
}

.composer-submit:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.composer-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 動態列表 */
.posts-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.empty-state {
  text-align: center;
  padding: var(--spacing-4xl);
  color: var(--color-text-secondary);
}

.empty-hint {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-sm);
}

/* 動態卡片 */
.post-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-sm);
}

.post-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.post-delete-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: var(--radius);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition);
  opacity: 0.6;
}

.post-delete-btn:hover {
  background: rgba(231, 76, 60, 0.1);
  color: #e74c3c;
  opacity: 1;
}

.post-avatar img {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  object-fit: cover;
}

.post-meta {
  display: flex;
  flex-direction: column;
}

.post-author {
  font-weight: 600;
  color: var(--color-text-primary);
}

.post-time {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
}

.post-content {
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  margin-bottom: var(--spacing-md);
}

/* 互動按鈕 */
.post-actions {
  display: flex;
  gap: var(--spacing-lg);
  padding: var(--spacing-sm) 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  background: none;
  border: none;
  border-radius: var(--radius);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition);
}

.action-btn:hover {
  background: var(--color-bg-secondary);
}

.like-btn.liked {
  color: #e74c3c;
}

/* 按讚名單 */
.like-list {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  padding: var(--spacing-sm) 0;
  cursor: pointer;
}

.like-list:hover {
  color: var(--color-text-primary);
  text-decoration: underline;
}

/* 留言區 */
.comments-section {
  margin-top: var(--spacing-md);
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.comment-item {
  display: flex;
  gap: var(--spacing-sm);
  align-items: flex-start;
}

.comment-floor {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  min-width: 28px;
  text-align: right;
  padding-top: var(--spacing-sm);
}

.comment-avatar img {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  object-fit: cover;
}

.comment-body {
  flex: 1;
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
  padding: var(--spacing-sm) var(--spacing-md);
}

.comment-author {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-right: var(--spacing-sm);
}

:deep(.comment-reply-indicator) {
  font-size: var(--text-xs);
  color: var(--color-primary);
  background: rgba(102, 126, 234, 0.1);
  padding: 1px 6px;
  border-radius: var(--radius);
  margin-right: var(--spacing-sm);
}

:deep(.reply-floor-link){
  cursor: pointer;
  margin-left: 2px;
  transition: all var(--transition);
}

:deep(.reply-floor-link:hover) {
  text-decoration: underline;
  color: var(--color-primary-dark, #5a6fd6);
}

/* 留言高亮效果 */
.comment-item.highlighted {
  animation: highlight-pulse 2s ease-out;
}

.comment-item.highlighted .comment-body {
  background: rgba(102, 126, 234, 0.15);
  box-shadow: 0 0 0 2px var(--color-primary);
}

@keyframes highlight-pulse {
  0% {
    transform: scale(1);
  }
  10% {
    transform: scale(1.02);
  }
  20% {
    transform: scale(1);
  }
}

.comment-content {
  color: var(--color-text-primary);
}

.comment-footer {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-top: var(--spacing-xs);
}

.comment-time {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.comment-reply-btn {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  background: none;
  border: none;
  border-radius: var(--radius);
  color: var(--color-text-tertiary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all var(--transition);
}

.comment-reply-btn:hover {
  background: rgba(102, 126, 234, 0.1);
  color: var(--color-primary);
}

.comment-like-btn {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  background: none;
  border: none;
  border-radius: var(--radius);
  color: var(--color-text-tertiary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: all var(--transition);
}

.comment-like-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.comment-like-btn.liked {
  color: #e74c3c;
}

/* 留言輸入框 */
.comment-input-wrapper {
  display: flex;
  gap: var(--spacing-sm);
}

.comment-input {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  resize: none;
  min-height: 1em !important;
}

.comment-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.comment-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition);
}

.comment-submit:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.comment-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Header 按鈕共用樣式 */
.header-btn-wrapper{
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  column-gap: var(--spacing-xs);
}

.header-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: var(--radius-full);
  color: white;
  cursor: pointer;
  transition: all var(--transition);
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 更多選單 */
.more-menu-wrapper {
  position: relative;
}

.more-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--spacing-sm);
  min-width: 180px;
  background: var(--color-bg-primary);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg, 0 4px 20px rgba(0, 0, 0, 0.15));
  z-index: 100;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  padding: var(--spacing-md) var(--spacing-lg);
  background: none;
  border: none;
  color: var(--color-text-primary);
  font-size: var(--text-base);
  cursor: pointer;
  transition: background var(--transition);
  text-align: left;
}

.menu-item:hover {
  background: var(--color-bg-secondary);
}

.menu-divider {
  height: 1px;
  background: var(--color-border);
  margin: var(--spacing-xs) 0;
}

/* 通知按鈕 */
.notification-btn {
  position: relative;
}

.notification-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  background: #e74c3c;
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 通知面板 */
.notification-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.notification-panel {
  width: 100%;
  max-width: 400px;
  height: 100%;
  background: var(--color-bg-primary);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.panel-header h3 {
  margin: 0;
  font-size: var(--text-lg);
}

.close-btn {
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  font-size: 24px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
}

.empty-notifications {
  padding: var(--spacing-4xl);
  text-align: center;
  color: var(--color-text-tertiary);
}

.notification-item {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
  transition: background var(--transition);
}

.notification-item:hover {
  background: var(--color-bg-secondary);
}

.notification-item.unread {
  background: rgba(102, 126, 234, 0.05);
}

.notif-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  object-fit: cover;
}

.notif-content {
  flex: 1;
}

.notif-actor {
  font-weight: 600;
}

.notif-action {
  color: var(--color-text-secondary);
}

.notif-preview {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin: var(--spacing-xs) 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-time {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

/* 留言按讚數（可點擊） */
.comment-like-count {
  cursor: pointer;
}

.comment-like-count:hover {
  text-decoration: underline;
}

/* @ Mention 樣式 */
:deep(.mention) {
  color: var(--color-primary);
  font-weight: 500;
  cursor: pointer;
}

:deep(.mention:hover) {
  text-decoration: underline;
}

:deep(.mention-me) {
  background: rgba(102, 126, 234, 0.15);
  padding: 0 4px;
  border-radius: 4px;
}

/* 按讚名單彈出視窗 */
.likes-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.likes-modal {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 320px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.likes-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.likes-modal-header h3 {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}

.likes-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  border-radius: var(--radius);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition);
}

.likes-modal-close:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.likes-modal-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
}

.likes-modal-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) 0;
}

.likes-modal-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  object-fit: cover;
}

.likes-modal-name {
  font-size: var(--text-base);
  color: var(--color-text-primary);
  font-weight: 500;
}

/* @ 選單 */
.mention-menu {
  position: fixed;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  min-width: 180px;
}

.mention-option {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background var(--transition);
}

.mention-option:hover {
  background: var(--color-bg-secondary);
}

.mention-avatar {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mention-avatar img {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-full);
  object-fit: cover;
}

.mention-icon {
  color: var(--color-primary);
}

.mention-name {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

/* 讓發文區域和留言輸入區有 relative 定位以便選單定位 */
.post-composer {
  position: relative;
}

.comment-input-wrapper {
  position: relative;
}

/* 響應式 */
@media (max-width: 768px) {
  .feed-content {
    padding: var(--spacing-md);
  }

  .post-composer {
    padding: var(--spacing-md);
  }

  .notification-panel {
    max-width: 100%;
  }
}
</style>
