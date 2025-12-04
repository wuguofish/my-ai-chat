<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharacterStore } from '@/stores/characters'
import { useChatRoomsStore } from '@/stores/chatRooms'
import { useUserStore } from '@/stores/user'
import { useRelationshipsStore } from '@/stores/relationships'
import { useMemoriesStore } from '@/stores/memories'
import type { Character } from '@/types'
import {
  formatMessageTime,
  formatMessageForAI,
  formatMessageForDisplay,
  determineRespondingCharacters,
  parseMentionedCharacterIds,
  isCharacterOnline,
  getCharacterStatus,
  shuffle
} from '@/utils/chatHelpers'
import { getCharacterResponse } from '@/services/gemini'
import { generateMemorySummary, extractLongTermMemories } from '@/services/memoryService'
import { ArrowLeft, Send, Copy, Trash2, X, MessageCircle, Bubbles, FileText, Users } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const characterStore = useCharacterStore()
const chatRoomStore = useChatRoomsStore()
const userStore = useUserStore()
const relationshipsStore = useRelationshipsStore()
const memoriesStore = useMemoriesStore()

const roomId = computed(() => route.params.id as string)
const room = computed(() => chatRoomStore.getRoomById(roomId.value))
const messages = computed(() => chatRoomStore.getMessages(roomId.value))

// 角色資訊（單人聊天室）
const character = computed(() => {
  if (!room.value || room.value.type !== 'single') return null
  if (room.value.characterIds.length === 0) return null
  const charId = room.value.characterIds[0]
  if (!charId) return null
  return characterStore.getCharacterById(charId) || null
})

// 群組中的所有角色
const groupCharacters = computed(() => {
  if (!room.value || room.value.type !== 'group') return []
  return room.value.characterIds
    .map(id => characterStore.getCharacterById(id))
    .filter((c): c is NonNullable<typeof c> => c !== null)
})

// 使用者資訊
const userName = computed(() => userStore.userName)
const userAvatar = computed(() => userStore.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName.value)}&background=667eea&color=fff`)

// @ 選單可選擇的對象
const mentionOptions = computed(() => {
  const options: Array<{ id: string; name: string; type: 'all' | 'user' | 'character'; avatar?: string }> = []

  // 只在群聊時顯示 @ 選單
  if (room.value?.type !== 'group') return options

  // @all（使用 Lucide Users 圖示）
  options.push({ id: '@all', name: 'all（所有人）', type: 'all' })

  // 所有角色
  groupCharacters.value.forEach(char => {
    options.push({
      id: `@${char.name}`,
      name: char.name,
      type: 'character',
      avatar: char.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=764ba2&color=fff`
    })
  })

  return options
})

// 單人聊天角色狀態
const characterStatus = computed(() => {
  if (!character.value) return null
  return getCharacterStatus(character.value)
})

const characterStatusText = computed(() => {
  const status = characterStatus.value
  if (!status) return '線上'
  if (status === 'online') return '在線'
  if (status === 'away') return '忙碌中'
  return '離線'
})

// 根據上線狀態決定文字顏色
const statusColorClass = computed(() => {
  const status = characterStatus.value
  if (!status || status === 'online') return 'text-success'
  if (status === 'away') return 'text-warning'
  return 'text-error'
})

// 取得訊息發送者的頭像
const getSenderAvatar = (senderId: string, senderName: string) => {
  if (senderId === 'user') {
    return userAvatar.value
  }

  // 角色頭像
  const char = characterStore.getCharacterById(senderId)
  return char?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=764ba2&color=fff`
}

// 格式化訊息內容（將 @ID 轉換為 @名字）
const formatMessageContent = (content: string) => {
  if (!room.value) return content

  // 取得聊天室中的所有角色
  const allCharacters = room.value.characterIds
    .map(id => characterStore.getCharacterById(id))
    .filter((c): c is NonNullable<typeof c> => c !== null)

  return formatMessageForDisplay(content, allCharacters, userName.value)
}

// 輸入框
const messageInput = ref('')
const messageInputRef = ref<HTMLTextAreaElement | null>(null)
const messagesContainer = ref<HTMLElement | null>(null)
const isLoading = ref(false)

// @ 選單
const showMentionMenu = ref(false)
const mentionMenuPosition = ref({ top: 0, left: 0 })
const mentionCursorPosition = ref(0) // 記錄 @ 符號的位置

// 訊息選單與多選刪除
const showMessageMenu = ref(false)
const selectedMessageForMenu = ref<string | null>(null)
const menuPosition = ref({ x: 0, y: 0 })
const isMultiSelectMode = ref(false)
const selectedMessagesForDelete = ref<Set<string>>(new Set())

// 群組成員 Modal
const showMembersModal = ref(false)
// 長按支援
const longPressTimer = ref<number | null>(null)
const longPressTriggered = ref(false)

// 面板狀態
const showContextPanel = ref(false)  // 情境面板
const showMemoryPanel = ref(false)   // 記憶/成員面板
const showMemberMemoryModal = ref(false)  // 成員記憶彈窗
const selectedMemberForMemory = ref<Character | null>(null)  // 選中查看記憶的成員
const memoryTab = ref<'short' | 'long'>('short')

// 取得短期記憶（角色綁定）
const shortTermMemories = computed(() => {
  if (!character.value) return []
  return memoriesStore.getCharacterShortTermMemories(character.value.id)
})

// 取得長期記憶
const longTermMemories = computed(() => {
  if (!character.value) return []
  return memoriesStore.getCharacterMemories(character.value.id)
})

// 情境編輯狀態
const editingContext = ref(false)
const editingContextContent = ref('')

// 開關情境面板
const toggleContextPanel = () => {
  showContextPanel.value = !showContextPanel.value
  if (showContextPanel.value) {
    // 開啟時載入目前的聊天室情境
    editingContextContent.value = memoriesStore.getRoomSummary(roomId.value)
  }
}

// 儲存聊天室情境
const handleSaveContext = () => {
  memoriesStore.updateRoomSummary(roomId.value, editingContextContent.value.trim())
  editingContext.value = false
}

// 手動生成/更新聊天室情境
const isGeneratingContext = ref(false)
const handleGenerateContext = async () => {
  if (isGeneratingContext.value) return

  const currentMessages = messages.value
  if (currentMessages.length < 10) {
    alert('訊息數量不足，無法生成情境（至少需要 10 則訊息）')
    return
  }

  try {
    isGeneratingContext.value = true
    const apiKey = userStore.apiKey
    if (!apiKey) {
      alert('請先在設定中填入 API Key')
      return
    }

    // 取得最近 20 則訊息
    const recentMessages = currentMessages.slice(-20)

    // 生成情境摘要
    const summary = await generateMemorySummary(apiKey, recentMessages)

    // 更新聊天室情境
    memoriesStore.updateRoomSummary(roomId.value, summary)
    editingContextContent.value = summary

    alert('情境更新成功！')
  } catch (error) {
    console.error('生成情境失敗:', error)
    alert('生成情境失敗：' + (error as Error).message)
  } finally {
    isGeneratingContext.value = false
  }
}

// 手動生成短期記憶
const isGeneratingMemory = ref(false)

// 記錄每個聊天室最後處理記憶的訊息數量（從 localStorage 讀取）
const MEMORY_TRACKING_KEY = 'ai-chat-memory-tracking'
const CONTEXT_TRACKING_KEY = 'ai-chat-context-tracking'

const loadTrackingData = (key: string): Record<string, number> => {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

const saveTrackingData = (key: string, data: Record<string, number>) => {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    console.error('Failed to save tracking data:', error)
  }
}

const lastMemoryProcessedCount = ref<Record<string, number>>(loadTrackingData(MEMORY_TRACKING_KEY))
const lastContextProcessedCount = ref<Record<string, number>>(loadTrackingData(CONTEXT_TRACKING_KEY))

const handleGenerateMemory = async () => {
  if (isGeneratingMemory.value) return

  const currentMessages = messages.value
  if (currentMessages.length < 10) {
    alert('訊息數量不足，無法生成記憶（至少需要 10 則訊息）')
    return
  }

  try {
    isGeneratingMemory.value = true
    const apiKey = userStore.apiKey
    if (!apiKey) {
      alert('請先在設定中填入 API Key')
      return
    }

    // 取得最近 15 則訊息
    const recentMessages = currentMessages.slice(-15)

    // 生成短期記憶摘要
    const summary = await generateMemorySummary(apiKey, recentMessages)

    // 判斷是私聊還是群聊
    if (room.value?.type === 'single' && character.value) {
      // 私聊：為單一角色生成記憶
      const result = memoriesStore.addCharacterShortTermMemory(
        character.value.id,
        summary,
        'manual',
        roomId.value
      )

      if (result === null) {
        if (confirm('短期記憶已滿（6 筆全未處理），是否要先提取長期記憶？')) {
          await processShortTermMemoriesForCharacter(character.value.id)
          memoriesStore.addCharacterShortTermMemory(
            character.value.id,
            summary,
            'manual',
            roomId.value
          )
          alert('記憶生成成功！')
        }
      } else {
        alert('記憶生成成功！')
      }
    } else if (room.value?.type === 'group') {
      // 群聊：為所有參與角色生成記憶
      let successCount = 0
      for (const char of groupCharacters.value) {
        const result = memoriesStore.addCharacterShortTermMemory(
          char.id,
          summary,
          'manual',
          roomId.value
        )

        if (result === null) {
          // 如果該角色記憶已滿，自動處理
          await processShortTermMemoriesForCharacter(char.id)
          memoriesStore.addCharacterShortTermMemory(
            char.id,
            summary,
            'manual',
            roomId.value
          )
        }
        successCount++
      }
      alert(`記憶生成成功！已為 ${successCount} 位角色生成記憶`)
    }
  } catch (error) {
    console.error('生成記憶失敗:', error)
    alert('生成記憶失敗：' + (error as Error).message)
  } finally {
    isGeneratingMemory.value = false
  }
}

// 開關記憶/成員面板
const toggleMemoryPanel = () => {
  showMemoryPanel.value = !showMemoryPanel.value
}

// 開啟成員記憶彈窗
const handleViewMemberMemory = (char: Character) => {
  selectedMemberForMemory.value = char
  showMemberMemoryModal.value = true
}

// 切換記憶分頁
const switchMemoryTab = (tab: 'short' | 'long') => {
  memoryTab.value = tab
}

// 記憶編輯功能已移至記憶管理頁面，這裡僅做唯讀顯示

// 滾動到底部
const scrollToBottom = async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 記憶處理：每 15 則訊息生成短期記憶
// targetRoomId: 可選參數，指定要處理的聊天室 ID（背景執行時使用）
const handleMemoryGeneration = async (targetRoomId?: string) => {
  const processRoomId = targetRoomId || roomId.value
  const targetRoom = chatRoomStore.getRoomById(processRoomId)
  const currentMessages = chatRoomStore.getMessagesByRoomId(processRoomId)

  const messageCount = currentMessages.length

  // 如果訊息數量不足 15 則，就不處理
  if (messageCount < 15) return

  // 取得這個聊天室上次處理的訊息數量
  const lastProcessed = lastMemoryProcessedCount.value[processRoomId] || 0

  // 計算應該在哪個訊息數量觸發（每 15 則一次）
  const nextThreshold = Math.floor(lastProcessed / 15 + 1) * 15

  // 如果還沒達到下個門檻，就不處理
  if (messageCount < nextThreshold) return

  console.log(`[記憶] 聊天室 ${processRoomId}: 訊息數 ${messageCount}，上次處理 ${lastProcessed}，門檻 ${nextThreshold}`)

  try {
    const apiKey = userStore.apiKey
    if (!apiKey) return

    // 取得最近 15 則訊息
    const recentMessages = currentMessages.slice(-15)

    // 生成短期記憶摘要
    const summary = await generateMemorySummary(apiKey, recentMessages)

    // 判斷是私聊還是群聊
    if (targetRoom?.type === 'single') {
      // 私聊：為單一角色生成記憶
      const targetCharacterId = targetRoom.characterIds[0]
      if (!targetCharacterId) return

      const result = memoriesStore.addCharacterShortTermMemory(
        targetCharacterId,
        summary,
        'auto',
        processRoomId
      )

      // 如果返回 null，表示需要處理記憶（6 筆全未處理）
      if (result === null) {
        console.log('短期記憶已滿，開始提取長期記憶...')
        await processShortTermMemoriesForCharacter(targetCharacterId)

        // 處理完後，再次嘗試新增
        memoriesStore.addCharacterShortTermMemory(
          targetCharacterId,
          summary,
          'auto',
          processRoomId
        )
      }

      // 私聊：直接使用短期記憶更新聊天室情境
      memoriesStore.updateRoomSummary(processRoomId, summary)
      // 只有在當前聊天室時才更新 UI
      if (processRoomId === roomId.value) {
        editingContextContent.value = summary
      }
    } else if (targetRoom?.type === 'group') {
      // 群聊：為所有參與的角色生成記憶
      const targetCharacters = targetRoom.characterIds
        .map(id => characterStore.getCharacterById(id))
        .filter((c): c is NonNullable<typeof c> => c !== null)

      for (const char of targetCharacters) {
        const result = memoriesStore.addCharacterShortTermMemory(
          char.id,
          summary,
          'auto',
          processRoomId
        )

        // 如果返回 null，表示該角色需要處理記憶
        if (result === null) {
          console.log(`${char.name} 的短期記憶已滿，開始提取長期記憶...`)
          await processShortTermMemoriesForCharacter(char.id)

          // 處理完後，再次嘗試新增
          memoriesStore.addCharacterShortTermMemory(
            char.id,
            summary,
            'auto',
            processRoomId
          )
        }
      }
    }

    // 記錄已處理的訊息數量並存到 localStorage
    lastMemoryProcessedCount.value[processRoomId] = messageCount
    saveTrackingData(MEMORY_TRACKING_KEY, lastMemoryProcessedCount.value)
    console.log(`[記憶] 已更新處理記錄: ${processRoomId} -> ${messageCount}`)
  } catch (error) {
    console.error('記憶生成失敗:', error)
    // 靜默失敗，不影響正常對話
  }
}

// 聊天室情境處理：群聊每 30 則訊息更新一次
// targetRoomId: 可選參數，指定要處理的聊天室 ID（背景執行時使用）
const handleRoomContextGeneration = async (targetRoomId?: string) => {
  const processRoomId = targetRoomId || roomId.value
  const targetRoom = chatRoomStore.getRoomById(processRoomId)
  const currentMessages = chatRoomStore.getMessagesByRoomId(processRoomId)

  // 只處理群聊
  if (targetRoom?.type !== 'group') return

  const messageCount = currentMessages.length

  // 如果訊息數量不足 30 則，就不處理
  if (messageCount < 30) return

  // 取得這個聊天室上次處理的訊息數量
  const lastProcessed = lastContextProcessedCount.value[processRoomId] || 0

  // 計算應該在哪個訊息數量觸發（每 30 則一次）
  const nextThreshold = Math.floor(lastProcessed / 30 + 1) * 30

  // 如果還沒達到下個門檻，就不處理
  if (messageCount < nextThreshold) return

  console.log(`[情境] 聊天室 ${processRoomId}: 訊息數 ${messageCount}，上次處理 ${lastProcessed}，門檻 ${nextThreshold}`)

  try {
    const apiKey = userStore.apiKey
    if (!apiKey) return

    // 取得最近 30 則訊息
    const recentMessages = currentMessages.slice(-30)

    // 生成聊天室情境摘要
    const summary = await generateMemorySummary(apiKey, recentMessages)

    // 更新聊天室情境
    memoriesStore.updateRoomSummary(processRoomId, summary)
    // 只有在當前聊天室時才更新 UI
    if (processRoomId === roomId.value) {
      editingContextContent.value = summary
    }

    // 記錄已處理的訊息數量並存到 localStorage
    lastContextProcessedCount.value[processRoomId] = messageCount
    saveTrackingData(CONTEXT_TRACKING_KEY, lastContextProcessedCount.value)
    console.log(`[情境] 聊天室情境已更新，已更新處理記錄: ${processRoomId} -> ${messageCount}`)
  } catch (error) {
    console.error('情境生成失敗:', error)
    // 靜默失敗，不影響正常對話
  }
}

// 處理指定角色的短期記憶，提取長期記憶
const processShortTermMemoriesForCharacter = async (characterId: string) => {
  try {
    const apiKey = userStore.apiKey
    if (!apiKey) return

    // 取得指定角色的所有短期記憶
    const shortTermMemories = memoriesStore.getCharacterShortTermMemories(characterId)

    if (shortTermMemories.length === 0) return

    // 呼叫 AI 提取長期記憶
    const longTermMemoryContents = await extractLongTermMemories(apiKey, shortTermMemories)

    // 將提取的長期記憶存入角色記憶
    for (const content of longTermMemoryContents) {
      memoriesStore.addCharacterMemory(
        characterId,
        content,
        'auto',
        roomId.value
      )
    }

    // 標記角色的所有短期記憶為已處理
    memoriesStore.markCharacterShortTermMemoriesAsProcessed(characterId)

    console.log(`成功提取 ${longTermMemoryContents.length} 條長期記憶`)
  } catch (error) {
    console.error('處理短期記憶失敗:', error)
    // 靜默失敗，不影響正常對話
  }
}

// 發送訊息
const handleSendMessage = async () => {
  if (!messageInput.value.trim() || isLoading.value || !room.value) return

  const userMessage = messageInput.value.trim()
  messageInput.value = ''

  // 判斷是單人還是群組聊天
  if (room.value.type === 'single') {
    await handleSingleChatMessage(userMessage)
  } else {
    await handleGroupChatMessage(userMessage)
  }
}

// 處理單人聊天訊息
const handleSingleChatMessage = async (userMessage: string) => {
  if (!character.value) return

  // 保存當前聊天室 ID、room 和角色，用於背景執行
  const currentRoomId = roomId.value
  const currentRoom = room.value
  const currentCharacter = character.value

  // 新增使用者訊息
  chatRoomStore.addMessage(currentRoomId, {
    roomId: currentRoomId,
    senderId: 'user',
    senderName: userName.value,
    content: userMessage
  })

  scrollToBottom()

  // 等待角色回應
  isLoading.value = true

  try {
    const apiKey = userStore.apiKey
    if (!apiKey) {
      alert('尚未設定 API Key，請到設定頁面設定')
      return
    }

    // 取得使用者與角色的關係
    const userRelationship = relationshipsStore.getUserCharacterRelationship(currentCharacter.id)

    // 取得角色間的關係
    const characterRelationships = relationshipsStore.getCharacterRelationships(currentCharacter.id)

    // 取得所有角色（用於解析關係中的角色名稱）
    const allCharacters = characterStore.characters

    // 取得角色的長期記憶
    const longTermMemories = memoriesStore.getCharacterMemories(currentCharacter.id)

    // 取得角色的短期記憶（改為綁定角色而非聊天室）
    const shortTermMemories = memoriesStore.getCharacterShortTermMemories(currentCharacter.id)

    // 取得聊天室摘要
    const roomSummary = memoriesStore.getRoomSummary(currentRoomId)

    // 從 store 取得該聊天室的最新訊息（即使使用者已切換到其他聊天室）
    const targetRoom = chatRoomStore.getRoomById(currentRoomId)
    const currentMessages = chatRoomStore.getMessagesByRoomId(currentRoomId)

    const aiResponse = await getCharacterResponse({
      apiKey,
      character: currentCharacter,
      user: userStore.profile || {
        id: 'user',
        nickname: userName.value,
        avatar: userAvatar.value,
        apiConfig: {
          geminiApiKey: apiKey
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      room: targetRoom || currentRoom,
      messages: currentMessages.slice(0, -1),
      userMessage,
      context: {
        userRelationship,
        characterRelationships,
        allCharacters,
        longTermMemories,
        shortTermMemories,
        roomSummary
      }
    })

    // 更新好感度
    if (aiResponse.newAffection !== undefined) {
      relationshipsStore.updateAffection(currentCharacter.id, aiResponse.newAffection)
    }

    // 新增角色訊息
    chatRoomStore.addMessage(currentRoomId, {
      roomId: currentRoomId,
      senderId: currentCharacter.id,
      senderName: currentCharacter.name,
      content: aiResponse.text
    })

    // 只有在使用者還在同一個聊天室時才滾動
    if (roomId.value === currentRoomId) {
      scrollToBottom()
    }

    // 記憶處理（針對原聊天室）
    await handleMemoryGeneration(currentRoomId)

    // 聊天室情境處理（群聊專用，針對原聊天室）
    await handleRoomContextGeneration(currentRoomId)
  } catch (error) {
    console.error('Failed to get character response:', error)
    alert('取得回應時發生錯誤')
  } finally {
    isLoading.value = false
  }
}

// 處理群組聊天訊息
const handleGroupChatMessage = async (userMessage: string) => {
  if (!room.value) return

  // 保存當前聊天室 ID 和資料，用於背景執行
  const currentRoomId = roomId.value
  const currentRoom = room.value

  // 取得聊天室中的所有角色
  const allCharacters = currentRoom.characterIds
    .map(id => characterStore.getCharacterById(id))
    .filter((c): c is NonNullable<typeof c> => c !== null)

  if (allCharacters.length === 0) return

  // 轉換使用者訊息：@名字 → @ID
  const messageForAI = formatMessageForAI(userMessage, allCharacters, userName.value)

  // 新增使用者訊息（儲存原始訊息）
  chatRoomStore.addMessage(currentRoomId, {
    roomId: currentRoomId,
    senderId: 'user',
    senderName: userName.value,
    content: userMessage
  })

  scrollToBottom()

  // 等待角色回應
  isLoading.value = true

  try {
    const apiKey = userStore.apiKey
    if (!apiKey) {
      alert('尚未設定 API Key，請到設定頁面設定')
      return
    }

    // 多輪對話邏輯
    const MAX_ROUNDS = 10 // 最多 10 輪
    let currentRound = 0
    const conversationHistory: Array<{ senderId: string; content: string }> = [
      { senderId: 'user', content: messageForAI }
    ]

    // 記錄最近兩輪的對話模式，用於偵測無限循環
    let lastTwoRoundsPattern: string[] = []

    while (currentRound < MAX_ROUNDS) {
      currentRound++

      // 決定這一輪要回應的角色
      let respondingCharacterIds: string[]

      if (currentRound === 1) {
        // 第一輪：在線角色 + 被 @ 的角色
        const result = determineRespondingCharacters(messageForAI, allCharacters)
        respondingCharacterIds = result.respondingIds

        // 顯示無法回應的角色系統訊息
        if (result.unableToRespond.length > 0) {
          result.unableToRespond.forEach(info => {
            const reasonText = info.reason === 'away' ? '忙碌中' : '離線'
            const systemMessage = {
              id: `system-${Date.now()}-${Math.random()}`,
              roomId: currentRoomId,
              senderId: 'system',
              senderName: '系統',
              content: `${info.characterName} 因${reasonText}無法回覆`,
              timestamp: new Date().toISOString()
            }
            chatRoomStore.addMessage(currentRoomId, systemMessage)
          })
        }
      } else {
        // 後續輪：只有被上一輪訊息 @ 的角色
        const lastRoundMessages = conversationHistory.slice(-(conversationHistory.length - (currentRound - 2)))
        const mentionedIds = new Set<string>()

        lastRoundMessages.forEach(msg => {
          const mentioned = parseMentionedCharacterIds(msg.content, allCharacters.map(c => c.id))
          mentioned.forEach(id => mentionedIds.add(id))
        })

        // 排除使用者
        respondingCharacterIds = Array.from(mentionedIds).filter(id => id !== 'user')
      }

      // 沒有角色要回應，結束對話
      if (respondingCharacterIds.length === 0) {
        console.log(`第 ${currentRound} 輪：沒有角色需要回應，結束對話`)
        break
      }

      // 偵測無限循環：檢查是否連續兩輪都是同樣的角色在互相 @
      const currentPattern = respondingCharacterIds.sort().join(',')
      lastTwoRoundsPattern.push(currentPattern)

      if (lastTwoRoundsPattern.length > 2) {
        lastTwoRoundsPattern.shift() // 只保留最近兩輪
      }

      // 如果連續兩輪都是同樣的角色組合，視為無限循環，強制結束
      if (lastTwoRoundsPattern.length === 2 && lastTwoRoundsPattern[0] === lastTwoRoundsPattern[1]) {
        console.log(`偵測到無限循環（${currentPattern}），強制結束對話`)
        break
      }

      console.log(`第 ${currentRound} 輪：${respondingCharacterIds.length} 位角色回應`)

      // 記錄這一輪是否為第一個角色（只有第一輪的第一個角色需要傳入 userMessage）
      let isFirstCharacterInThisRound = true

      // 打亂responding的順序
      respondingCharacterIds = shuffle(respondingCharacterIds)

      // 依序讓角色回應
      for (const charId of respondingCharacterIds) {
        const currentCharacter = characterStore.getCharacterById(charId)
        if (!currentCharacter) continue

        // 判斷角色是否為離線但被 @all 吵醒
        const isOffline = !isCharacterOnline(currentCharacter)
        const hasAtAll = /@all/i.test(messageForAI)
        const isOfflineButMentioned = isOffline && hasAtAll

        // 取得使用者與角色的關係
        const userRelationship = relationshipsStore.getUserCharacterRelationship(currentCharacter.id)

        // 取得角色間的關係
        const characterRelationships = relationshipsStore.getCharacterRelationships(currentCharacter.id)

        // 取得群聊中的其他角色
        const otherCharactersInRoom = allCharacters.filter(c => c.id !== currentCharacter.id)

        // 取得角色的長期記憶
        const longTermMemories = memoriesStore.getCharacterMemories(currentCharacter.id)

        // 取得角色的短期記憶（改為綁定角色而非聊天室）
        const shortTermMemories = memoriesStore.getCharacterShortTermMemories(currentCharacter.id)

        // 取得聊天室摘要
        const roomSummary = memoriesStore.getRoomSummary(currentRoomId)

        // 從 store 取得該聊天室的最新訊息（即使使用者已切換到其他聊天室）
        const targetRoom = chatRoomStore.getRoomById(currentRoomId)
        const currentMessages = chatRoomStore.getMessagesByRoomId(currentRoomId)

        // 呼叫 AI
        const aiResponse = await getCharacterResponse({
          apiKey,
          character: currentCharacter,
          user: userStore.profile || {
            id: 'user',
            nickname: userName.value,
            avatar: userAvatar.value,
            apiConfig: {
              geminiApiKey: apiKey
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          room: targetRoom || currentRoom,
          // 傳入該聊天室的最新訊息歷史（排除正在生成的這一則）
          messages: (currentRound === 1 && isFirstCharacterInThisRound) ? currentMessages.slice(0, -1) : currentMessages,
          // 只有第一輪的第一個角色需要傳入 userMessage，其他角色會在 messages 中看到
          userMessage: (currentRound === 1 && isFirstCharacterInThisRound) ? messageForAI : '',
          context: {
            userRelationship,
            characterRelationships,
            otherCharactersInRoom,
            allCharacters,
            longTermMemories,
            shortTermMemories,
            roomSummary,
            isOfflineButMentioned
          }
        })

        // 更新好感度
        if (aiResponse.newAffection !== undefined) {
          relationshipsStore.updateAffection(currentCharacter.id, aiResponse.newAffection)
        }

        // 轉換 AI 回應：@名字 → @ID（為了偵測提及）
        const aiResponseForAI = formatMessageForAI(aiResponse.text, allCharacters, userName.value)

        // 記錄到對話歷史（用於下一輪判斷）
        conversationHistory.push({
          senderId: currentCharacter.id,
          content: aiResponseForAI
        })

        // 新增角色訊息（儲存原始訊息）
        chatRoomStore.addMessage(currentRoomId, {
          roomId: currentRoomId,
          senderId: currentCharacter.id,
          senderName: currentCharacter.name,
          content: aiResponse.text
        })

        // 只有在使用者還在同一個聊天室時才滾動
        if (roomId.value === currentRoomId) {
          scrollToBottom()
        }

        // 標記已經處理過第一個角色了
        isFirstCharacterInThisRound = false
      }
    }

    // 記憶處理（針對原聊天室）
    // 需要確保記憶處理是針對 currentRoomId，而非當前顯示的聊天室
    await handleMemoryGeneration(currentRoomId)

    // 聊天室情境處理（群聊專用，針對原聊天室）
    await handleRoomContextGeneration(currentRoomId)
  } catch (error) {
    console.error('Failed to get character response:', error)
    alert('取得回應時發生錯誤')
  } finally {
    isLoading.value = false
  }
}

// 偵測是否為觸控裝置（手機/平板）
const isTouchDevice = () => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

// 處理輸入框變化（偵測 @ 符號）
const handleInputChange = () => {
  if (room.value?.type !== 'group') return

  const textarea = messageInputRef.value
  if (!textarea) return

  const cursorPos = textarea.selectionStart
  const textBeforeCursor = messageInput.value.substring(0, cursorPos)

  // 檢查游標前最後一個字元是否為 @
  if (textBeforeCursor.endsWith('@')) {
    // 顯示選單
    showMentionMenu.value = true
    mentionCursorPosition.value = cursorPos

    // 計算選單位置（在游標下方）
    // 簡化版：固定在輸入框上方
    const rect = textarea.getBoundingClientRect()
    mentionMenuPosition.value = {
      left: rect.left + 20,
      top: rect.top - 10
    }
  } else {
    // 隱藏選單
    showMentionMenu.value = false
  }
}

// 選擇 @ 對象
const selectMention = (option: { id: string; name: string; type: string }) => {
  const textarea = messageInputRef.value
  if (!textarea) return

  const cursorPos = mentionCursorPosition.value
  const beforeAt = messageInput.value.substring(0, cursorPos - 1) // 移除 @
  const afterCursor = messageInput.value.substring(cursorPos)

  // 插入選擇的名字
  messageInput.value = beforeAt + option.id + ' ' + afterCursor

  // 設定游標位置到插入文字後
  nextTick(() => {
    const newCursorPos = (beforeAt + option.id + ' ').length
    textarea.setSelectionRange(newCursorPos, newCursorPos)
    textarea.focus()
  })

  // 隱藏選單
  showMentionMenu.value = false
}

// 處理 Enter 送出
const handleKeydown = (event: KeyboardEvent) => {
  // 如果選單開啟，Escape 關閉選單
  if (showMentionMenu.value && event.key === 'Escape') {
    showMentionMenu.value = false
    event.preventDefault()
    return
  }

  // 在手機上，Enter 就是換行，不送出訊息（需要點按鈕）
  // 在桌面上，Enter 送出，Shift+Enter 換行
  if (!isTouchDevice() && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSendMessage()
  }
}

// 訊息長按/點擊事件
const handleMessageLongPress = (messageId: string, event: MouseEvent | TouchEvent) => {
  if (isMultiSelectMode.value) return

  selectedMessageForMenu.value = messageId

  // 取得點擊位置
  if ('touches' in event && event.touches && event.touches[0]) {
    menuPosition.value = { x: event.touches[0].clientX, y: event.touches[0].clientY }
  } else if ('clientX' in event) {
    menuPosition.value = { x: event.clientX, y: event.clientY }
  }

  showMessageMenu.value = true
}

// Touch 事件處理（iOS 支援）
const handleTouchStart = (messageId: string, event: TouchEvent) => {
  if (isMultiSelectMode.value) return

  longPressTriggered.value = false

  // 儲存觸控位置
  if (event.touches && event.touches[0]) {
    menuPosition.value = { x: event.touches[0].clientX, y: event.touches[0].clientY }
  }

  // 設定長按計時器（500ms）
  longPressTimer.value = window.setTimeout(() => {
    longPressTriggered.value = true
    selectedMessageForMenu.value = messageId
    showMessageMenu.value = true

    // 觸發震動回饋（如果支援）
    if (navigator.vibrate) {
      navigator.vibrate(50)
    }
  }, 500)
}

const handleTouchEnd = () => {
  // 清除長按計時器
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

const handleTouchMove = () => {
  // 如果手指移動，取消長按
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

// 關閉選單
const closeMessageMenu = () => {
  showMessageMenu.value = false
  selectedMessageForMenu.value = null
}

// 複製訊息
const handleCopyMessage = () => {
  if (!selectedMessageForMenu.value) return

  const message = messages.value.find(m => m.id === selectedMessageForMenu.value)
  if (message) {
    navigator.clipboard.writeText(message.content)
  }

  closeMessageMenu()
}

// 進入多選刪除模式
const handleEnterDeleteMode = () => {
  isMultiSelectMode.value = true
  selectedMessagesForDelete.value.clear()

  // 如果有選中的訊息，自動加入多選
  if (selectedMessageForMenu.value) {
    selectedMessagesForDelete.value.add(selectedMessageForMenu.value)
  }

  closeMessageMenu()
}

// 切換訊息選中狀態（多選模式）
const toggleMessageSelection = (messageId: string) => {
  if (!isMultiSelectMode.value) return

  if (selectedMessagesForDelete.value.has(messageId)) {
    selectedMessagesForDelete.value.delete(messageId)
  } else {
    selectedMessagesForDelete.value.add(messageId)
  }
}

// 取消多選模式
const handleCancelMultiSelect = () => {
  isMultiSelectMode.value = false
  selectedMessagesForDelete.value.clear()
}

// 批次刪除訊息
const handleBatchDelete = () => {
  if (selectedMessagesForDelete.value.size === 0) return

  const messageIds = Array.from(selectedMessagesForDelete.value)
  chatRoomStore.deleteMessages(roomId.value, messageIds)

  isMultiSelectMode.value = false
  selectedMessagesForDelete.value.clear()
}

// 返回列表
const handleBack = () => {
  router.push('/main/chats')
}

onMounted(() => {
  if (!room.value) {
    alert('找不到聊天室')
    router.push('/main/chats')
    return
  }

  // 初始化與聊天室內所有角色的關係（如果尚未建立）
  if (room.value.type === 'single' && character.value) {
    // 私聊：初始化與該角色的關係
    relationshipsStore.initUserCharacterRelationship(character.value.id)
  } else if (room.value.type === 'group') {
    // 群聊：初始化與所有角色的關係
    groupCharacters.value.forEach(char => {
      relationshipsStore.initUserCharacterRelationship(char.id)
    })
  }

  chatRoomStore.setCurrentRoom(roomId.value)
  scrollToBottom()
})
</script>

<template>
  <div v-if="room && (character || groupCharacters.length > 0)" class="chat-room page">
    <!-- Header -->
    <div class="chat-header">
      <button v-if="!isMultiSelectMode" class="back-btn" @click="handleBack">
        <ArrowLeft :size="24" />
      </button>
      <button v-else class="back-btn" @click="handleCancelMultiSelect">
        <X :size="24" />
      </button>

      <!-- 單人聊天 Header -->
      <div v-if="!isMultiSelectMode && room.type === 'single' && character" class="chat-header-info">
        <div class="avatar-wrapper">
          <div class="avatar">
            <img
              :src="character.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(character.name)}&background=764ba2&color=fff`"
              :alt="character.name">
          </div>
          <div v-if="characterStatus" :class="['status-indicator', characterStatus]" />

        </div>
        <div class="info">
          <h2 class="name">{{ character.name }}</h2>
          <p class="status" :class="statusColorClass">{{ characterStatusText }}</p>
        </div>
      </div>

      <!-- 群組聊天 Header -->
      <div v-if="!isMultiSelectMode && room.type === 'group'" class="chat-header-info group-header">
        <div class="group-avatars">
          <div v-for="(char, index) in groupCharacters.slice(0, 3)" :key="char.id" class="avatar-small"
            :style="{ zIndex: 3 - index }">
            <img
              :src="char.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=764ba2&color=fff`"
              :alt="char.name">
          </div>
          <span v-if="groupCharacters.length > 3" class="more-count">+{{ groupCharacters.length - 3 }}</span>
        </div>
        <div class="info">
          <h2 class="name">{{ room.name }}</h2>
          <p class="status">{{ groupCharacters.length }} 位成員</p>
        </div>
      </div>

      <div v-else-if="isMultiSelectMode" class="multi-select-header">
        <h2 class="name">已選取 {{ selectedMessagesForDelete.size }} 則訊息</h2>
      </div>

      <div class="spacer"></div>

      <!-- 情境按鈕 -->
      <button v-if="!isMultiSelectMode" class="btn btn-info-outline" @click="toggleContextPanel">
        <FileText :size="20" />
        <span class="context-btn-label">情境</span>
      </button>

      <!-- 記憶/成員按鈕 -->
      <button v-if="!isMultiSelectMode" class="btn btn-info" @click="toggleMemoryPanel">
        <Bubbles v-if="room.type === 'single'" :size="20" />
        <Users v-else :size="20" />
        <span class="memory-btn-label">{{ room.type === 'single' ? '記憶' : '成員' }}</span>
      </button>

      <button v-if="isMultiSelectMode" class="delete-btn btn btn-danger"
        :disabled="selectedMessagesForDelete.size === 0" @click="handleBatchDelete">
        刪除
      </button>
    </div>

    <!-- 情境面板 -->
    <div v-if="showContextPanel" class="panel-overlay" @click="showContextPanel = false">
      <div class="panel" @click.stop>
        <div class="panel-header">
          <h3>聊天室情境</h3>
          <button class="close-btn" @click="showContextPanel = false">
            <X :size="20" />
          </button>
        </div>

        <div class="panel-content">
          <div class="info-hint">
            <p>💡 聊天室情境會提供給 AI，幫助好友理解目前的對話背景</p>
          </div>

          <div v-if="!editingContext" class="context-view">
            <div v-if="editingContextContent.trim()" class="context-display">
              {{ editingContextContent }}
            </div>
            <div v-else class="context-display empty">
              尚未設定聊天室情境
            </div>
          </div>
          <div v-else class="context-edit">
            <textarea v-model="editingContextContent" class="context-textarea" rows="8"
              placeholder="輸入聊天室情境...（例如：大家正在討論週末的旅遊計畫）"></textarea>
          </div>
        </div>
        <div v-if="!editingContext" class="panel-actions">
          <button class="btn btn-success" @click="handleGenerateContext" :disabled="isGeneratingContext">
            {{ isGeneratingContext ? '生成中...' : '自動生成情境' }}
          </button>
          <button class="btn btn-primary" @click="editingContext = true">編輯情境</button>
        </div>
        <div v-else class="panel-actions">
          <button class="btn btn-success" @click="handleSaveContext">儲存</button>
          <button class="btn btn-secondary" @click="editingContext = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 記憶/成員面板 -->
    <div v-if="showMemoryPanel" class="panel-overlay" @click="showMemoryPanel = false">
      <div class="panel" @click.stop>
        <div class="panel-header">
          <h3 v-if="room.type === 'single'">{{ character?.name }} 的記憶</h3>
          <h3 v-else>群組成員</h3>
          <button class="close-btn" @click="showMemoryPanel = false">
            <X :size="20" />
          </button>
        </div>

        <!-- 私聊：記憶分頁 -->
        <div v-if="room.type === 'single'" class="memory-tabs">
          <button :class="['tab', { active: memoryTab === 'short' }]" @click="switchMemoryTab('short')">
            短期記憶 ({{ shortTermMemories.length }}/6)
          </button>
          <button :class="['tab', { active: memoryTab === 'long' }]" @click="switchMemoryTab('long')">
            長期記憶 ({{ longTermMemories.length }})
          </button>
        </div>

        <!-- 私聊：短期記憶列表（唯讀） -->
        <template v-if="room.type === 'single' && memoryTab === 'short'">
          <div class="panel-content">
            <div class="info-hint">
              <p>💡 記憶僅供檢視，如需管理請前往好友詳情頁</p>
            </div>

            <div v-if="shortTermMemories.length === 0" class="empty-memory">
              <p>尚無短期記憶</p>
              <p class="hint">每 15 則訊息會自動生成一條短期記憶摘要</p>
            </div>

            <div v-else class="memory-list">
              <div v-for="memory in shortTermMemories" :key="memory.id" class="memory-item readonly">
                <div class="memory-content">
                  <p class="memory-text">{{ memory.content }}</p>
                  <div class="memory-meta">
                    <span class="memory-time">{{ new Date(memory.createdAt).toLocaleDateString() }} {{ new
                      Date(memory.createdAt).toLocaleTimeString() }}</span>
                    <span v-if="memory.processed" class="processed-badge">已處理</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="panel-actions">
            <button class="btn btn-primary" @click="handleGenerateMemory" :disabled="isGeneratingMemory">
              {{ isGeneratingMemory ? '生成中...' : '立即生成記憶' }}
            </button>
          </div>
        </template>


        <!-- 私聊：長期記憶列表（唯讀） -->
        <div v-if="room.type === 'single' && memoryTab === 'long'" class="panel-content">
          <div class="info-hint">
            <p>💡 記憶僅供檢視，如需管理請前往好友詳情頁</p>
          </div>

          <div v-if="longTermMemories.length === 0" class="empty-memory">
            <p>尚無長期記憶</p>
            <p class="hint">AI 會自動將重要的對話內容提取為長期記憶</p>
          </div>

          <div v-else class="memory-list">
            <div v-for="memory in longTermMemories" :key="memory.id" class="memory-item readonly">
              <div class="memory-content">
                <p class="memory-text">{{ memory.content }}</p>
                <div class="memory-meta">
                  <span class="memory-time">{{ new Date(memory.createdAt).toLocaleDateString() }} {{ new
                    Date(memory.createdAt).toLocaleTimeString() }}</span>
                  <span v-if="memory.sourceRoomId" class="source-badge">來自聊天室</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 群聊：成員列表 -->
        <div v-if="room.type === 'group'" class="panel-content">
          <div class="members-list">
            <div v-for="char in groupCharacters" :key="char.id" class="member-item"
              @click="handleViewMemberMemory(char)">
              <div class="member-avatar">
                <img
                  :src="char.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=764ba2&color=fff`"
                  :alt="char.name">
                <div :class="['status-dot', getCharacterStatus(char)]" />
              </div>
              <div class="member-info">
                <h4 class="member-name">{{ char.name }}</h4>
                <p class="member-status">{{ getCharacterStatus(char) === 'online' ? '在線' : getCharacterStatus(char) ===
                  'away' ? '忙碌中' : '離線' }}</p>
              </div>
              <button class="btn btn-info" @click="toggleMemoryPanel">
                <Bubbles :size="20" />記憶
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 成員記憶彈窗 -->
    <div v-if="showMemberMemoryModal && selectedMemberForMemory" class="panel-overlay"
      @click="showMemberMemoryModal = false">
      <div class="panel" @click.stop>
        <div class="panel-header">
          <h3>{{ selectedMemberForMemory.name }} 的記憶</h3>
          <button class="close-btn" @click="showMemberMemoryModal = false">
            <X :size="20" />
          </button>
        </div>

        <!-- 記憶分頁 -->
        <div class="memory-tabs">
          <button :class="['tab', { active: memoryTab === 'short' }]" @click="switchMemoryTab('short')">
            短期記憶 ({{ memoriesStore.getCharacterShortTermMemories(selectedMemberForMemory.id).length }}/6)
          </button>
          <button :class="['tab', { active: memoryTab === 'long' }]" @click="switchMemoryTab('long')">
            長期記憶 ({{ memoriesStore.getCharacterMemories(selectedMemberForMemory.id).length }})
          </button>
        </div>

        <!-- 短期記憶列表（唯讀） -->
        <div v-if="memoryTab === 'short'" class="panel-content">
          <div class="info-hint">
            <p>💡 記憶僅供檢視，如需管理請前往好友詳情頁</p>
          </div>

          <div v-if="memoriesStore.getCharacterShortTermMemories(selectedMemberForMemory.id).length === 0"
            class="empty-memory">
            <p>尚無短期記憶</p>
            <p class="hint">每 15 則訊息會自動生成一條短期記憶摘要</p>
          </div>

          <div v-else class="memory-list">
            <div v-for="memory in memoriesStore.getCharacterShortTermMemories(selectedMemberForMemory.id)"
              :key="memory.id" class="memory-item readonly">
              <div class="memory-content">
                <p class="memory-text">{{ memory.content }}</p>
                <div class="memory-meta">
                  <span class="memory-time">{{ new Date(memory.createdAt).toLocaleDateString() }} {{ new
                    Date(memory.createdAt).toLocaleTimeString() }}</span>
                  <span v-if="memory.processed" class="processed-badge">已處理</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 長期記憶列表（唯讀） -->
        <div v-if="memoryTab === 'long'" class="panel-content">
          <div class="info-hint">
            <p>💡 記憶僅供檢視，如需管理請前往好友詳情頁</p>
          </div>

          <div v-if="memoriesStore.getCharacterMemories(selectedMemberForMemory.id).length === 0" class="empty-memory">
            <p>尚無長期記憶</p>
            <p class="hint">AI 會自動將重要的對話內容提取為長期記憶</p>
          </div>

          <div v-else class="memory-list">
            <div v-for="memory in memoriesStore.getCharacterMemories(selectedMemberForMemory.id)" :key="memory.id"
              class="memory-item readonly">
              <div class="memory-content">
                <p class="memory-text">{{ memory.content }}</p>
                <div class="memory-meta">
                  <span class="memory-time">{{ new Date(memory.createdAt).toLocaleDateString() }} {{ new
                    Date(memory.createdAt).toLocaleTimeString() }}</span>
                  <span v-if="memory.sourceRoomId" class="source-badge">來自聊天室</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Messages -->
    <div ref="messagesContainer" class="messages-container">
      <div v-if="messages.length === 0" class="empty-messages">
        <div class="empty-icon">
          <MessageCircle :size="64" :stroke-width="1.5" />
        </div>
        <p v-if="room.type === 'single' && character">開始和 {{ character.name }} 聊天吧！</p>
        <p v-else-if="room.type === 'group'">開始群組聊天吧！</p>
      </div>

      <!-- 系統訊息 -->
      <div v-for="message in messages" :key="message.id" class="messages-wrapper">
        <div v-if="message.senderId === 'system'" class="system-message">
          <span class="system-message-text">{{ message.content }}</span>
        </div>

        <!-- 一般訊息 -->
        <div v-else :class="[
            'message',
            message.senderId === 'user' ? 'user-message' : 'character-message',
            { 'multi-select-mode': isMultiSelectMode, 'selected': selectedMessagesForDelete.has(message.id) }
          ]" @click="isMultiSelectMode ? toggleMessageSelection(message.id) : null"
          @contextmenu.prevent="handleMessageLongPress(message.id, $event)"
          @touchstart="handleTouchStart(message.id, $event)" @touchend="handleTouchEnd" @touchmove="handleTouchMove">
          <!-- 多選模式的 checkbox -->
          <div v-if="isMultiSelectMode" class="message-checkbox">
            <input type="checkbox" :checked="selectedMessagesForDelete.has(message.id)"
              @change="toggleMessageSelection(message.id)">
          </div>

          <div class="message-avatar">
            <img :src="getSenderAvatar(message.senderId, message.senderName)" :alt="message.senderName">
          </div>
          <div class="message-content">
            <div class="message-header">
              <span class="sender-name">{{ message.senderName }}</span>
              <span class="message-time">{{ formatMessageTime(message.timestamp) }}</span>
            </div>
            <div class="message-text" v-html="formatMessageContent(message.content)"></div>
          </div>
        </div>
      </div>

      <!-- Loading indicator -->
      <div v-if="isLoading" class="message character-message loading-message">
        <div class="message-avatar">
          <div class="typing-placeholder-avatar"></div>
        </div>
        <div class="message-content">
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Message Menu -->
    <div v-if="showMessageMenu" class="message-menu-overlay" @click="closeMessageMenu">
      <div class="message-menu" :style="{ top: menuPosition.y + 'px', left: menuPosition.x + 'px' }" @click.stop>
        <button class="menu-item" @click="handleCopyMessage">
          <Copy :size="18" />
          <span>複製</span>
        </button>
        <button class="menu-item delete" @click="handleEnterDeleteMode">
          <Trash2 :size="18" />
          <span>刪除</span>
        </button>
      </div>
    </div>

    <!-- @ 選單 -->
    <div v-if="showMentionMenu" class="mention-menu"
      :style="{ top: mentionMenuPosition.top + 'px', left: mentionMenuPosition.left + 'px' }">
      <div v-for="option in mentionOptions" :key="option.id" class="mention-option" @click="selectMention(option)">
        <!-- 頭像 -->
        <div class="mention-avatar">
          <template v-if="option.type === 'all'">
            <Users :size="20" class="mention-icon" />
          </template>
          <template v-else>
            <img :src="option.avatar" :alt="option.name" />
          </template>
        </div>
        <!-- 名稱 -->
        <span class="mention-name">{{ option.name }}</span>
      </div>
    </div>

    <!-- Input -->
    <div class="input-container">
      <textarea ref="messageInputRef" v-model="messageInput" class="message-input"
        :placeholder="isTouchDevice() ? '輸入訊息...' : '輸入訊息... (Enter 送出，Shift+Enter 換行)'" rows="1" :disabled="isLoading"
        @input="handleInputChange" @keydown="handleKeydown"></textarea>
      <button class="send-btn" :disabled="!messageInput.trim() || isLoading" @click="handleSendMessage">
        <Send :size="20" />
      </button>
    </div>

    <!-- 群組成員 Modal -->
    <div v-if="showMembersModal" class="modal-overlay" @click="showMembersModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>群組成員</h3>
          <button class="modal-close" @click="showMembersModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="members-list">
            <div v-for="char in groupCharacters" :key="char.id" class="member-item">
              <div class="member-avatar-wrapper">
                <div class="member-avatar">
                  <img
                    :src="char.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=764ba2&color=fff`"
                    :alt="char.name">
                </div>
                <div :class="['status-indicator', getCharacterStatus(char)]" />
              </div>
              <div class="member-info">
                <h4 class="member-name">{{ char.name }}</h4>
                <p class="member-status">
                  {{ getCharacterStatus(char) === 'online' ? '在線' : getCharacterStatus(char) === 'away' ? '忙碌中' : '離線'
                  }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

.chat-room {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
}

/* Header */
.chat-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg) var(--spacing-xl);
  background: var(--color-bg-primary);
  border-bottom: 2px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  z-index: 10;
}

.back-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--text-xl);
  color: var(--color-text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: var(--radius);
  transition: all var(--transition);
}

.back-btn:hover {
  background: var(--color-bg-hover);
}

.chat-header-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.chat-header-info .avatar-wrapper {
  position: relative;
}

.chat-header-info .avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-bg-secondary);
}

.chat-header-info .avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 狀態指示器 */
.status-indicator {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  border-radius: var(--radius-full);
  border: 2px solid var(--color-bg-primary);
}

.status-indicator.online {
  background: #52c41a;
}

.status-indicator.away {
  background: #faad14;
}

.status-indicator.offline {
  background: #999;
}

.chat-header-info .info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.chat-header-info .name {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.chat-header-info .status {
  font-size: var(--text-sm);
  color: var(--color-success);
  margin: 0;
}

/* 群組頭像 */
.group-avatars {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.avatar-small {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-bg-primary);
  margin-left: -8px;
}

.avatar-small:first-child {
  margin-left: 0;
}

.avatar-small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.more-count {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-weight: 600;
  margin-left: var(--spacing-xs);
}

/* Loading 佔位頭像 */
.typing-placeholder-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.spacer {
  flex: 1;
}

/* Messages */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  width: 100%;
}

.messages-wrapper {

  display: contents;

}

.empty-messages {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
}

.empty-icon {
  margin-bottom: var(--spacing-lg);
  opacity: 0.3;
  color: var(--color-text-tertiary);
}

/* 系統訊息 */
.system-message {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--spacing-sm) 0;
  margin: var(--spacing-xs) 0;
}

.system-message-text {
  font-size: 12px;
  color: var(--color-text-tertiary);
  background: var(--color-bg-secondary);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-full);
  text-align: center;
}

.message {
  display: flex;
  gap: var(--spacing-md);
  max-width: 70%;
  animation: messageSlideIn 0.3s ease-out;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.user-message {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.character-message {
  align-self: flex-start;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.message-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.sender-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.message-time {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.message-text {
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  line-height: 1.5;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.user-message .message-text {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-text-white);
}

.character-message .message-text {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}

/* Typing indicator */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
  animation: typingAnimation 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typingAnimation {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-10px);
  }
}

/* Input */
.input-container {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-lg) var(--spacing-xl);
  background: var(--color-bg-primary);
  border-top: 2px solid var(--color-border);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}

.message-input {
  flex: 1;
  padding: var(--spacing-md) var(--spacing-lg);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  font-family: inherit;
  resize: none;
  min-height: 48px;
  max-height: 120px;
  transition: all var(--transition-fast);
}

.message-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.message-input:disabled {
  background: var(--color-bg-secondary);
  cursor: not-allowed;
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md) var(--spacing-xl);
  background: var(--color-primary);
  color: var(--color-text-white);
  border: none;
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
  min-width: 56px;
}

.send-btn:hover:not(:disabled) {
  background: var(--color-primary-dark);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Multi-select mode */
.multi-select-header {
  display: flex;
  align-items: center;
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-checkbox {
  display: flex;
  align-items: center;
  margin-right: var(--spacing-md);
}

.message-checkbox input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.message.multi-select-mode {
  cursor: pointer;
}

.message.multi-select-mode.selected {
  background: rgba(102, 126, 234, 0.1);
  border-radius: var(--radius-lg);
}

/* @ 選單 */
.mention-menu {
  position: fixed;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-xs);
  min-width: 200px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 2000;
  transform: translateY(-100%);
  margin-top: -10px;
}

.mention-option {
  padding: var(--spacing-md) var(--spacing-lg);
  cursor: pointer;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.mention-option:hover {
  background: var(--color-bg-hover);
}

.mention-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
}

.mention-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mention-icon {
  color: var(--color-primary);
}

.mention-name {
  font-size: var(--text-base);
  color: var(--color-text-primary);
  flex: 1;
}

/* Message Menu */
.message-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: transparent;
}

.message-menu {
  position: fixed;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-xs);
  min-width: 150px;
  z-index: 1001;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  padding: var(--spacing-md) var(--spacing-lg);
  text-align: left;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  font-size: var(--text-base);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.menu-item:hover {
  background: var(--color-bg-hover);
}

.menu-item.delete {
  color: var(--color-danger);
}

.menu-item.delete:hover {
  background: rgba(244, 67, 54, 0.1);
}

/* 成員按鈕 */
.members-btn {
  margin-left: auto;
}

/* 成員 Modal */
.members-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  max-height: 60vh;
  overflow-y: auto;
}

.member-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
  transition: all var(--transition);
}

.member-item:hover {
  background: var(--color-bg-hover);
}

.member-avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.member-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-bg-primary);
}

.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.member-status {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: 0;
}


/* 記憶面板遮罩 */
.memory-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

/* 記憶面板 */
.memory-panel {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.memory-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.memory-panel-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* 記憶分頁 */
.memory-tabs {
  display: flex;  
  border-bottom: 2px solid var(--color-border);
  border-radius: 0px;
  padding: 0 20px;
  flex-shrink: 0;
}

.memory-tabs .tab {
  background: none;
  border: none;
  border-radius: 0px;
  padding: 12px 16px;
  cursor: pointer;
  color: var(--color-text-tertiary);
  font-size: 14px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.memory-tabs .tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 500;
}

.memory-tabs .tab:hover {
  color: var(--color-text-white);
  background: var(--color-primary-light);
}

/* 記憶列表 */
.memory-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* 生成記憶區塊 */
.generate-memory-section {
  padding: 16px;  
  border-radius: 8px;
  text-align: center;
}

.btn-generate-memory {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-text-white);
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
}

.btn-generate-memory:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn-generate-memory:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.generate-memory-section .hint {
  font-size: 12px!important;
  margin: 0;
}

.empty-memory {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.empty-memory p {
  margin: 8px 0;
}

.empty-memory .hint {
  font-size: 13px;
  color: var(--text-tertiary);
}

/* 記憶項目 */
.memory-item {
  border-radius: 8px;
  margin-bottom: 12px;
  position: relative;
}

.memory-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 8px 0 0 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.memory-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.memory-text {
  color: var(--text-primary);
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;
}

.memory-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.processed-badge,
.source-badge {
  background: var(--color-success);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.source-badge {
  background: var(--color-info);
}

.memory-actions {
  display: flex;
  gap: 8px;
}


/* 記憶編輯 */
.memory-edit {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: linear-gradient(135deg, #667eeacc 0%, #764ba2cc 100%);
}

.memory-textarea {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-family: inherit;
  font-size: 1rem;
  color: var(--text-primary);
  resize: vertical;
  min-height: 80px;
}

.memory-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* 唯讀記憶 */
.memory-item.readonly {
  opacity: 0.9;
  cursor: default;
}

.memory-item.readonly::before {
  background: linear-gradient(135deg, #999 0%, #666 100%);
}


/* ==================== 新增：情境面板樣式 ==================== */

/* 面板遮罩 */
.panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 面板容器 */
.panel {
  width: 100%;
  max-width: 80vw;
  height: 90%;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

/* 面板標題 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xl);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.panel-header h3 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  padding: var(--spacing-sm);
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius);
  transition: all var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* 面板內容 */
.panel-content {
  flex: 1;
  overflow-y: auto;
  height: 100%;
}

/* 情境資訊提示 */
.info-hint {
  background: linear-gradient(135deg, #667eea20, #764ba220);
  border: 1px solid #667eea40;
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
}

.info-hint p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

/* 情境檢視模式 */
.context-view {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding: 20px;
}

.context-display {
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
  padding: var(--spacing-lg);
  min-height: 215px;
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.context-display.empty {
  color: var(--color-text-tertiary);
  font-style: italic;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 情境編輯模式 */
.context-edit {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding: 20px;
}

.context-textarea {
  width: 100%;
  min-height: 150px;
  padding: var(--spacing-lg);
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  font-family: inherit;
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--color-text-primary);
  background: var(--color-bg-primary);
  resize: vertical;
  transition: border-color var(--transition);
}

.context-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.context-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.context-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
}

.context-actions .btn {
  padding: var(--spacing-md) var(--spacing-xl);
  font-size: var(--text-base);
}

/* ==================== 新增：成員列表樣式 ==================== */

.members-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.member-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all var(--transition);
}

.member-item:hover {
  background: var(--color-bg-hover);
  box-shadow: var(--shadow-sm);
  transform: translateX(4px);
}

.member-item:active {
  transform: translateX(2px);
}

/* 成員頭像區域 */
.member-avatar {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.member-avatar img {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-full);
  object-fit: cover;
  background: var(--color-bg-secondary);
}

/* 狀態點 */
.status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 14px;
  height: 14px;
  border-radius: var(--radius-full);
  border: 3px solid var(--color-bg-primary);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
}

.status-dot.online {
  background: #52c41a;
}

.status-dot.away {
  background: #faad14;
}

.status-dot.offline {
  background: #999;
}

/* 成員資訊 */
.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  margin: 0 0 var(--spacing-xs) 0;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-status {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* 成員箭頭 */
.member-arrow {
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  transition: color var(--transition);
}

.member-item:hover .member-arrow {
  color: var(--color-primary);
}

/* ==================== 新增：Header 按鈕樣式 ==================== */

.context-btn,
.memory-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: var(--text-sm);
  font-weight: 500;
  border-radius: var(--radius);
  transition: all var(--transition);
  border: none;
  cursor: pointer;
}

.context-btn {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.context-btn:hover {
  background: var(--color-bg-hover);
  box-shadow: var(--shadow-sm);
}

.memory-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.memory-btn:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.context-btn-label,
.memory-btn-label {
  font-weight: 500;
}

/* 面板操作區 */
.panel-actions {
  padding: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.panel-actions .btn {
  flex: 1;
  max-width: 200px;
}

:deep(i) {
  color: var(--color-info);
}

:deep(.tag-text) {
  color: var(--color-warning)!important;;
}

@media (max-width: 768px) {
  .chat-header {
    padding: var(--spacing-md) var(--spacing-xs);
  }

  .group-avatars {
    gap: 0;    
  }

  .avatar-small {  
    margin-left: -12px;
  }

  .messages-container {
    padding: var(--spacing-md) var(--spacing-xs) !important;
  }

  .message {
    max-width: 85%;
  }

  .input-container {
    padding: var(--spacing-md) var(--spacing-lg);
  }

  .memory-panel {
    max-width: 100%;
    max-height: 90vh;
  }

  /* 響應式：面板 */
  .panel {
    max-width: 100%;
    max-height: 85vh;
  }

  /* 響應式：Header 按鈕文字 */
  .context-btn-label,
  .memory-btn-label {
    display: none;
  }

  .context-btn,
  .memory-btn {
    padding: var(--spacing-sm);
  }

  /* 響應式：成員項目 */
  .member-item {
    padding: var(--spacing-md);
  }

  .member-avatar {
    width: 40px;
    height: 40px;
  }

  /* 響應式：情境面板 */
  .context-textarea {
    min-height: 120px;
  }

  .context-actions {
    flex-direction: column;
  }

  .context-actions .btn {
    width: 100%;
  }
}


</style>
