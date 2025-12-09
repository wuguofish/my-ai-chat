<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCharacterStore } from '@/stores/characters'
import { useRelationshipsStore } from '@/stores/relationships'
import { useChatRoomsStore } from '@/stores/chatRooms'
import { useModal } from '@/composables/useModal'
import { getRelationshipLevelInfo, getCharacterRelationshipTypeText } from '@/utils/relationshipHelpers'
import { useCharacterStatus } from '@/composables/useCharacterStatus'
import { SCHEDULE_TEMPLATES_V2 } from '@/utils/constants'
import { isTodayHolidaySync } from '@/utils/chatHelpers'
import type { Character } from '@/types'
import { Plus, ArrowLeft, MessageCircle, Edit, Bubbles, Trash2, X, Heart } from 'lucide-vue-next'

const { alert, confirm, confirmDanger } = useModal()

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const characterStore = useCharacterStore()
const relationshipsStore = useRelationshipsStore()
const chatRoomStore = useChatRoomsStore()

const userName = computed(() => userStore.userName as string)
const characterId = computed(() => route.params.id as string)
const character = ref<Character | null>(null)

// 取得使用者與角色的關係
const userRelationship = computed(() =>
  relationshipsStore.getUserCharacterRelationship(characterId.value)
)

// 顯示的貢獻者列表（包含當前使用者）
const displayContributors = computed(() => {
  if (!character.value) return []

  const author = character.value.importedMetadata?.author
  const contributors = character.value.importedMetadata?.contributors || []

  // 如果當前使用者不是作者，且不在貢獻者名單中，就加到最後
  if (userName.value && userName.value !== author && !contributors.includes(userName.value)) {
    return [...contributors, userName.value]
  }

  return contributors
})

// 取得角色與其他人的關係
const characterRelationships = computed(() =>
  relationshipsStore.getCharacterRelationships(characterId.value)
)

// 關係等級資訊（使用統一的 helper 函數）
const relationshipLevelInfo = computed(() => {
  if (!userRelationship.value) return null
  return getRelationshipLevelInfo(
    userRelationship.value.level,
    userRelationship.value.isRomantic
  )
})

onMounted(() => {
  const found = characterStore.getCharacterById(characterId.value)
  if (found) {
    character.value = found
    // 如果還沒有關係資料，初始化一個
    if (!userRelationship.value) {
      relationshipsStore.initUserCharacterRelationship(characterId.value)
    }
  } else {
    router.push('/main/characters')
  }
})

const handleStartChat = () => {
  if (!character.value) return

  // 檢查是否已有該角色的單人聊天室
  const existingRoom = chatRoomStore.chatRooms.find(
    room => room.type === 'single' &&
            room.characterIds.length === 1 &&
            room.characterIds[0] === characterId.value
  )

  if (existingRoom) {
    // 如果已有聊天室，直接導航過去
    router.push(`/main/chats/${existingRoom.id}`)
  } else {
    // 如果沒有聊天室，建立新的
    const roomId = chatRoomStore.createSingleChatRoom(character.value.id, character.value.name)
    router.push(`/main/chats/${roomId}`)
  }
}

const handleEdit = () => {
  router.push(`/main/characters/${characterId.value}/edit`)
}

const handleManageMemories = () => {
  router.push(`/main/characters/${characterId.value}/memories`)
}

// 狀態訊息編輯
const showStatusModal = ref(false)
const editingStatus = ref('')
const isGeneratingStatus = ref(false)

const handleEditStatus = () => {
  if (!character.value) return
  editingStatus.value = character.value.statusMessage || ''
  showStatusModal.value = true
}

const handleSaveStatus = () => {
  if (!character.value) return
  characterStore.updateCharacterStatus(characterId.value, editingStatus.value)
  showStatusModal.value = false
}

const handleClearStatus = async () => {
  if (!character.value) return
  if (await confirm('確定要清除狀態訊息嗎？')) {
    characterStore.clearCharacterStatus(characterId.value)
    showStatusModal.value = false
  }
}

const handleGenerateStatus = async () => {
  if (!character.value || !userStore.apiKey) return

  isGeneratingStatus.value = true
  try {
    // 動態導入 generateStatusMessage 函數
    const { generateStatusMessage } = await import('@/utils/chatHelpers')
    const { useMemoriesStore } = await import('@/stores/memories')
    const memoriesStore = useMemoriesStore()

    // 取得短期記憶
    const shortTermMemories = memoriesStore.getCharacterShortTermMemories(characterId.value)

    // 呼叫 AI 生成（帶入角色情緒）
    const statusMessage = await generateStatusMessage(
      character.value,
      { shortTermMemories, mood: character.value.mood },
      userStore.apiKey,
      userStore.profile?.age
    )

    editingStatus.value = statusMessage
  } catch (error) {
    console.error('生成狀態訊息失敗:', error)
    await alert('生成失敗，請稍後再試', { type: 'danger' })
  } finally {
    isGeneratingStatus.value = false
  }
}

// 角色狀態相關（使用共用 composable）
const { status: characterStatus, statusText: characterStatusText } = useCharacterStatus(character)

// 作息表資訊（支援新格式 schedule，並區分平日/假日）
const scheduleInfo = computed(() => {
  // 優先檢查新格式 schedule
  if (character.value?.schedule) {
    const isHoliday = isTodayHolidaySync()
    const todayPeriods = isHoliday
      ? character.value.schedule.holidayPeriods
      : character.value.schedule.workdayPeriods

    // 檢查是否符合某個模板
    const matchedTemplate = SCHEDULE_TEMPLATES_V2.find(template =>
      JSON.stringify(template.schedule.workdayPeriods) === JSON.stringify(character.value!.schedule!.workdayPeriods) &&
      JSON.stringify(template.schedule.holidayPeriods) === JSON.stringify(character.value!.schedule!.holidayPeriods)
    )

    return {
      type: matchedTemplate ? 'template' : 'custom',
      template: matchedTemplate || null,
      isHoliday,
      workdayPeriods: character.value.schedule.workdayPeriods,
      holidayPeriods: character.value.schedule.holidayPeriods,
      periods: todayPeriods  // 今天適用的時段
    }
  }

  // 向下相容：檢查舊格式 activePeriods
  if (character.value?.activePeriods && character.value.activePeriods.length > 0) {
    return {
      type: 'legacy',
      template: null,
      isHoliday: false,
      workdayPeriods: character.value.activePeriods,
      holidayPeriods: character.value.activePeriods,
      periods: character.value.activePeriods
    }
  }

  return { type: 'none', template: null, isHoliday: false, periods: [], workdayPeriods: [], holidayPeriods: [] }
})

// 調整關係（包含親密關係設定）
const showAdjustModal = ref(false)
const adjustAffection = ref(0)
const adjustIsRomantic = ref(false)
const adjustNote = ref('')

const handleAdjustRelationship = () => {
  if (!userRelationship.value) return

  adjustAffection.value = userRelationship.value.affection
  adjustIsRomantic.value = userRelationship.value.isRomantic
  adjustNote.value = userRelationship.value.note || ''
  showAdjustModal.value = true
}

const handleSaveAdjustment = async () => {
  // 更新好感度
  relationshipsStore.updateAffection(characterId.value, adjustAffection.value)
  // 更新親密關係設定
  relationshipsStore.toggleRomantic(characterId.value, adjustIsRomantic.value)
  // 更新備註
  relationshipsStore.updateRelationshipNote(characterId.value, adjustNote.value)

  showAdjustModal.value = false
  await alert('關係已更新', { type: 'success' })
}

// 管理角色間關係
const showAddRelationModal = ref(false)
const showEditRelationModal = ref(false)
const editingRelation = ref<{
  targetCharacterId: string
  relationshipType: string
  description: string
  note: string
  bidirectional: boolean
} | null>(null)

const newRelation = ref({
  targetCharacterId: '',
  relationshipType: 'neutral',
  description: '',
  note: '',
  bidirectional: true // 預設雙向關係
})

// 分別取得「目前角色對其他人」和「其他人對目前角色」的關係
const relationshipsFrom = computed(() =>
  characterRelationships.value.filter(rel => rel.fromCharacterId === characterId.value)
)

const relationshipsTo = computed(() =>
  characterRelationships.value.filter(rel => rel.toCharacterId === characterId.value)
)

// 取得可以建立關係的角色（排除自己和已有「目前角色→其他人」關係的）
const availableCharacters = computed(() => {
  const existingRelationIds = relationshipsFrom.value.map(rel => rel.toCharacterId)
  return characterStore.characters.filter(
    char => char.id !== characterId.value && !existingRelationIds.includes(char.id)
  )
})

const handleAddRelation = () => {
  showAddRelationModal.value = true
  newRelation.value = {
    targetCharacterId: '',
    relationshipType: 'neutral',
    description: '',
    note: '',
    bidirectional: true
  }
}

const handleSaveNewRelation = async () => {
  if (!newRelation.value.targetCharacterId || !newRelation.value.description.trim()) {
    await alert('請選擇好友並填寫關係描述', { type: 'warning' })
    return
  }

  relationshipsStore.addCharacterRelationship(
    {
      fromCharacterId: characterId.value,
      toCharacterId: newRelation.value.targetCharacterId,
      relationshipType: newRelation.value.relationshipType as any,
      description: newRelation.value.description,
      note: newRelation.value.note
    },
    newRelation.value.bidirectional
  )

  showAddRelationModal.value = false
  await alert(newRelation.value.bidirectional ? '雙向關係已新增' : '關係已新增', { type: 'success' })
}

const handleEditRelation = (targetId: string) => {
  // 只能編輯「目前角色→目標角色」的關係
  const relation = relationshipsFrom.value.find(rel => rel.toCharacterId === targetId)

  if (relation) {
    // 檢查是否有反向關係存在
    const reverseRelation = relationshipsTo.value.find(rel => rel.fromCharacterId === targetId)

    editingRelation.value = {
      targetCharacterId: relation.toCharacterId,
      relationshipType: relation.relationshipType,
      description: relation.description,
      note: relation.note || '',
      bidirectional: !!reverseRelation // 如果有反向關係，預設勾選
    }
    showEditRelationModal.value = true
  }
}

const handleSaveEditRelation = async () => {
  if (!editingRelation.value) return

  relationshipsStore.updateCharacterRelationship(
    characterId.value,
    editingRelation.value.targetCharacterId,
    {
      relationshipType: editingRelation.value.relationshipType as any,
      description: editingRelation.value.description,
      note: editingRelation.value.note
    },
    editingRelation.value.bidirectional
  )

  showEditRelationModal.value = false
  editingRelation.value = null
  await alert('關係已更新', { type: 'success' })
}

const handleDeleteRelation = async (targetId: string) => {
  if (await confirmDanger('確定要刪除這個關係嗎？')) {
    // 只刪除「目前角色→目標角色」的關係（單向刪除）
    const index = relationshipsStore.characterToCharacter.findIndex(
      r => r.fromCharacterId === characterId.value && r.toCharacterId === targetId
    )
    if (index !== -1) {
      relationshipsStore.characterToCharacter.splice(index, 1)
      await alert('關係已刪除', { type: 'success' })
    }
  }
}

// 刪除 LLM 評估的關係狀態
const handleDeleteState = async (fromId: string, toId: string) => {
  if (await confirmDanger('確定要清除這個關係狀態嗎？')) {
    relationshipsStore.deleteRelationshipState(fromId, toId)
  }
}

const handleDelete = async () => {
  if (character.value && await confirmDanger(`確定要刪除好友「${character.value.name}」嗎？`)) {
    // 同時刪除關係資料
    relationshipsStore.deleteAllRelationshipsForCharacter(characterId.value)
    characterStore.deleteCharacter(characterId.value)
    router.push('/main/characters')
  }
}

const handleBack = () => {
  router.push('/main/characters')
}

const getGenderText = (gender?: string) => {
  switch (gender) {
    case 'male':
      return '男'
    case 'female':
      return '女'
    default:
      return '未設定'
  }
}

const getDefaultAvatar = (name: string) => {
  const initial = name.charAt(0).toUpperCase()
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 200
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.fillStyle = '#667eea'
    ctx.fillRect(0, 0, 200, 200)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 96px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initial, 100, 100)
  }

  return canvas.toDataURL()
}

// 取得其他人名稱
const getCharacterName = (id: string) => {
  const char = characterStore.getCharacterById(id)
  return char ? char.name : '未知角色'
}

// 取得角色關係類型文字（使用共用函數）
const getRelationshipTypeText = getCharacterRelationshipTypeText
</script>

<template>
  <div v-if="character">
    <div class="header">
      <button class="back-btn" @click="handleBack">
        <ArrowLeft :size="20" />
        返回
      </button>
      <h3>
        好友資料
      </h3>
      <span class="btn-ghost btn"></span>
    </div>
    <div class="character-detail">
      <!-- 角色基本資訊卡片 -->
      <div class="profile-card">
        <div class="profile-section">
          <div class="avatar-wrapper">
            <div class="avatar">
              <img :src="character.avatar || getDefaultAvatar(character.name)" :alt="character.name">
            </div>
            <!-- 狀態指示燈 -->
            <div :class="['status-dot', `status-${characterStatus}`]" :title="characterStatusText"></div>
          </div>
          <div class="basic-info">
            <h1 class="name">{{ character.name }}</h1>
            <div class="status-message-container">
              <p v-if="character.statusMessage" class="status-message">{{ character.statusMessage }}</p>
              <p v-else class="status-message empty">尚未設定狀態訊息</p>
              <button class="btn btn-sm btn-primary-outline edit-status-btn" @click="handleEditStatus">
                <Edit :size="10" />
              </button>
            </div>

            <div class="meta">
              <span v-if="character.gender" class="meta-item">
                {{ getGenderText(character.gender) }}
              </span>
              <span v-if="character.age" class="meta-item">
                {{ character.age }}
              </span>
              <span v-if="character.profession" class="meta-item">
                {{ character.profession }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 功能按鈕區塊 -->
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">功能</h2>
        </div>
        <div class="function-grid">
          <button class="function-btn primary" @click="handleStartChat">
            <span class="icon">
              <MessageCircle :size="32" />
            </span>
            <span class="text">開始聊天</span>
          </button>
          <button class="function-btn" @click="handleEdit">
            <span class="icon">
              <Edit :size="32" />
            </span>
            <span class="text">編輯資料</span>
          </button>
          <button class="function-btn" @click="handleManageMemories">
            <span class="icon">
              <Bubbles :size="32" />
            </span>
            <span class="text">管理記憶</span>
          </button>
          <button class="function-btn danger" @click="handleDelete">
            <span class="icon">
              <Trash2 :size="32" />
            </span>
            <span class="text">刪除好友</span>
          </button>
        </div>
      </div>

      <!-- 作息表區塊 -->
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">作息表</h2>
          <span v-if="scheduleInfo.type !== 'none'" class="schedule-day-indicator">
            {{ scheduleInfo.isHoliday ? '<span class="text-red">🎉 今天是假日</span>' : '💼 今天是平日' }}
          </span>
        </div>
        <div v-if="scheduleInfo.type === 'none'" class="schedule-empty">
          尚未設定作息表（將永久離線）
        </div>
        <div v-else class="schedule-display">
          <div v-if="scheduleInfo.type === 'template'" class="schedule-template-name">
            {{ scheduleInfo.template?.name }}
          </div>
          <div v-else-if="scheduleInfo.type === 'legacy'" class="schedule-template-name">
            舊版作息（平日假日相同）
          </div>
          <div v-else class="schedule-template-name">
            自訂作息
          </div>

          <!-- 平日作息 -->
          <div class="schedule-section">
            <div class="schedule-section-title">平日作息</div>
            <div class="schedule-periods">
              <div v-for="(period, index) in scheduleInfo.workdayPeriods" :key="'workday-' + index" class="schedule-period-item">
                <div class="period-time">
                  {{ String(period.start).padStart(2, '0') }}:00 - {{ String(period.end).padStart(2, '0') }}:00
                </div>
                <div :class="['status-badge', period.status]">
                  {{ period.status === 'online' ? '在線' : period.status === 'away' ? '忙碌中' : '離線' }}
                </div>
              </div>
            </div>
          </div>

          <!-- 假日作息 -->
          <div class="schedule-section">
            <div class="schedule-section-title text-red">假日作息</div>
            <div class="schedule-periods">
              <div v-for="(period, index) in scheduleInfo.holidayPeriods" :key="'holiday-' + index" class="schedule-period-item">
                <div class="period-time">
                  {{ String(period.start).padStart(2, '0') }}:00 - {{ String(period.end).padStart(2, '0') }}:00
                </div>
                <div :class="['status-badge', period.status]">
                  {{ period.status === 'online' ? '在線' : period.status === 'away' ? '忙碌中' : '離線' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 使用者與角色的關係 -->
      <div v-if="userRelationship" class="section">
        <div class="section-header">
          <h2 class="section-title">與你的關係</h2>
          <button class="btn btn-warning btn-sm" @click="handleAdjustRelationship">
            <Edit :size="14" /> 編輯
          </button>
        </div>
        <div class="relationship-card">
          <div class="relationship-header">
            <div class="relationship-level">
              <span class="level-badge" :style="{ backgroundColor: relationshipLevelInfo?.color }">
                {{ relationshipLevelInfo?.name }}
              </span>
              <span v-if="userRelationship.isRomantic" class="romance-badge">
                <Heart :size="16" fill="#d32f2f" />
                <span>親密關係</span>
              </span>
            </div>
            <div class="affection-value">好感度：{{ userRelationship.affection }}</div>
          </div>

          <div class="affection-bar-container">
            <div class="affection-bar" :style="{
              width: `${Math.min((userRelationship.affection / 200) * 100, 100)}%`,
              backgroundColor: relationshipLevelInfo?.color
            }" />
          </div>

          <div v-if="userRelationship.note" class="relationship-note">
            <div class="note-label">備註</div>
            <div class="note-content">{{ userRelationship.note }}</div>
          </div>
        </div>
      </div>

      <!-- 好友對其他人的關係 -->
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">{{ character?.name }} 對其他好友的關係</h2>
          <button v-if="availableCharacters.length > 0" class="btn btn-primary btn-sm" @click="handleAddRelation">
            <Plus :size="14" /> 新增
          </button>
        </div>
        <div v-if="relationshipsFrom.length > 0" class="character-relationships">
          <div v-for="rel in relationshipsFrom" :key="`${rel.fromCharacterId}-${rel.toCharacterId}`"
            class="relationship-item editable">
            <div class="relationship-content">
              <div class="relationship-item-header">
                <span class="character-name">
                  {{ getCharacterName(rel.toCharacterId) }}
                </span>
                <span class="relationship-type">
                  {{ getRelationshipTypeText(rel.relationshipType) }}
                </span>
              </div>
              <div class="relationship-description">{{ rel.description }}</div>
              <div v-if="rel.note" class="relationship-note-small">{{ rel.note }}</div>
              <div v-if="rel.state" class="relationship-state">
                <span class="state-label">目前狀態：</span>
                <span class="state-content">{{ rel.state }}</span>
                <button class="btn-ghost-small" @click="handleDeleteState(rel.fromCharacterId, rel.toCharacterId)"
                  title="清除狀態">
                  <X :size="14" />
                </button>
              </div>
            </div>
            <div class="relationship-actions">
              <button class="btn btn-sm btn-warning" @click="handleEditRelation(rel.toCharacterId)">
                <Edit :size="16" color="white" />
              </button>
              <button class="btn btn-sm btn-danger" @click="handleDeleteRelation(rel.toCharacterId)">
                <Trash2 :size="16" color="white" />
              </button>
            </div>
          </div>
        </div>
        <div v-else class="empty-state-small">
          尚未設定對其他人的關係
        </div>
      </div>

      <!-- 其他人對此好友的關係 -->
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">其他好友對 {{ character?.name }} 的關係</h2>
        </div>
        <div v-if="relationshipsTo.length > 0" class="character-relationships">
          <div v-for="rel in relationshipsTo" :key="`${rel.fromCharacterId}-${rel.toCharacterId}`"
            class="relationship-item readonly">
            <div class="relationship-item-header">
              <span class="character-name">
                {{ getCharacterName(rel.fromCharacterId) }}
              </span>
              <span class="relationship-type">
                {{ getRelationshipTypeText(rel.relationshipType) }}
              </span>
            </div>
            <div class="relationship-description">{{ rel.description }}</div>
            <div v-if="rel.note" class="relationship-note-small">{{ rel.note }}</div>
            <div v-if="rel.state" class="relationship-state">
              <span class="state-label">目前狀態：</span>
              <span class="state-content">{{ rel.state }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-state-small">
          尚無其他人設定對 {{ character?.name }} 的關係
        </div>
      </div>

      <!-- 認識的人類朋友（作者與經手人） -->
      <div class="human-friends-section">
        <div class="human-friends-label">認識的人類朋友</div>
        <div class="human-friends-content">
          <span>
            <b>{{ new Date(character.createdAt).toLocaleDateString() }}</b>
            在<b class="text-primary-dark">{{ character?.importedMetadata?.author || userName }}</b>介紹下，加入「愛茶的」
          </span>
          <template v-if="displayContributors.length > 0 && character?.importedMetadata?.author">
            <br />
            <span>之後依序和以下的朋友們相遇：</span>
            <span v-for="(contributor, index) in displayContributors" :key="index">
              <b>{{ contributor }}</b><span v-if="index < displayContributors.length - 1">, </span>
            </span>
          </template>
        </div>
      </div>

      <!-- 調整關係 Modal -->
      <div v-if="showAdjustModal" class="modal-overlay" @click="showAdjustModal = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>調整關係</h3>
            <button class="modal-close" @click="showAdjustModal = false">
              <X :size="24" />
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>好感度：{{ adjustAffection }}</label>
              <input v-model.number="adjustAffection" type="range" min="-300" max="300" step="1"
                class="affection-slider">
              <div class="affection-hint">
                {{

                relationshipsStore.calculateRelationshipLevel(adjustAffection) === 'enemy' ? '仇敵 (-100以下)' :
                relationshipsStore.calculateRelationshipLevel(adjustAffection) === 'dislike' ? '不爽 (-100 ~ -30)' :
                relationshipsStore.calculateRelationshipLevel(adjustAffection) === 'stranger' ? '陌生人 (-30 ~ 10)' :
                relationshipsStore.calculateRelationshipLevel(adjustAffection) === 'acquaintance' ? '認識 (10 ~ 30)' :
                relationshipsStore.calculateRelationshipLevel(adjustAffection) === 'friend' ? '朋友 (30 ~ 80)' :
                relationshipsStore.calculateRelationshipLevel(adjustAffection) === 'close_friend' ? '好友/曖昧 (80 ~ 200)' :
                '摯友/戀人 (200以上)' }}
              </div>
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input v-model="adjustIsRomantic" type="checkbox">
                <span>允許發展親密關係（戀愛）</span>
              </label>
            </div>
            <div class="form-group">
              <label>關係備註</label>
              <textarea v-model="adjustNote" class="input-field" placeholder="記錄你們之間的特殊關係或重要事件..." rows="4" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showAdjustModal = false">取消</button>
            <button class="btn btn-primary" @click="handleSaveAdjustment">儲存</button>
          </div>
        </div>
      </div>

      <!-- 新增好友關係 Modal -->
      <div v-if="showAddRelationModal" class="modal-overlay" @click="showAddRelationModal = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>新增好友關係</h3>
            <button class="modal-close" @click="showAddRelationModal = false">
              <X :size="24" />
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>選擇好友</label>
              <select v-model="newRelation.targetCharacterId" class="input-field">
                <option value="">請選擇好友</option>
                <option v-for="char in availableCharacters" :key="char.id" :value="char.id">
                  {{ char.name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>關係類型</label>
              <select v-model="newRelation.relationshipType" class="input-field">
                <option value="neutral">普通</option>
                <option value="friend">朋友</option>
                <option value="rival">競爭</option>
                <option value="family">家人</option>
                <option value="romantic">戀愛</option>
                <option value="custom">自訂</option>
              </select>
            </div>
            <div class="form-group">
              <label>關係描述</label>
              <textarea v-model="newRelation.description" class="input-field" placeholder="描述兩人之間的關係..." rows="3" />
            </div>
            <div class="form-group">
              <label>備註（選填）</label>
              <textarea v-model="newRelation.note" class="input-field" placeholder="額外的補充說明..." rows="2" />
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input v-model="newRelation.bidirectional" type="checkbox">
                <span>同時設定對方的關係（雙向關係）</span>
              </label>
              <p class="form-hint">勾選後，對方也會自動建立相同的關係</p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showAddRelationModal = false">取消</button>
            <button class="btn btn-primary" @click="handleSaveNewRelation">新增</button>
          </div>
        </div>
      </div>

      <!-- 編輯好友關係 Modal -->
      <div v-if="showEditRelationModal" class="modal-overlay" @click="showEditRelationModal = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>編輯好友關係</h3>
            <button class="modal-close" @click="showEditRelationModal = false">
              <X :size="24" />
            </button>
          </div>
          <div class="modal-body">
            <div v-if="editingRelation" class="form-group">
              <label>對象好友</label>
              <div class="input-field" style="background: var(--color-bg-secondary); cursor: not-allowed">
                {{ getCharacterName(editingRelation.targetCharacterId) }}
              </div>
            </div>
            <div v-if="editingRelation" class="form-group">
              <label>關係類型</label>
              <select v-model="editingRelation.relationshipType" class="input-field">
                <option value="neutral">普通</option>
                <option value="friend">朋友</option>
                <option value="rival">競爭</option>
                <option value="family">家人</option>
                <option value="romantic">戀愛</option>
                <option value="custom">自訂</option>
              </select>
            </div>
            <div v-if="editingRelation" class="form-group">
              <label>關係描述</label>
              <textarea v-model="editingRelation.description" class="input-field" placeholder="描述兩人之間的關係..." rows="3" />
            </div>
            <div v-if="editingRelation" class="form-group">
              <label>備註（選填）</label>
              <textarea v-model="editingRelation.note" class="input-field" placeholder="額外的補充說明..." rows="2" />
            </div>
            <div v-if="editingRelation" class="form-group">
              <label class="checkbox-label">
                <input v-model="editingRelation.bidirectional" type="checkbox">
                <span>同步更新對方的關係（雙向同步）</span>
              </label>
              <p class="form-hint">勾選後，對方的關係也會一起更新</p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showEditRelationModal = false">取消</button>
            <button class="btn btn-primary" @click="handleSaveEditRelation">儲存</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 編輯狀態訊息 Modal -->
    <div v-if="showStatusModal" class="modal-overlay" @click="showStatusModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>編輯狀態訊息</h3>
          <button class="modal-close" @click="showStatusModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>狀態訊息（30 字以內）</label>
            <div class="input-with-button">
              <input v-model="editingStatus" type="text" class="input-field" maxlength="30" placeholder="例如：今天心情不錯 ☕" />
              <button class="btn btn-success btn-sm" @click="handleGenerateStatus" :disabled="isGeneratingStatus">
                {{ isGeneratingStatus ? '生成中...' : 'AI 生成' }}
              </button>
            </div>
            <p class="hint">{{ editingStatus.length }}/30 字</p>
          </div>
        </div>
        <div class="modal-footer">
          <button v-if="character?.statusMessage" class="btn btn-danger" @click="handleClearStatus">清除狀態</button>
          <button class="btn btn-secondary" @click="showStatusModal = false">取消</button>
          <button class="btn btn-primary" @click="handleSaveStatus">儲存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-detail {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--spacing-xl) var(--spacing-xl) 80px var(--spacing-xl);
}

/* 角色資訊卡片 */
.profile-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  overflow: hidden;
  margin-bottom: var(--spacing-xl);
}

.profile-section {
  display: flex;
  align-items: center;
  padding: var(--spacing-2xl);
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-text-white);
}

.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 100px;
  height: 100px;
  border-radius: var(--radius-full);
  overflow: hidden;
  border: 4px solid var(--color-text-white);
  box-shadow: var(--shadow-md);
  flex-shrink: 0;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 狀態指示燈 */
.status-dot {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  border: 3px solid var(--color-text-white);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* 狀態顏色已在全域 style.css 定義 */

.basic-info {
  flex: 1;
  margin-left: var(--spacing-2xl);
  text-align: left;
}

.name {
  color: var(--color-text-white);
  font-size: var(--text-4xl);
  font-weight: 700;
  margin: 0 0 var(--spacing-md) 0;
}

.meta {
  display: flex;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.meta-item {
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
}

/* 功能按鈕網格 */
.function-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-md);
}

.function-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl) var(--spacing-md);
  background: var(--color-bg-secondary);
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition);
  min-height: 100px;
  color: var(--color-text-primary);
}

.function-btn:hover {
  background: var(--color-bg-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.function-btn.primary {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: var(--color-text-white);
}

.function-btn.primary:hover {
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
}

.function-btn.danger {
  color: var(--color-error);
}

.function-btn.danger:hover {
  background: var(--color-error);
  color: #fff;
}

.function-btn .icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-sm);
}

.function-btn .text {
  font-size: var(--text-base);
  font-weight: 500;
}

/* 關係卡片 */
.relationship-card {
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
}

.relationship-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.relationship-level {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.level-badge {
  padding: 6px var(--spacing-lg);
  border-radius: var(--radius-full);
  color: var(--color-text-white);
  font-size: var(--text-base);
  font-weight: 600;
}

.romance-badge {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background: #ffe0e6;
  color: #d32f2f;
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
}

.affection-value {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}

.affection-bar-container {
  height: 12px;
  background: var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: var(--spacing-lg);
}

.affection-bar {
  height: 100%;
  transition: all var(--transition-slow);
  border-radius: var(--radius-sm);
}

.relationship-note {
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

.note-label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
}

.note-content {
  font-size: var(--text-base);
  color: var(--color-text-primary);
  line-height: 1.5;
}

/* 角色間關係 */
.character-relationships {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.relationship-item {
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
}

.relationship-item.editable {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.relationship-item.readonly {
  opacity: 0.8;
  background: var(--color-bg-secondary);
  border: 1px dashed var(--color-border);
}

.relationship-content {
  flex: 1;
}

.relationship-actions {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: flex-end;
  align-self: flex-end;
}

.empty-state-small {
  text-align: center;
  padding: var(--spacing-2xl);
  color: var(--color-text-secondary);
  font-size: var(--text-base);
}

.relationship-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.character-name {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}

.relationship-type {
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-primary);
  color: var(--color-text-white);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
}

.relationship-description {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: var(--spacing-sm);
}

.relationship-note-small {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  font-style: italic;
}

/* LLM 評估的關係狀態 */
.relationship-state {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
  margin-bottom: var(--spacing-sm);
  border-left: 3px solid var(--color-primary);
}

.state-label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.state-content {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.btn-ghost-small {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xs);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-tertiary);
  transition: all var(--transition);
}

.btn-ghost-small:hover {
  background: var(--color-bg-hover);
  color: var(--color-error);
}

/* 認識的人類朋友 */
.human-friends-section {
  text-align: center;
  padding: var(--spacing-xl) var(--spacing-lg) var(--spacing-2xl);
  margin-top: var(--spacing-2xl);
  border-top: 1px solid var(--color-border);
}

.human-friends-label {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-xs);
  font-weight: 500;
}

.human-friends-content {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* Modal 專屬樣式 */
.affection-slider {
  width: 100%;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-border);
  outline: none;
  margin: var(--spacing-md) 0;
}

.affection-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  cursor: pointer;
}

.affection-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  cursor: pointer;
  border: none;
}

.affection-hint {
  text-align: center;
  font-size: var(--text-base);
  color: var(--color-primary);
  font-weight: 600;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  font-weight: normal;
}

.checkbox-label input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.checkbox-label span {
  font-size: var(--text-base);
  color: var(--color-text-primary);
}

.form-hint {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-top: var(--spacing-xs);
  margin-bottom: 0;
}

/* 角色關係管理 Modal 樣式 */
.relations-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-top: var(--spacing-lg);
}

.relation-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  border-radius: var(--radius-lg);
  border: none;
}

.relation-item-content {
  flex: 1;
}

.relation-target {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-white);
  margin-bottom: var(--spacing-xs);
}

.relation-type-badge {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(255, 255, 255, 0.25);
  color: var(--color-text-white);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
  margin-bottom: var(--spacing-sm);
  font-weight: 600;
}

.relation-description {
  font-size: var(--text-base);
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: var(--spacing-xs);
}

.relation-note {
  font-size: var(--text-sm);
  color: rgba(255, 255, 255, 0.7);
  font-style: italic;
}

.relation-actions {
  display: flex;
  gap: var(--spacing-sm);
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .character-detail {
    padding: var(--spacing-md) var(--spacing-md) 80px var(--spacing-md);
  }

  .profile-section {
    flex-direction: column;
    text-align: center;
  }

  .basic-info {
    margin-left: 0;
    margin-top: var(--spacing-lg);
    text-align: center;
  }

  .meta {
    justify-content: center;
  }

  .function-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .relationship-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-md);
  }
}

/* 狀態訊息樣式 */
.status-message-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin: var(--spacing-sm) 0;
}

.status-message {
  flex: 1;
  font-size: var(--text-base);
  color: var(--color-text-light);
  font-style: italic;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-message.empty {
  color: var(--color-text-tertiary);
}

.edit-status-btn {
  padding: var(--spacing-sm);
}

.hint {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-xs);
}

.input-with-button {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
}

.input-with-button .input-field {
  flex: 1;
}

/* 作息表樣式 */
.schedule-empty {
  text-align: center;
  padding: var(--spacing-2xl);
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg);
}

.schedule-display {
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
}

.schedule-day-indicator {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius);
}

.schedule-template-name {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
  font-weight: 600;
}

.schedule-section {
  margin-bottom: var(--spacing-lg);
}

.schedule-section:last-child {
  margin-bottom: 0;
}

.schedule-section-title {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-sm);
  font-weight: 600;
}

.schedule-periods {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.schedule-period-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  background: var(--color-bg-primary);
  border-radius: var(--radius);
  transition: all var(--transition);
}

.schedule-period-item:hover {
  background: var(--color-bg-hover);
}

.period-time {
  font-size: var(--text-base);
  color: var(--color-text-primary);
  font-weight: 500;
}

/* 使用全域 .status-badge 樣式 */
</style>
