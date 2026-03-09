<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCharacterStore } from '@/stores/characters'
import { useChatRoomsStore } from '@/stores/chatRooms'
import { useMemoriesStore } from '@/stores/memories'
import { useRelationshipsStore } from '@/stores/relationships'
import { useFeedStore } from '@/stores/feed'
import { useModal } from '@/composables/useModal'
import { googleAuthService } from '@/services/googleAuth'
import { googleDriveService } from '@/services/googleDrive'
import { fetchServerVersion, clearCacheAndReload, getVersionInfo, type VersionInfo } from '@/utils/version'
import { getAdapter, getImplementedProviders, LLM_CONFIG, type LLMProvider } from '@/services/llm'
import { encodeBackupData, decodeBackupData } from '@/utils/dataObfuscation'
import { Eye, EyeOff, Camera, ChevronDown, ChevronUp } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import AvatarCropper from '@/components/common/AvatarCropper.vue'
import type { UserProfile, Message } from '@/types'

// 備份資料結構類型（用於匯入時的類型檢查）
// 使用 any 是因為備份資料來自外部，需要動態處理
/* eslint-disable @typescript-eslint/no-explicit-any */
interface BackupData {
  user?: UserProfile
  characters?: any[]
  chatRooms?: any[]
  messages?: Record<string, any>
  memories?: {
    characterMemories?: Record<string, any>
    roomMemories?: Record<string, any>
  }
  relationships?: {
    userToCharacter?: any[]
    characterToCharacter?: any[]
  }
  tracking?: {
    memory?: any
    context?: any
  }
  feed?: {
    posts?: any[]
    notifications?: any[]
    lastDailyCatchup?: any
    characterLastFeedCheck?: Record<string, any>
    lastEventTrigger?: Record<string, any>
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const { alert, confirm, confirmDanger } = useModal()

const router = useRouter()
const userStore = useUserStore()
const characterStore = useCharacterStore()
const chatRoomStore = useChatRoomsStore()
const memoriesStore = useMemoriesStore()
const relationshipsStore = useRelationshipsStore()
const feedStore = useFeedStore()

// 版本資訊
const currentVersion = ref('')
const versionInfo = ref<VersionInfo | null>(null)

// 取得版本資訊
const loadVersionInfo = async () => {
  currentVersion.value = await fetchServerVersion()
  versionInfo.value = await getVersionInfo(currentVersion.value) || null
}

// Google Drive 同步狀態
const isGoogleConnected = ref(false)
const isSyncing = ref(false)

// 檢查 Google 連線狀態
const checkGoogleConnection = () => {
  isGoogleConnected.value = googleAuthService.isTokenValid()
}

// 初始化
checkGoogleConnection()
loadVersionInfo()

// 設定 token 失效回調
googleAuthService.setTokenInvalidCallback(async () => {
  return await confirm('Google Drive 授權已失效，是否要重新授權？', { type: 'warning' })
})

// LLM 服務商設定
const implementedProviders = getImplementedProviders()
const selectedDefaultProvider = ref(userStore.defaultProvider)

// 有設定 API Key 的服務商（用於預設服務商選擇）
const providersWithApiKey = computed(() => {
  return implementedProviders.filter(provider => userStore.hasApiKey(provider))
})

// 各服務商的 API Key 輸入狀態
const apiKeyInputs = ref<Record<string, string>>({
  gemini: userStore.getApiKey('gemini'),
  claude: userStore.getApiKey('claude'),
  openai: userStore.getApiKey('openai'),
  grok: userStore.getApiKey('grok')
})

const showApiKey = ref<Record<string, boolean>>({
  gemini: false,
  claude: false,
  openai: false,
  grok: false
})

const isValidatingApiKey = ref<Record<string, boolean>>({
  gemini: false,
  claude: false,
  openai: false,
  grok: false
})

// 取得服務商的顯示設定
const getProviderConfig = (provider: string) => {
  return LLM_CONFIG[provider as LLMProvider]
}

// 檢查服務商是否已實作
const isProviderImplemented = (provider: string) => {
  return implementedProviders.includes(provider as LLMProvider)
}

// 頭像更換
const showAvatarCropper = ref(false)
const originalAvatarImage = ref('')
const avatarFileInput = ref<HTMLInputElement | null>(null)

const handleAvatarClick = () => {
  avatarFileInput.value?.click()
}

const handleAvatarFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      originalAvatarImage.value = e.target?.result as string
      showAvatarCropper.value = true
    }
    reader.readAsDataURL(file)
  }
  // 清空 input，允許重複選擇同一檔案
  target.value = ''
}

const handleAvatarCropConfirm = async (croppedImage: string) => {
  userStore.updateProfile({ avatar: croppedImage })
  showAvatarCropper.value = false
  originalAvatarImage.value = ''
  await alert('頭像已更新', { type: 'success' })
}

const handleAvatarCropCancel = () => {
  showAvatarCropper.value = false
  originalAvatarImage.value = ''
}

// 使用者個人資訊編輯
const showEditProfile = ref(false)
const editingProfile = ref({
  nickname: userStore.userName,
  realName: userStore.profile?.realName || '',
  age: userStore.profile?.age || '',
  gender: userStore.profile?.gender || 'unset',
  birthday: userStore.profile?.birthday || '',
  profession: userStore.profile?.profession || '',
  bio: userStore.profile?.bio || '',
  globalSystemPrompt: userStore.profile?.globalSystemPrompt || ''
})

const handleEditProfile = () => {
  showEditProfile.value = true
  editingProfile.value = {
    nickname: userStore.userName,
    realName: userStore.profile?.realName || '',
    age: userStore.profile?.age || '',
    gender: userStore.profile?.gender || 'unset',
    birthday: userStore.profile?.birthday || '',
    profession: userStore.profile?.profession || '',
    bio: userStore.profile?.bio || '',
    globalSystemPrompt: userStore.profile?.globalSystemPrompt || ''
  }
}

const handleSaveProfile = async () => {
  userStore.updateProfile({
    ...userStore.profile!,
    nickname: editingProfile.value.nickname,
    realName: editingProfile.value.realName,
    age: editingProfile.value.age,
    gender: editingProfile.value.gender as any,
    birthday: editingProfile.value.birthday,
    profession: editingProfile.value.profession,
    bio: editingProfile.value.bio,
    globalSystemPrompt: editingProfile.value.globalSystemPrompt
  })
  showEditProfile.value = false
  await alert('個人資訊已更新', { type: 'success' })
}

const handleCancelEdit = () => {
  showEditProfile.value = false
}

/**
 * 格式化生日輸入（MM-DD 格式）
 * 自動在輸入兩位數字後加上 "-"
 */
const formatBirthdayInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  let value = input.value.replace(/[^0-9]/g, '') // 只保留數字

  if (value.length >= 2) {
    value = value.slice(0, 2) + '-' + value.slice(2, 4)
  }

  editingProfile.value.birthday = value.slice(0, 5) // 限制最多 5 字元（MM-DD）
}

// 更新預設服務商
const handleUpdateDefaultProvider = async () => {
  userStore.updateDefaultProvider(selectedDefaultProvider.value as LLMProvider)
  await alert(`預設 AI 服務商已更新為 ${getProviderConfig(selectedDefaultProvider.value)?.name}`, { type: 'success' })
}

// 更新指定服務商的 API Key
const handleUpdateApiKey = async (provider: string) => {
  const apiKey = apiKeyInputs.value[provider]?.trim() || ''
  const providerName = getProviderConfig(provider)?.name
  const hasExistingKey = userStore.hasApiKey(provider as LLMProvider)

  // 如果輸入為空，視為清除 API Key
  if (!apiKey) {
    // 如果本來就沒有設定，不做任何事
    if (!hasExistingKey) {
      return
    }

    // 如果是預設服務商，不能清除
    if (userStore.defaultProvider === provider) {
      await alert(`無法清除預設服務商的 API Key，請先切換預設服務商`, { type: 'warning' })
      // 還原輸入框的值
      apiKeyInputs.value[provider] = userStore.getApiKey(provider as LLMProvider)
      return
    }

    // 確認是否要清除
    const confirmed = await confirm(`確定要清除 ${providerName} 的 API Key 嗎？`, {
      confirmText: '清除',
      cancelText: '取消'
    })

    if (!confirmed) {
      // 還原輸入框的值
      apiKeyInputs.value[provider] = userStore.getApiKey(provider as LLMProvider)
      return
    }

    userStore.updateProviderApiKey(provider as LLMProvider, '')
    await alert(`${providerName} API Key 已清除`, { type: 'success' })
    return
  }

  // 正常更新 API Key
  userStore.updateProviderApiKey(provider as LLMProvider, apiKey)
  await alert(`${providerName} API Key 已更新`, { type: 'success' })
}

// 驗證指定服務商的 API Key
const handleValidateApiKey = async (provider: string) => {
  const apiKey = apiKeyInputs.value[provider]?.trim()

  if (!apiKey) {
    await alert('請先輸入 API Key', { type: 'warning' })
    return
  }

  // 檢查服務商是否已實作
  if (!isProviderImplemented(provider)) {
    await alert(`${getProviderConfig(provider)?.name} 尚未支援，敬請期待`, { type: 'warning' })
    return
  }

  try {
    isValidatingApiKey.value[provider] = true

    const adapter = getAdapter(provider as LLMProvider)
    const result = await adapter.validateApiKey(apiKey)

    if (result.valid) {
      await alert('API Key 有效且可正常使用', { type: 'success' })
    } else {
      await alert(result.error || 'API Key 無效', { type: 'danger' })
    }
  } catch (error) {
    await alert('檢測失敗，請稍後再試', { type: 'danger' })
    console.error('API Key 檢測錯誤:', error)
  } finally {
    isValidatingApiKey.value[provider] = false
  }
}

const handleExportData = () => {
  // 讀取記憶/情境追蹤資料
  const memoryTracking = localStorage.getItem('ai-chat-memory-tracking')
  const contextTracking = localStorage.getItem('ai-chat-context-tracking')

  const data = {
    user: userStore.profile,
    characters: characterStore.characters,
    chatRooms: chatRoomStore.chatRooms,
    messages: chatRoomStore.messages,  // 匯出聊天訊息
    memories: {
      characterMemories: memoriesStore.characterMemories,
      roomMemories: memoriesStore.roomMemories
    },
    relationships: {
      userToCharacter: relationshipsStore.userToCharacter,
      characterToCharacter: relationshipsStore.characterToCharacter
    },
    // 記憶/情境處理追蹤資料
    tracking: {
      memory: memoryTracking ? JSON.parse(memoryTracking) : {},
      context: contextTracking ? JSON.parse(contextTracking) : {}
    },
    // 動態牆資料
    feed: {
      posts: feedStore.posts,
      notifications: feedStore.notifications,
      lastDailyCatchup: feedStore.lastDailyCatchup,
      characterLastFeedCheck: feedStore.characterLastFeedCheck,
      lastEventTrigger: feedStore.lastEventTrigger
    }
  }

  // 編碼備份資料（防止明文洩露角色設定）
  const encodedData = encodeBackupData(data as Record<string, unknown>)
  const blob = new Blob([encodedData], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ai-chat-backup-${new Date().toISOString().split('T')[0]}.aichat`
  a.click()
  URL.revokeObjectURL(url)
}

const handleImportData = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const fileContent = e.target?.result as string
        // 解碼備份資料（自動支援舊版 JSON 格式向下相容）
        const data = decodeBackupData(fileContent) as BackupData

        if (await confirm('確定要匯入資料嗎？這會覆蓋現有資料！', { type: 'warning' })) {
          // 還原使用者資料
          if (data.user) userStore.setProfile(data.user)

          // 還原角色資料
          if (data.characters) {
            characterStore.clearCharacters()
            data.characters.forEach((char: any) => {
              characterStore.addCharacter(char)
            })
          }

          // 還原聊天室資料
          if (data.chatRooms || data.messages) {
            chatRoomStore.$patch({
              chatRooms: data.chatRooms || [],
              messages: data.messages || {}
            })
          }

          // 還原記憶資料
          if (data.memories) {
            memoriesStore.$patch({
              characterMemories: data.memories.characterMemories || {},
              roomMemories: data.memories.roomMemories || {}
            })
          }

          // 還原關係資料
          if (data.relationships) {
            relationshipsStore.$patch({
              userToCharacter: data.relationships.userToCharacter || [],
              characterToCharacter: data.relationships.characterToCharacter || []
            })
          }

          // 還原記憶/情境處理追蹤資料
          if (data.tracking) {
            if (data.tracking.memory) {
              localStorage.setItem('ai-chat-memory-tracking', JSON.stringify(data.tracking.memory))
            }
            if (data.tracking.context) {
              localStorage.setItem('ai-chat-context-tracking', JSON.stringify(data.tracking.context))
            }
          }

          // 還原動態牆資料
          if (data.feed) {
            feedStore.$patch({
              posts: data.feed.posts || [],
              notifications: data.feed.notifications || [],
              lastDailyCatchup: data.feed.lastDailyCatchup || null,
              characterLastFeedCheck: data.feed.characterLastFeedCheck || {},
              lastEventTrigger: data.feed.lastEventTrigger || {}
            })
          }

          // 遷移舊版本的記憶資料（如果有）
          memoriesStore.migrateLegacyRoomMemories(chatRoomStore.chatRooms)

          // 為沒有作息設定的角色加上預設作息
          characterStore.migrateCharacterSchedules()

          // 遷移舊版 apiConfig 到 llmSettings
          userStore.migrateApiConfig()

          await alert('匯入成功！', { type: 'success' })
          window.location.reload()
        }
      } catch (error) {
        await alert('匯入失敗：檔案格式錯誤', { type: 'danger' })
      }
    }
    reader.readAsText(file)
  }
}

// ========== 儲存空間管理 ==========
const showStorageDetail = ref(false)
const cleanupKeepCount = ref(60) // 預設保留最近 60 則
const exportFormat = ref<'md' | 'json'>('md') // 匯出格式

/** 計算 LocalStorage 各 key 的使用量 */
/**
 * 偵測 LocalStorage 的真實容量上限（字元數）
 * 使用二分搜尋法，在不破壞現有資料的前提下測試可寫入的最大容量
 * 結果會快取，避免每次 computed 都重測
 */
const detectedQuotaChars = ref(0)

function detectLocalStorageQuota(): number {
  const testKey = '__storage_quota_test__'
  // 先計算目前已用的字元數（所有 key + value 的 length）
  let currentChars = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    currentChars += key.length + (localStorage.getItem(key)?.length || 0)
  }
  // 二分搜尋剩餘可用空間
  let low = 0
  let high = 15 * 1024 * 1024 // 最多測到 15M 字元
  while (high - low > 1024) {
    const mid = Math.floor((low + high) / 2)
    try {
      localStorage.setItem(testKey, 'a'.repeat(mid))
      low = mid
    } catch {
      high = mid
    }
  }
  localStorage.removeItem(testKey)
  return currentChars + low
}

// 初始化時偵測一次
try {
  detectedQuotaChars.value = detectLocalStorageQuota()
} catch {
  detectedQuotaChars.value = 5 * 1024 * 1024 // 偵測失敗時預設 5MB
}

const storageUsage = computed(() => {
  const keys = [
    { key: 'ai-chat-user', label: '使用者資料' },
    { key: 'ai-chat-characters', label: '好友資料' },
    { key: 'ai-chat-rooms', label: '聊天室與訊息' },
    { key: 'ai-chat-memories', label: '記憶系統' },
    { key: 'ai-chat-relationships', label: '關係資料' },
    { key: 'ai-chat-feed', label: '動態牆' },
    { key: 'ai-chat-settings', label: '設定' },
  ]
  // localStorage 的限制是以「字元數」計算，不是 UTF-8 位元組
  let totalChars = 0
  const details = keys.map(({ key, label }) => {
    const data = localStorage.getItem(key) || ''
    const chars = key.length + data.length
    totalChars += chars
    return { key, label, chars, sizeKB: Math.round(chars / 1024) }
  })
  // 加上其他未列出的 ai-chat key
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('ai-chat-') && !keys.find(d => d.key === k)) {
      const data = localStorage.getItem(k) || ''
      const chars = k.length + data.length
      totalChars += chars
      details.push({ key: k, label: k, chars, sizeKB: Math.round(chars / 1024) })
    }
  }
  const quotaChars = detectedQuotaChars.value
  const quotaMB = (quotaChars / 1024 / 1024).toFixed(1)
  return {
    totalChars,
    totalKB: Math.round(totalChars / 1024),
    totalMB: (totalChars / 1024 / 1024).toFixed(2),
    details: details.sort((a, b) => b.chars - a.chars),
    quotaMB,
    usagePercent: Math.min(100, Math.round((totalChars / quotaChars) * 100))
  }
})

/** 各聊天室訊息統計 */
const messageStats = computed(() => chatRoomStore.getMessageStats())

/** 總訊息數 */
const totalMessageCount = computed(() => messageStats.value.reduce((sum, s) => sum + s.messageCount, 0))

/** 將訊息格式化為 Markdown */
function formatMessagesToMarkdown(roomName: string, messages: Message[]): string {
  const exportDate = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
  const lines: string[] = [
    `# ${roomName} - 聊天記錄`,
    '',
    `> 匯出時間：${exportDate}`,
    `> 訊息數量：${messages.length} 則`,
    '',
    '---',
    ''
  ]

  let lastDate = ''
  for (const msg of messages) {
    // 日期分隔線
    const msgDate = new Date(msg.timestamp).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
    if (msgDate !== lastDate) {
      lines.push(`## ${msgDate}`, '')
      lastDate = msgDate
    }

    const time = new Date(msg.timestamp).toLocaleTimeString('zh-TW', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit',
      minute: '2-digit'
    })

    if (msg.type === 'system') {
      // 系統訊息
      lines.push(`*\`${time}\` ── ${msg.content} ──*`, '')
    } else {
      // 一般訊息
      const sender = msg.senderId === 'user' ? `**${msg.senderName}**` : `**${msg.senderName}**`
      lines.push(`\`${time}\` ${sender}`, '')
      // 訊息內容（保留換行，每行加 > 引用）
      const contentLines = msg.content.split('\n')
      for (const line of contentLines) {
        lines.push(`> ${line}`)
      }
      // 圖片附件
      if (msg.images && msg.images.length > 0) {
        lines.push(`> 📷 *（${msg.images.length} 張圖片）*`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

/** 匯出單一聊天室的訊息 */
const handleExportRoomMessages = async (roomId: string, roomName: string) => {
  const roomMessages = chatRoomStore.getMessages(roomId)
  if (roomMessages.length === 0) {
    await alert('這個聊天室沒有訊息', { type: 'warning' })
    return
  }
  const dateStr = new Date().toISOString().split('T')[0]
  let blob: Blob
  let filename: string

  if (exportFormat.value === 'md') {
    const markdown = formatMessagesToMarkdown(roomName, roomMessages)
    blob = new Blob([markdown], { type: 'text/markdown; charset=utf-8' })
    filename = `chat-${roomName}-${dateStr}.md`
  } else {
    const data = JSON.stringify({
      roomName,
      exportedAt: new Date().toISOString(),
      messageCount: roomMessages.length,
      messages: roomMessages
    }, null, 2)
    blob = new Blob([data], { type: 'application/json; charset=utf-8' })
    filename = `chat-${roomName}-${dateStr}.json`
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 清理單一聊天室的舊訊息 */
const handleCleanupRoomMessages = async (roomId: string, roomName: string, currentCount: number) => {
  if (currentCount <= cleanupKeepCount.value) {
    await alert(`「${roomName}」目前只有 ${currentCount} 則訊息，不需要清理`, { type: 'warning' })
    return
  }
  const deleteCount = currentCount - cleanupKeepCount.value
  const confirmed = await confirm(
    `確定要清理「${roomName}」的舊訊息嗎？\n\n將刪除最早的 ${deleteCount} 則訊息，保留最近 ${cleanupKeepCount.value} 則。`,
    { type: 'warning', confirmText: '清理', cancelText: '取消' }
  )
  if (confirmed) {
    chatRoomStore.deleteOldMessages(roomId, cleanupKeepCount.value)
    await alert(`已清理 ${deleteCount} 則舊訊息`, { type: 'success' })
  }
}

/** 批次清理所有聊天室的舊訊息 */
const handleCleanupAllMessages = async () => {
  const roomsToClean = messageStats.value.filter(s => s.messageCount > cleanupKeepCount.value)
  if (roomsToClean.length === 0) {
    await alert(`所有聊天室的訊息都在 ${cleanupKeepCount.value} 則以內，不需要清理`, { type: 'warning' })
    return
  }
  const totalDelete = roomsToClean.reduce((sum, s) => sum + (s.messageCount - cleanupKeepCount.value), 0)
  const confirmed = await confirm(
    `確定要批次清理 ${roomsToClean.length} 個聊天室的舊訊息嗎？\n\n每個聊天室保留最近 ${cleanupKeepCount.value} 則，共將刪除 ${totalDelete} 則訊息。`,
    { type: 'warning', confirmText: '批次清理', cancelText: '取消' }
  )
  if (confirmed) {
    roomsToClean.forEach(s => chatRoomStore.deleteOldMessages(s.roomId, cleanupKeepCount.value))
    await alert(`已清理 ${totalDelete} 則舊訊息`, { type: 'success' })
  }
}

/** 動態牆清理天數 */
const feedCleanupDays = ref(7)

/** 動態牆貼文數 */
const feedPostCount = computed(() => feedStore.posts?.length || 0)

/** 清理動態牆舊貼文 */
const handleCleanupFeed = async () => {
  if (feedPostCount.value === 0) {
    await alert('目前沒有任何動態', { type: 'warning' })
    return
  }
  const cutoffTime = Date.now() - feedCleanupDays.value * 24 * 60 * 60 * 1000
  const oldCount = feedStore.posts.filter(p => p.timestamp < cutoffTime).length
  if (oldCount === 0) {
    await alert(`沒有超過 ${feedCleanupDays.value} 天的動態`, { type: 'warning' })
    return
  }
  const confirmed = await confirm(
    `確定要清理 ${oldCount} 則超過 ${feedCleanupDays.value} 天的動態嗎？`,
    { type: 'warning', confirmText: '清理', cancelText: '取消' }
  )
  if (confirmed) {
    feedStore.clearOldPosts(feedCleanupDays.value)
    await alert(`已清理 ${oldCount} 則舊動態`, { type: 'success' })
  }
}

/** 清除所有動態牆資料 */
const handleClearAllFeed = async () => {
  if (feedPostCount.value === 0) {
    await alert('目前沒有任何動態', { type: 'warning' })
    return
  }
  const confirmed = await confirmDanger(
    `確定要清除所有動態牆資料嗎？（共 ${feedPostCount.value} 則動態）`
  )
  if (confirmed) {
    feedStore.clearAll()
    await alert('已清除所有動態牆資料', { type: 'success' })
  }
}

const handleClearData = async () => {
  if (await confirmDanger('確定要清除所有資料嗎？此操作無法復原！')) {
    if (await confirmDanger('再次確認：真的要清除所有資料嗎？')) {
      characterStore.clearCharacters()
      chatRoomStore.clearAllData()
      userStore.clearProfile()
      router.push('/onboarding')
    }
  }
}

// Google Drive 相關功能
const handleGoogleConnect = async () => {
  try {
    await googleAuthService.requestAuth()
    checkGoogleConnection()
    await alert('Google Drive 連線成功！', { type: 'success' })
  } catch (error) {
    console.error('Google Drive 連線失敗:', error)
    await alert('Google Drive 連線失敗，請稍後再試', { type: 'danger' })
  }
}

const handleGoogleDisconnect = async () => {
  if (await confirm('確定要中斷 Google Drive 連線嗎？')) {
    googleAuthService.signOut()
    checkGoogleConnection()
    await alert('已中斷 Google Drive 連線', { type: 'success' })
  }
}

const handleGoogleBackup = async () => {
  try {
    isSyncing.value = true

    // 確保已連線
    if (!isGoogleConnected.value) {
      await handleGoogleConnect()
    }

    // 讀取記憶/情境追蹤資料
    const memoryTracking = localStorage.getItem('ai-chat-memory-tracking')
    const contextTracking = localStorage.getItem('ai-chat-context-tracking')

    // 準備備份資料（包含完整資料）
    const data = {
      user: userStore.profile,
      characters: characterStore.characters,
      chatRooms: chatRoomStore.chatRooms,
      messages: chatRoomStore.messages,  // 包含聊天訊息
      memories: {
        characterMemories: memoriesStore.characterMemories,
        roomMemories: memoriesStore.roomMemories
      },
      relationships: {
        userToCharacter: relationshipsStore.userToCharacter,
        characterToCharacter: relationshipsStore.characterToCharacter
      },
      // 記憶/情境處理追蹤資料
      tracking: {
        memory: memoryTracking ? JSON.parse(memoryTracking) : {},
        context: contextTracking ? JSON.parse(contextTracking) : {}
      },
      // 動態牆資料
      feed: {
        posts: feedStore.posts,
        notifications: feedStore.notifications,
        lastDailyCatchup: feedStore.lastDailyCatchup,
        characterLastFeedCheck: feedStore.characterLastFeedCheck,
        lastEventTrigger: feedStore.lastEventTrigger
      },
      timestamp: new Date().toISOString()
    }

    // 上傳到 Google Drive
    await googleDriveService.uploadBackup(data)
    await alert('備份到 Google Drive 成功！', { type: 'success' })
  } catch (error) {
    console.error('備份失敗:', error)

    await alert('備份失敗：' + (error as Error).message, { type: 'danger' })

    // 標記為連線中斷
    isSyncing.value = false
    isGoogleConnected.value = false;

    // 詢問使用者是否要重新授權
    const shouldReauth = await confirm('Google Drive 授權已失效，是否要重新授權並繼續備份？', { type: 'warning' })
    if (shouldReauth) {
      try {
        googleAuthService.signOut()
        await googleAuthService.requestAuth()
        checkGoogleConnection()
        // 重新授權成功，重試備份
        if (isGoogleConnected.value) {
          await alert('重新授權成功！即將重新執行備份。', { type: 'success' })
          await handleGoogleBackup()
          return  // 避免 finally 再次設定 isSyncing = false
        }
      } catch (reauthError) {
        await alert('重新授權失敗：' + (reauthError as Error).message, { type: 'danger' })
      }
    }

  } finally {
    isSyncing.value = false
  }
}

const handleGoogleRestore = async () => {
  try {
    isSyncing.value = true

    // 確保已連線
    if (!isGoogleConnected.value) {
      await handleGoogleConnect()
    }

    if (!await confirm('確定要從 Google Drive 還原資料嗎？這會覆蓋現有資料！', { type: 'warning' })) {
      return
    }

    // 從 Google Drive 下載
    const data = await googleDriveService.downloadBackup()

    // 還原資料（包含完整資料）
    if (data.user) userStore.setProfile(data.user)

    if (data.characters) {
      characterStore.clearCharacters()
      data.characters.forEach((char: any) => {
        characterStore.addCharacter(char)
      })
    }

    if (data.chatRooms || data.messages) {
      chatRoomStore.$patch({
        chatRooms: data.chatRooms || [],
        messages: data.messages || {}
      })
    }

    // 還原記憶資料
    if (data.memories) {
      memoriesStore.$patch({
        characterMemories: data.memories.characterMemories || {},
        roomMemories: data.memories.roomMemories || {}
      })
    }

    // 還原關係資料
    if (data.relationships) {
      relationshipsStore.$patch({
        userToCharacter: data.relationships.userToCharacter || [],
        characterToCharacter: data.relationships.characterToCharacter || []
      })
    }

    // 還原記憶/情境處理追蹤資料
    if (data.tracking) {
      if (data.tracking.memory) {
        localStorage.setItem('ai-chat-memory-tracking', JSON.stringify(data.tracking.memory))
      }
      if (data.tracking.context) {
        localStorage.setItem('ai-chat-context-tracking', JSON.stringify(data.tracking.context))
      }
    }

    // 還原動態牆資料
    if (data.feed) {
      feedStore.$patch({
        posts: data.feed.posts || [],
        notifications: data.feed.notifications || [],
        lastDailyCatchup: data.feed.lastDailyCatchup || null,
        characterLastFeedCheck: data.feed.characterLastFeedCheck || {},
        lastEventTrigger: data.feed.lastEventTrigger || {}
      })
    }

    // 遷移舊版 apiConfig 到 llmSettings
    userStore.migrateApiConfig()

    await alert('從 Google Drive 還原成功！', { type: 'success' })
    window.location.reload()
  } catch (error) {
    console.error('還原失敗:', error)

    // 標記為連線中斷
    isSyncing.value = false
    isGoogleConnected.value = false;

    // 詢問使用者是否要重新授權
    const shouldReauth = await confirm('Google Drive 授權已失效，是否要重新授權並繼續還原？', { type: 'warning' })
    if (shouldReauth) {
      try {
        googleAuthService.signOut()
        await googleAuthService.requestAuth()
        checkGoogleConnection()

        // 重新授權成功，重試還原
        if (isGoogleConnected.value) {
          await alert('重新授權成功！即將重新執行還原。', { type: 'success' })
          await handleGoogleRestore()
          return  // 避免 finally 再次設定 isSyncing = false
        }
      } catch (reauthError) {
        await alert('重新授權失敗：' + (reauthError as Error).message, { type: 'danger' })
      }
    }

  } finally {
    isSyncing.value = false
  }
}
</script>

<template>
  <PageHeader title="設定" />
  <div class="page">

    <!-- 使用者資訊 -->
    <div class="settings-section">
      <div class="section-header">
        <h3>使用者資訊</h3>
        <button class="btn btn-warning" @click="handleEditProfile">編輯</button>
      </div>

      <div v-if="!showEditProfile" class="user-info">
        <div class="user-avatar clickable" @click="handleAvatarClick" title="更換頭像">
          <img :src="userStore.userAvatar" alt="頭像">
          <div class="avatar-edit-overlay">
            <Camera :size="14" color="white" />
          </div>
        </div>
        <input
          ref="avatarFileInput"
          type="file"
          accept="image/*"
          style="display: none"
          @change="handleAvatarFileChange"
        >
        <div class="user-details">
          <div class="user-name">{{ userStore.userName }}</div>
          <div class="user-meta">
            {{ characterStore.characters.length }} 位好友
          </div>
          <div v-if="userStore.profile?.profession" class="user-meta">
            {{ userStore.profile.profession }}
          </div>
        </div>
      </div>

      <!-- 編輯模式 -->
      <div v-else class="edit-profile-form">
        <div class="form-group">
          <label>暱稱</label>
          <input v-model="editingProfile.nickname" class="input-field" placeholder="暱稱" />
        </div>
        <div class="form-group">
          <label>本名（選填）</label>
          <input v-model="editingProfile.realName" class="input-field" placeholder="本名" />
        </div>
        <div class="form-group">
          <label>年齡（選填）</label>
          <input v-model="editingProfile.age" type="number" min="1" max="9999" class="input-field"
            placeholder="請輸入數字" />
        </div>
        <div class="form-group">
          <label>性別（選填）</label>
          <select v-model="editingProfile.gender" class="input-field">
            <option value="unset">未設定</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </div>
        <div class="form-group">
          <label>生日（選填）</label>
          <input v-model="editingProfile.birthday" class="input-field" placeholder="MM-DD（例如：03-14）"
            maxlength="5" @input="formatBirthdayInput" />
          <p class="form-hint">填寫後，生日當天好感度達到「朋友」以上的好友會自動發送祝福</p>
        </div>
        <div class="form-group">
          <label>職業（選填）</label>
          <input v-model="editingProfile.profession" class="input-field" placeholder="職業" />
        </div>
        <div class="form-group">
          <label>簡介（選填，最多250字）</label>
          <textarea v-model="editingProfile.bio" class="input-field" placeholder="簡介" maxlength="250" rows="3" />
          <div class="char-count">{{ editingProfile.bio.length }}/250</div>
        </div>
        <div class="form-group">
          <label>全域自訂 Prompt（選填）</label>
          <textarea v-model="editingProfile.globalSystemPrompt" class="input-field"
            placeholder="這裡的內容會附加在所有角色的 System Prompt 後面，例如：回覆時使用繁體中文、每次回覆不超過100字..." rows="4" maxlength="1000" />
          <div class="char-count">{{ editingProfile.globalSystemPrompt.length }}/1000</div>
          <p class="form-hint">此設定會套用到所有角色對話，無需在每個角色單獨設定</p>
        </div>
        <div class="button-group">
          <button class="btn btn-primary" @click="handleSaveProfile">儲存</button>
          <button class="btn btn-secondary" @click="handleCancelEdit">取消</button>
        </div>
      </div>
    </div>

    <!-- API 設定 -->
    <div class="settings-section">
      <h3>API 設定</h3>

      <!-- 預設服務商選擇 -->
      <div class="form-group">
        <h4>預設 AI 服務商</h4>
        <div v-if="providersWithApiKey.length > 0" class="default-provider-radio-group">
          <label
            v-for="provider in providersWithApiKey"
            :key="provider"
            class="default-provider-item"
            :class="{ selected: selectedDefaultProvider === provider }"
          >
            <input
              type="radio"
              v-model="selectedDefaultProvider"
              :value="provider"
              @change="handleUpdateDefaultProvider"
            >
            <span class="provider-option">
              <b class="provider-icon" :style="{ color: getProviderConfig(provider)?.iconColor }">
                {{ getProviderConfig(provider)?.icon }}
              </b>
              <span class="provider-label">{{ getProviderConfig(provider)?.name }}</span>
            </span>
          </label>
        </div>
        <p v-else class="form-hint warning">請先在下方設定至少一個 API Key</p>
        <p v-if="providersWithApiKey.length > 0" class="form-hint">未設定服務商的好友及記憶生成功能會使用預設的AI服務商</p>
      </div>

      <div class="provider-divider"></div>
      <h4>AI 服務商 API KEY</h4>
      <!-- 檢測說明 -->
      <div class="api-warning">
        ⚠️ 「檢測連線」僅驗證 API Key 是否有效，<b>不保證有剩餘額度</b>，實際額度請至各服務商後台確認。
      </div>
      <!-- Gemini -->
      <div class="provider-section">
        <div class="provider-header">
          <span class="provider-icon" :style="{ color: getProviderConfig('gemini')?.iconColor }">
            {{ getProviderConfig('gemini')?.icon }}
          </span>
          <span class="provider-name">Gemini</span>
          <span v-if="selectedDefaultProvider === 'gemini'" class="provider-badge default">預設</span>
          <span v-else class="provider-badge">選填</span>
        </div>
        <div class="api-key-input">
          <input
            v-model="apiKeyInputs.gemini"
            :type="showApiKey.gemini ? 'text' : 'password'"
            class="input-field"
            placeholder="輸入你的 Gemini API Key"
          >
          <button class="btn btn-info" @click="showApiKey.gemini = !showApiKey.gemini">
            <EyeOff v-if="showApiKey.gemini" :size="18" />
            <Eye v-else :size="18" />
          </button>
        </div>
        <div class="button-group">
          <button class="btn-primary btn" @click="handleUpdateApiKey('gemini')">更新</button>
          <button class="btn-info btn" @click="handleValidateApiKey('gemini')" :disabled="isValidatingApiKey.gemini">
            {{ isValidatingApiKey.gemini ? '檢測中...' : '檢測連線' }}
          </button>
        </div>
        <p class="provider-models">主要對話：{{ getProviderConfig('gemini')?.mainModelDisplay }} ／ 其他功能：{{ getProviderConfig('gemini')?.liteModelDisplay }}</p>
        <p class="api-key-hint">
          💡 <a :href="getProviderConfig('gemini')?.consoleUrl" target="_blank" rel="noopener noreferrer">前往 Google AI Studio</a> 查看額度
        </p>
      </div>

      <div class="provider-divider"></div>

      <!-- Claude -->
      <div class="provider-section">
        <div class="provider-header">
          <span class="provider-icon" :style="{ color: getProviderConfig('claude')?.iconColor }">
            {{ getProviderConfig('claude')?.icon }}
          </span>
          <span class="provider-name">Claude</span>
          <span v-if="selectedDefaultProvider === 'claude'" class="provider-badge default">預設</span>
          <span v-else class="provider-badge">選填</span>
        </div>
        <div class="api-key-input">
          <input
            v-model="apiKeyInputs.claude"
            :type="showApiKey.claude ? 'text' : 'password'"
            class="input-field"
            placeholder="輸入你的 Claude API Key"
          >
          <button class="btn btn-info" @click="showApiKey.claude = !showApiKey.claude">
            <EyeOff v-if="showApiKey.claude" :size="18" />
            <Eye v-else :size="18" />
          </button>
        </div>
        <div class="button-group">
          <button class="btn-primary btn" @click="handleUpdateApiKey('claude')">更新</button>
          <button class="btn-info btn" @click="handleValidateApiKey('claude')" :disabled="isValidatingApiKey.claude">
            {{ isValidatingApiKey.claude ? '檢測中...' : '檢測連線' }}
          </button>
        </div>
        <p class="provider-models">主要對話：{{ getProviderConfig('claude')?.mainModelDisplay }} ／ 其他功能：{{ getProviderConfig('claude')?.liteModelDisplay }}</p>
        <p class="api-key-hint">
          💡 <a :href="getProviderConfig('claude')?.consoleUrl" target="_blank" rel="noopener noreferrer">前往 Anthropic Console</a> 查看額度
        </p>
      </div>

      <div class="provider-divider"></div>

      <!-- OpenAI -->
      <div class="provider-section">
        <div class="provider-header">
          <span class="provider-icon" :style="{ color: getProviderConfig('openai')?.iconColor }">
            {{ getProviderConfig('openai')?.icon }}
          </span>
          <span class="provider-name">OpenAI</span>
          <span v-if="selectedDefaultProvider === 'openai'" class="provider-badge default">預設</span>
          <span v-else class="provider-badge">選填</span>
        </div>
        <div class="api-key-input">
          <input
            v-model="apiKeyInputs.openai"
            :type="showApiKey.openai ? 'text' : 'password'"
            class="input-field"
            placeholder="輸入你的 OpenAI API Key"
          >
          <button class="btn btn-info" @click="showApiKey.openai = !showApiKey.openai">
            <EyeOff v-if="showApiKey.openai" :size="18" />
            <Eye v-else :size="18" />
          </button>
        </div>
        <div class="button-group">
          <button class="btn-primary btn" @click="handleUpdateApiKey('openai')">更新</button>
          <button class="btn-info btn" @click="handleValidateApiKey('openai')" :disabled="isValidatingApiKey.openai">
            {{ isValidatingApiKey.openai ? '檢測中...' : '檢測連線' }}
          </button>
        </div>
        <p class="provider-models">主要對話：{{ getProviderConfig('openai')?.mainModelDisplay }} ／ 其他功能：{{ getProviderConfig('openai')?.liteModelDisplay }}</p>
        <p class="api-key-hint">
          💡 <a :href="getProviderConfig('openai')?.consoleUrl" target="_blank" rel="noopener noreferrer">前往 OpenAI Platform</a> 查看額度（GPT-4.1 mini 有免費額度 40K TPM）
        </p>
      </div>

      <div class="provider-divider"></div>

      <!-- Grok (尚未實作) -->
      <div class="provider-section disabled">
        <div class="provider-header">
          <span class="provider-icon" :style="{ color: getProviderConfig('grok')?.iconColor }">
            {{ getProviderConfig('grok')?.icon }}
          </span>
          <span class="provider-name">Grok</span>
          <span class="provider-badge coming-soon">即將支援</span>
        </div>
        <div class="api-key-input">
          <input
            v-model="apiKeyInputs.grok"
            :type="showApiKey.grok ? 'text' : 'password'"
            class="input-field"
            placeholder="輸入你的 Grok API Key"
            disabled
          >
          <button class="btn btn-info" disabled>
            <Eye :size="18" />
          </button>
        </div>
        <p class="provider-models">主要對話：{{ getProviderConfig('grok')?.mainModelDisplay }} ／ 其他功能：{{ getProviderConfig('grok')?.liteModelDisplay }}</p>
      </div>      
    </div>

    <!-- Google Drive 同步 -->
    <div class="settings-section">
      <h3>Google Drive 同步</h3>
      <div class="google-drive-section">
        <div class="connection-status">
          <span class="status-icon">{{ isGoogleConnected ? '🟢' : '⚪' }}</span>
          <span class="status-text">
            {{ isGoogleConnected ? 'Google Drive 已連線' : 'Google Drive 未連線' }}
          </span>
        </div>

        <div class="action-list">
          <button v-if="!isGoogleConnected" class="action-btn" @click="handleGoogleConnect" :disabled="isSyncing">
            <span class="action-icon">🔗</span>
            <div class="action-text">
              <div class="action-title">連線 Google Drive</div>
              <div class="action-desc">授權連線到你的 Google Drive</div>
            </div>
          </button>

          <button v-else class="action-btn" @click="handleGoogleDisconnect" :disabled="isSyncing">
            <span class="action-icon">🔌</span>
            <div class="action-text">
              <div class="action-title">中斷連線</div>
              <div class="action-desc">取消 Google Drive 授權</div>
            </div>
          </button>

          <button class="action-btn" @click="handleGoogleBackup" :disabled="isSyncing || !isGoogleConnected">
            <span class="action-icon">☁️</span>
            <div class="action-text">
              <div class="action-title">{{ isSyncing ? '備份中...' : '備份到 Google Drive' }}</div>
              <div class="action-desc">將資料備份到雲端</div>
            </div>
          </button>

          <button class="action-btn" @click="handleGoogleRestore" :disabled="isSyncing || !isGoogleConnected">
            <span class="action-icon">📥</span>
            <div class="action-text">
              <div class="action-title">{{ isSyncing ? '還原中...' : '從 Google Drive 還原' }}</div>
              <div class="action-desc">從雲端還原資料</div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- 儲存空間管理 -->
    <div class="settings-section">
      <h3>儲存空間管理</h3>

      <!-- 使用量概覽 -->
      <div class="storage-overview">
        <div class="storage-bar-container">
          <div class="storage-bar" :style="{ width: storageUsage.usagePercent + '%' }"
            :class="{ warning: storageUsage.usagePercent > 70, danger: storageUsage.usagePercent > 90 }">
          </div>
        </div>
        <div class="storage-info">
          <span class="storage-used">{{ storageUsage.totalMB }} MB</span>
          <span class="storage-total">/ {{ storageUsage.quotaMB }} MB 上限（{{ storageUsage.usagePercent }}%）</span>
        </div>
      </div>

      <!-- 展開詳細 -->
      <button class="storage-toggle-btn" @click="showStorageDetail = !showStorageDetail">
        <span>各項資料佔用明細</span>
        <ChevronUp v-if="showStorageDetail" :size="16" />
        <ChevronDown v-else :size="16" />
      </button>

      <div v-if="showStorageDetail" class="storage-details">
        <div v-for="item in storageUsage.details" :key="item.key" class="storage-detail-row">
          <span class="storage-detail-label">{{ item.label }}</span>
          <span class="storage-detail-size">{{ item.sizeKB }} KB</span>
        </div>
      </div>

      <!-- 聊天訊息統計 -->
      <div class="storage-messages-section">
        <div class="section-header">
          <h4>聊天訊息（共 {{ totalMessageCount }} 則）</h4>
          <div class="export-format-selector">
            <label>匯出格式</label>
            <select v-model="exportFormat" class="input-field cleanup-select">
              <option value="md">Markdown</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>

        <div v-if="messageStats.length === 0" class="empty-hint">還沒有任何聊天室</div>

        <div v-else class="message-stats-list">
          <div v-for="stat in messageStats" :key="stat.roomId" class="message-stat-item">
            <div class="stat-info">
              <span class="stat-name">
                {{ stat.roomType === 'group' ? '👥' : '💬' }}
                {{ stat.roomName }}
              </span>
              <span class="stat-count">{{ stat.messageCount }} 則 ≈ {{ stat.estimatedSizeKB }} KB</span>
            </div>
            <div class="stat-actions">
              <button class="btn-sm btn-ghost" @click="handleExportRoomMessages(stat.roomId, stat.roomName)"
                title="匯出訊息">
                💾
              </button>
              <button class="btn-sm btn-ghost" @click="handleCleanupRoomMessages(stat.roomId, stat.roomName, stat.messageCount)"
                title="清理舊訊息" :disabled="stat.messageCount <= cleanupKeepCount">
                🧹
              </button>
            </div>
          </div>
        </div>

        <!-- 批次清理 -->
        <div v-if="messageStats.length > 0" class="cleanup-controls">
          <div class="cleanup-setting">
            <label>每個聊天室保留最近</label>
            <select v-model.number="cleanupKeepCount" class="input-field cleanup-select">
              <option :value="30">30 則</option>
              <option :value="60">60 則</option>
              <option :value="100">100 則</option>
              <option :value="200">200 則</option>
              <option :value="500">500 則</option>
            </select>
          </div>
          <button class="btn btn-warning" @click="handleCleanupAllMessages">
            🧹 批次清理所有聊天室
          </button>
        </div>
      </div>

      <!-- 動態牆清理 -->
      <div class="storage-messages-section">
        <div class="section-header">
          <h4>動態牆（共 {{ feedPostCount }} 則）</h4>
        </div>

        <div v-if="feedPostCount === 0" class="empty-hint">目前沒有任何動態</div>

        <div v-else class="cleanup-controls">
          <div class="cleanup-setting">
            <label>清理超過</label>
            <select v-model.number="feedCleanupDays" class="input-field cleanup-select">
              <option :value="3">3 天</option>
              <option :value="7">7 天</option>
              <option :value="14">14 天</option>
              <option :value="30">30 天</option>
            </select>
            <label>的動態</label>
          </div>
          <div class="button-group">
            <button class="btn btn-warning" @click="handleCleanupFeed">
              🧹 清理舊動態
            </button>
            <button class="btn btn-danger" @click="handleClearAllFeed">
              🗑️ 清除全部
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 資料管理 -->
    <div class="settings-section">
      <h3>本地資料管理</h3>
      <div class="action-list">
        <button class="action-btn" @click="handleExportData">
          <span class="action-icon">💾</span>
          <div class="action-text">
            <div class="action-title">匯出資料</div>
            <div class="action-desc">備份所有資料到本地檔案</div>
          </div>
        </button>

        <label class="action-btn">
          <span class="action-icon">📤</span>
          <div class="action-text">
            <div class="action-title">匯入資料</div>
            <div class="action-desc">從本地檔案還原資料</div>
          </div>
          <input type="file" accept=".aichat,.json" style="display: none" @change="handleImportData">
        </label>

        <button class="action-btn danger" @click="handleClearData">
          <span class="action-icon">🗑️</span>
          <div class="action-text">
            <div class="action-title">清除所有資料</div>
            <div class="action-desc">刪除所有資料並重新開始</div>
          </div>
        </button>
      </div>
    </div>

    <!-- 關於 -->
    <div class="settings-section">
      <div class="about-info">
        <div class="about-header">
          <img src="/logo.svg" alt="愛茶的 AI Chat Logo" class="app-logo" />
          <div class="header-text">
            <h4>愛茶的 AI Chat</h4>
            <span class="version-badge">v{{ currentVersion }}</span>
          </div>
        </div>
        <p class="about-desc">
          和專屬於你的 AI 夥伴們泡茶聊天，建立美好的互動記憶。
        </p>

        <div class="about-links">
          <a href="https://github.com/wuguofish/my-ai-chat" target="_blank" class="link-btn">
            <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
              <path
                d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z">
              </path>
            </svg>
            GitHub Repository
          </a>
          <a href="https://wuguofish.github.io/my-ai-chat/CHANGELOG.md" target="_blank" class="link-btn">
            <span>📝</span> 完整更新履歷
          </a>
          <button @click="clearCacheAndReload" class="link-btn">
            <span>🔄</span> 清除快取並重新載入
          </button>
          <a href="https://portaly.cc/atone0331/support" target="_blank" class="link-btn">
            <span>💟</span> Donate
          </a>
        </div>

        <div v-if="versionInfo" class="changelog">
          <h5>最新更新 (v{{ currentVersion }})</h5>
          <ul>
            <li v-for="(feature, index) in versionInfo.features" :key="index">
              {{ feature }}
            </li>
          </ul>
        </div>

        <div class="about-tech">
          <p><strong>技術架構</strong></p>
          <div class="tech-tags">
            <span class="tech-tag">Vue 3</span>
            <span class="tech-tag">TypeScript</span>
            <span class="tech-tag">Pinia</span>
            <span class="tech-tag">Gemini 2.5</span>
          </div>
          <p><strong>AI協作者</strong></p>
          <div class="tech-tags">
            <span class="tech-tag">Claude Code</span>
          </div>
          <p><strong>靈感來源</strong></p>
          <div class="tech-tags">
            <span class="tech-tag"><a href="https://mochi-sable.vercel.app/" target="_blank">麻糬</a></span>
            <span>非常感謝麻糬的原作者<a href="https://www.threads.com/@iewiepeity_" target="_blank">緹緹</a>，同意本專案延伸麻糬的概念，寫出新的AI RP 平台。</span>
          </div>
        </div>
      </div>
    </div>
    <!-- 頭像裁剪器 -->
    <AvatarCropper
      v-if="showAvatarCropper"
      :image="originalAvatarImage"
      @confirm="handleAvatarCropConfirm"
      @cancel="handleAvatarCropCancel"
    />
  </div>
</template>

<style scoped>

.changelog{
  padding: 1rem;
}


.settings-section {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-2xl);
  margin: var(--spacing-xl);
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  box-shadow: var(--shadow);
}

.settings-section h3 {
  font-size: var(--text-xl);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-xl) 0;
}

/* 使用者資訊 */
.user-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
}

.edit-profile-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.char-count {
  text-align: right;
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-xs);
}

.user-avatar {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  overflow: hidden;
  border: 2px solid var(--color-border);
  position: relative;
  flex-shrink: 0;
}

.user-avatar.clickable {
  cursor: pointer;
  transition: border-color var(--transition);
}

.user-avatar.clickable:hover {
  border-color: var(--color-primary);
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-edit-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 24px;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition);
  font-size: 12px;
}

.user-avatar.clickable:hover .avatar-edit-overlay {
  opacity: 1;
}

.user-details {
  flex: 1;
}

.user-name {
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.user-meta {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
}

/* API 設定 */
.api-key-input {
  display: flex;
  position: relative;
  margin-bottom: var(--spacing-md);
}

.api-key-input input {
  flex: 1;
  padding-right: 50px; /* 為按鈕留出空間 */
}

.api-key-input .btn {
  position: absolute;
  right: 1px;
  top: 1px;
  bottom: 1px;
  border-radius: 0 var(--radius) var(--radius) 0;
  min-width: 48px;
  padding: 0 var(--spacing-sm);
}

.api-key-hint {
  margin-top: var(--spacing-md);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.api-key-hint a {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
}

.api-key-hint a:hover {
  text-decoration: underline;
}

/* 服務商區塊 */
.provider-section {
  padding: var(--spacing-lg) 0;
}

.provider-section.disabled {
  opacity: 0.6;
}

.provider-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.provider-icon {
  font-size: var(--text-2xl);
  font-weight: bold;
  width: 32px;
  text-align: center;
}

.provider-name {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}

.provider-badge {
  font-size: var(--text-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

.provider-badge.default {
  background: var(--color-primary);
  color: var(--color-text-white);
}

.provider-badge.coming-soon {
  background: rgba(102, 126, 234, 0.1);
  color: var(--color-primary);
}

.provider-models {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-sm);
  margin-bottom: 0;
}

.provider-divider {
  height: 1px;
  background: var(--color-border);
  margin: var(--spacing-md) 0;
}

/* 預設服務商 radio group */
.default-provider-radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.default-provider-item {
  position: relative;
  cursor: pointer;
}

.default-provider-item input[type="radio"] {
  position: absolute;
  opacity: 0;
  cursor: pointer;
}

.default-provider-item .provider-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  min-width: 70px;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  transition: all var(--transition);
}

.default-provider-item .provider-icon {
  font-size: 20px;
  line-height: 1;
  text-shadow: 1px 1px 9px rgba(255, 255, 255);
}

.default-provider-item .provider-label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.default-provider-item:hover .provider-option {
  border-color: var(--color-primary);
  background: rgba(102, 126, 234, 0.04);
}

.default-provider-item:hover .provider-label {
  color: var(--color-primary);
}

.default-provider-item.selected .provider-option {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.default-provider-item.selected .provider-label {
  color: var(--color-text-white);
}

.default-provider-item.selected .provider-icon {
  filter: brightness(1.2);
}

.form-hint {
  font-size: var(--text-base);
}

.form-hint.warning {
  color: var(--color-warning, #f59e0b);
}

.api-warning {
  margin-top: var(--spacing-xs);
  padding: var(--spacing-md);
  background: rgba(255, 193, 7, 0.1);
  border-radius: var(--radius);
  font-size: var(--text-base);
  color: var(--color-text-secondary);
}

.btn-small {
  padding: var(--spacing-sm) var(--spacing-xl);
  font-size: var(--text-sm);
}

.btn-icon {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

/* Google Drive 同步 */
.google-drive-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
}

.status-icon {
  font-size: 20px;
}

.status-text {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  font-weight: 500;
}

/* 動作列表 */
.action-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
  background: var(--color-bg-secondary);
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all var(--transition);
  text-align: left;
  width: 100%;
  color: var(--color-text-primary);
}

.action-btn:hover {
  background: var(--color-bg-hover);
  transform: translateX(4px);
}

.action-btn.danger:hover {
  background: #ffebee;
  color: #d32f2f;
}

.action-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.action-text {
  flex: 1;
}

.action-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.action-desc {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* 關於 */
.about-info {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.about-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
}

.app-logo {
  width: 128px;
  height: 128px;
  flex-shrink: 0;
}

.header-text {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.about-header h4 {
  font-size: var(--text-2xl);
  color: var(--color-text-primary);
  margin: 0;
}

.version-badge {
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
}

.about-desc {
  margin-bottom: var(--spacing-xl);
  line-height: 1.6;
}

.about-links {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
  flex-wrap: wrap;
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--color-text-primary);
  transition: all var(--transition);
  font-size: var(--text-sm);
}

.link-btn:hover {
  background: var(--color-bg-hover);
  transform: translateY(-2px);
}

.changelog h5 {
  font-size: var(--text-lg);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-md);
}

.changelog ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.changelog li {
  padding: var(--spacing-sm) 0;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.about-tech {
  margin-top: var(--spacing-xl);
  padding-top: var(--spacing-xl);
  border-top: 1px solid var(--color-border);
}

.about-tech p {
  margin-bottom: var(--spacing-md);
}

.tech-tags {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-md);
}

.tech-tag {
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(102, 126, 234, 0.1);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
}

.about-info p {
  margin: 0 0 var(--spacing-sm) 0;
}

.about-info strong {
  color: var(--color-text-primary);
}

/* 儲存空間管理 */
.storage-overview {
  margin-bottom: var(--spacing-lg);
}

.storage-bar-container {
  height: 12px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
}

.storage-bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width 0.5s ease;
  min-width: 2px;
}

.storage-bar.warning {
  background: #f59e0b;
}

.storage-bar.danger {
  background: #ef4444;
}

.storage-info {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-xs);
}

.storage-used {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}

.storage-total {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
}

.storage-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  transition: background var(--transition);
}

.storage-toggle-btn:hover {
  background: var(--color-bg-hover);
}

.storage-details {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
}

.storage-detail-row {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-xs) 0;
  font-size: var(--text-sm);
}

.storage-detail-label {
  color: var(--color-text-secondary);
}

.storage-detail-size {
  color: var(--color-text-primary);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.storage-messages-section {
  margin-top: var(--spacing-xl);
  padding-top: var(--spacing-xl);
  border-top: 1px solid var(--color-border);
}

.storage-messages-section h4 {
  font-size: var(--text-lg);
  color: var(--color-text-primary);
  margin: 0;
}

.export-format-selector {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.empty-hint {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  padding: var(--spacing-md) 0;
}

.message-stats-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

.message-stat-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.stat-name {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-count {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.stat-actions {
  display: flex;
  gap: var(--spacing-xs);
  flex-shrink: 0;
}

.stat-actions .btn-sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 16px;
  line-height: 1;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius);
  transition: background var(--transition);
}

.stat-actions .btn-sm:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.stat-actions .btn-sm:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.cleanup-controls {
  margin-top: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.cleanup-setting {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.cleanup-select {
  width: auto;
  min-width: 90px;
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--text-sm);
}

@media (max-width: 768px) {

  .page {
    padding: 0 var(--spacing-md);
  }

  .api-key-input {
    flex-direction: column;
  }

  .about-links {
    flex-direction: column;
  }

  .message-stat-item {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .stat-actions {
    align-self: flex-end;
  }
}
</style>
