<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCharacterStore } from '@/stores/characters'
import { useUserStore } from '@/stores/user'
import type { Character, Gender, LLMProviderType } from '@/types'
import { LIMITS, SCHEDULE_TEMPLATES_V2 } from '@/utils/constants'
import AvatarCropper from '@/components/common/AvatarCropper.vue'
import { v4 as uuidv4 } from 'uuid'
import { ArrowLeft, FolderLock } from 'lucide-vue-next'
import { getImplementedProviders, getProviderConfig } from '@/services/llm'

const router = useRouter()
const route = useRoute()
const characterStore = useCharacterStore()
const userStore = useUserStore()

const isEditMode = computed(() => !!route.params.id)
const editingCharacterId = computed(() => route.params.id as string)

// 表單模式
const isAdvancedMode = ref(false)

// 基本資料
const name = ref('')
const gender = ref<Gender>('unset')
const age = ref('')
const birthday = ref('')
const profession = ref('')
const personality = ref('')
const speakingStyle = ref('')
const background = ref('')
const likes = ref('')
const dislikes = ref('')
const avatar = ref('')

// 進階資料
const systemPrompt = ref('')
const maxOutputTokens = ref<number>(2048)
const llmProvider = ref<LLMProviderType | ''>('')  // 空字串表示使用全域預設

// 已實作的服務商列表
const implementedProviders = computed(() => getImplementedProviders())

// 作息時間（預設為上班族模板）
const scheduleMode = ref<'disabled' | 'template' | 'custom'>('template')
const selectedTemplateId = ref('office-worker')

// 用於預覽的 tab 狀態
const schedulePreviewTab = ref<'workday' | 'holiday'>('workday')

// 事件記憶
const events = ref<string[]>([])
const newEvent = ref('')

// 裁剪相關
const showCropper = ref(false)
const originalImage = ref('')

const error = ref('')

// 是否為隱藏設定的名片（匯入後標記為唯讀）
const isPrivate = ref(false)

// 載入編輯資料
onMounted(() => {
  if (isEditMode.value) {
    const character = characterStore.getCharacterById(editingCharacterId.value)
    if (character) {
      isPrivate.value = character.isPrivate || false
      name.value = character.name
      gender.value = character.gender || 'unset'
      age.value = character.age || ''
      birthday.value = character.birthday || ''
      profession.value = character.profession || ''
      personality.value = character.personality || ''
      speakingStyle.value = character.speakingStyle || ''
      background.value = character.background || ''
      likes.value = character.likes || ''
      dislikes.value = character.dislikes || ''
      avatar.value = character.avatar
      systemPrompt.value = character.systemPrompt || ''
      maxOutputTokens.value = character.maxOutputTokens || 2048
      llmProvider.value = character.llmProvider || ''
      events.value = (character.events || []).filter((e): e is string => typeof e === 'string')

      // 載入作息時間設定
      if (character.schedule) {
        // 最新格式：區分平日/假日
        const matchedTemplate = SCHEDULE_TEMPLATES_V2.find(template =>
          JSON.stringify(template.schedule) === JSON.stringify(character.schedule)
        )

        if (matchedTemplate) {
          scheduleMode.value = 'template'
          selectedTemplateId.value = matchedTemplate.id
        } else {
          // 有 schedule 但不匹配模板（自訂）
          scheduleMode.value = 'custom'
        }
      } else if (character.activePeriods && character.activePeriods.length > 0) {
        // 舊格式：不分平日假日，預設為「全天候在線」模板
        scheduleMode.value = 'template'
        selectedTemplateId.value = 'always-online'
      } else if (character.activeHours) {
        // 最舊格式：轉換為模板模式
        scheduleMode.value = 'template'
        selectedTemplateId.value = 'always-online'
      } else {
        scheduleMode.value = 'disabled'
      }
    } else {
      router.push('/main/characters')
    }
  }
})

const handleSubmit = () => {
  // 驗證必填欄位
  if (!name.value.trim()) {
    error.value = '請輸入好友名稱'
    return
  }

  // 如果不是隱藏設定的名片，性格描述是必填的
  if (!isPrivate.value && !personality.value.trim()) {
    error.value = '請輸入性格描述'
    return
  }

  // 新增模式時，先檢查是否可以新增
  if (!isEditMode.value && !characterStore.canAddMore) {
    error.value = `好友數量已達上限（${LIMITS.MAX_CHARACTERS}位），請先刪除一些好友`
    return
  }

  // 取得原始角色資料（保留 isPrivate 和 importedMetadata）
  const originalCharacter = isEditMode.value
    ? characterStore.getCharacterById(editingCharacterId.value)
    : null

  const characterData: Character = {
    id: isEditMode.value ? editingCharacterId.value : uuidv4(),
    name: name.value.trim(),
    gender: gender.value !== 'unset' ? gender.value : undefined,
    age: age.value ? String(age.value).trim() : undefined,
    birthday: birthday.value.trim() || undefined,
    profession: profession.value.trim() || undefined,
    personality: personality.value.trim(),
    speakingStyle: speakingStyle.value.trim() || undefined,
    background: background.value.trim() || undefined,
    likes: likes.value.trim() || undefined,
    dislikes: dislikes.value.trim() || undefined,
    avatar: avatar.value || getDefaultAvatar(name.value),
    systemPrompt: systemPrompt.value.trim() || undefined,
    maxOutputTokens: maxOutputTokens.value || undefined,
    llmProvider: llmProvider.value || undefined,  // 空字串存為 undefined
    events: events.value.filter(e => typeof e === 'string' && e.trim() !== ''),

    // 儲存作息時間（使用最新的 schedule 格式）
    schedule: scheduleMode.value === 'template'
      ? SCHEDULE_TEMPLATES_V2.find(t => t.id === selectedTemplateId.value)?.schedule
      : undefined,
    // 清除舊格式欄位
    activePeriods: undefined,
    activeHours: undefined,

    // 保留 isPrivate 和 importedMetadata（如果是編輯模式）
    isPrivate: originalCharacter?.isPrivate,
    importedMetadata: originalCharacter?.importedMetadata,

    // 保留狀態訊息（如果是編輯模式）
    statusMessage: originalCharacter?.statusMessage,
    statusUpdatedAt: originalCharacter?.statusUpdatedAt,

    createdAt: originalCharacter?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  try {
    if (isEditMode.value) {
      characterStore.updateCharacter(characterData)
    } else {
      characterStore.addCharacter(characterData)
    }

    router.push('/main/characters')
  } catch (err) {
    // 處理可能的錯誤（例如達到上限）
    error.value = err instanceof Error ? err.message : '新增好友時發生錯誤，請稍後再試'
  }
}

const handleCancel = () => {
  router.back()
}

const handleAvatarUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      originalImage.value = e.target?.result as string
      showCropper.value = true
    }
    reader.readAsDataURL(file)
  }
}

const handleCropConfirm = (croppedImage: string) => {
  avatar.value = croppedImage
  showCropper.value = false
  originalImage.value = ''
}

const handleCropCancel = () => {
  showCropper.value = false
  originalImage.value = ''
}

const addEvent = () => {
  if (newEvent.value.trim() && events.value.length < LIMITS.MAX_CHARACTER_EVENTS) {
    events.value.push(newEvent.value.trim())
    newEvent.value = ''
  }
}

const removeEvent = (index: number) => {
  events.value.splice(index, 1)
}

const getDefaultAvatar = (name: string) => {
  const initial = name.charAt(0).toUpperCase()
  const canvas = document.createElement('canvas')
  canvas.width = 100
  canvas.height = 100
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.fillStyle = '#667eea'
    ctx.fillRect(0, 0, 100, 100)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initial, 50, 50)
  }

  return canvas.toDataURL()
}
</script>

<template>
  <div class="header">
    <button class="back-btn" @click="handleCancel">
      <ArrowLeft :size="20" />
      返回
    </button>
    <h3>
      {{ isEditMode ? '編輯好友' : '新增好友' }}
    </h3>
    <label class="toggle-switch">
      <input type="checkbox" v-model="isAdvancedMode">
      <span class="toggle-slider"></span>
      <span class="toggle-label">進階模式</span>
    </label>
  </div>
  <div class="character-form">
    <div class="form-content">
      <!-- 頭像上傳 -->
      <div class="form-section">
        <h3>頭像</h3>
        <div class="avatar-upload">
          <div class="avatar-preview">
            <img v-if="avatar" :src="avatar" alt="頭像">
            <div v-else class="avatar-placeholder">
              📷
            </div>
          </div>
          <label for="avatar-input" class="upload-btn">
            上傳頭像
          </label>
          <input id="avatar-input" type="file" accept="image/*" style="display: none" @change="handleAvatarUpload">
        </div>
      </div>

      <!-- 基本資料 -->
      <div class="form-section">
        <h3>基本資料</h3>

        <div class="form-group">
          <label for="name">名稱 *</label>
          <input id="name" v-model="name" type="text" placeholder="輸入好友的名稱" class="input-field" maxlength="20"
            :readonly="isPrivate">
        </div>

        <div class="form-group">
          <label>性別（選填）</label>
          <div class="radio-group">
            <label class="radio-item">
              <input v-model="gender" type="radio" value="male" :disabled="isPrivate">
              <span>男</span>
            </label>
            <label class="radio-item">
              <input v-model="gender" type="radio" value="female" :disabled="isPrivate">
              <span>女</span>
            </label>
            <label class="radio-item">
              <input v-model="gender" type="radio" value="unset" :disabled="isPrivate">
              <span>未設定</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="age">年齡（選填）</label>
          <input
            id="age"
            v-model="age"
            type="number"
            min="1"
            max="9999"
            placeholder="請輸入數字"
            class="input-field"
            :readonly="isPrivate"
          >
        </div>

        <div class="form-group">
          <label for="birthday">生日（選填）</label>
          <input
            id="birthday"
            v-model="birthday"
            type="text"
            placeholder="MM-DD（例如：03-14）"
            class="input-field"
            maxlength="5"
            :readonly="isPrivate"
          >
          <div class="help-text">格式：月-日，例如 03-14 代表 3 月 14 日</div>
        </div>

        <div class="form-group">
          <label for="profession">職業（選填）</label>
          <input id="profession" v-model="profession" type="text" placeholder="例如：軟體工程師" class="input-field"
            maxlength="30" :readonly="isPrivate">
        </div>

        <!-- 如果是隱藏設定的名片，顯示「等你來挖掘」區塊 -->
        <div v-if="isPrivate" class="private-placeholder">
          <div class="private-icon">
            <FolderLock :size="48" :stroke-width="1.5" />
          </div>
          <p class="private-text">這些內容是他的小秘密</p>
          <p class="private-hint">透過與 {{ name }} 的互動，慢慢挖掘他的性格吧～</p>
        </div>

        <!-- 一般模式：可編輯 -->
        <template v-else>
          <div class="form-group">
            <label for="personality">性格 *</label>
            <textarea id="personality" v-model="personality" placeholder="描述這個好友的性格特質（例如：開朗活潑、善解人意）"
              class="textarea-field" :maxlength="LIMITS.MAX_CHARACTER_PERSONALITY_LENGTH" rows="3" />
            <div class="char-count">{{ personality.length }}/{{ LIMITS.MAX_CHARACTER_PERSONALITY_LENGTH }}</div>
          </div>

          <div class="form-group">
            <label for="speakingStyle">說話風格（選填）</label>
            <textarea id="speakingStyle" v-model="speakingStyle" placeholder="描述說話的方式和語氣（例如：溫柔體貼、幽默風趣）"
              class="textarea-field" :maxlength="LIMITS.MAX_CHARACTER_SPEAKING_STYLE_LENGTH" rows="3" />
            <div class="char-count">{{ speakingStyle.length }}/{{ LIMITS.MAX_CHARACTER_SPEAKING_STYLE_LENGTH }}</div>
          </div>

          <div class="form-group">
            <label for="background">背景故事（選填）</label>
            <textarea id="background" v-model="background" placeholder="描述背景和經歷" class="textarea-field"
              :maxlength="LIMITS.MAX_CHARACTER_BACKGROUND_LENGTH" rows="4" />
            <div class="char-count">{{ background.length }}/{{ LIMITS.MAX_CHARACTER_BACKGROUND_LENGTH }}</div>
          </div>

          <div class="form-group">
            <label for="likes">喜歡的事物（選填）</label>
            <input id="likes" v-model="likes" type="text" placeholder="例如：音樂、旅行、美食" class="input-field" maxlength="100">
          </div>

          <div class="form-group">
            <label for="dislikes">討厭的事物（選填）</label>
            <input id="dislikes" v-model="dislikes" type="text" placeholder="例如：吵鬧、不誠實" class="input-field"
              maxlength="100">
          </div>
        </template>
      </div>

      <!-- 事件記憶 -->
      <div class="form-section">
        <h3>重要事件（選填）</h3>
        <p class="section-desc">記錄與這位好友相關的重要事件或記憶（最多 {{ LIMITS.MAX_CHARACTER_EVENTS }} 筆）</p>
        <div v-if="!isPrivate" class="form-group">
          <textarea v-model="newEvent" type="text" placeholder='輸入事件描述' class="textarea-field"
            :maxlength="LIMITS.MAX_CHARACTER_EVENT_LENGTH" rows="6" />
          <div class="char-count">{{ newEvent.length }}/{{ LIMITS.MAX_CHARACTER_EVENT_LENGTH }}</div>
          <button class="btn-add" :disabled="events.length >= LIMITS.MAX_CHARACTER_EVENTS" @click="addEvent">
            新增
          </button>
        </div>
        <div v-if="events.length > 0" class="event-list">
          <h4>重要事件列表</h4>
          <div v-for="(event, index) in events" :key="index" class="event-item">
            <span class="event-text">{{ event }}</span>
            <button v-if="!isPrivate" class="event-delete" @click="removeEvent(index)">✕</button>
          </div>
        </div>
        <div v-else-if="isPrivate" class="empty-hint">
          這個好友沒有記錄重要事件
        </div>
      </div>

      <!-- 作息時間設定 -->
      <div class="form-section">
        <h3>作息時間設定（選填）</h3>
        <p class="section-desc">設定好友的作息習慣，影響群組聊天時的回應機率</p>

        <div class="form-group">
          <label>選擇模式</label>
          <div class="schedule-mode-tabs">
            <!-- <button
              type="button"
              :class="['mode-tab', { active: scheduleMode === 'disabled' }]"
              @click="scheduleMode = 'disabled'"
            >
              停用
            </button> -->
            <button type="button" :class="['mode-tab', { active: scheduleMode === 'template' }]"
              @click="scheduleMode = 'template'" :disabled="isPrivate">
              快速模板
            </button>
            <button type="button" :class="['mode-tab', { active: scheduleMode === 'custom' }]"
              @click="scheduleMode = 'custom'" :disabled="isPrivate">
              自訂時段
            </button>
          </div>
        </div>

        <!-- 模板選擇 -->
        <div v-if="scheduleMode === 'template'" class="form-group">
          <label for="scheduleTemplate">選擇作息模板</label>
          <select id="scheduleTemplate" v-model="selectedTemplateId" class="input-field" :disabled="isPrivate">
            <option v-for="template in SCHEDULE_TEMPLATES_V2" :key="template.id" :value="template.id">
              {{ template.name }} - {{ template.description }}
            </option>
          </select>
          <div class="template-preview">
            <!-- 平日/假日 Tab 切換 -->
            <div class="schedule-tabs">
              <button
                type="button"
                :class="['schedule-tab', { active: schedulePreviewTab === 'workday' }]"
                @click="schedulePreviewTab = 'workday'"
              >
                📅 上班日
              </button>
              <button
                type="button"
                :class="['schedule-tab', { active: schedulePreviewTab === 'holiday' }]"
                @click="schedulePreviewTab = 'holiday'"
              >
                🎉 放假日
              </button>
            </div>
            <p class="schedule-hint">
              {{ schedulePreviewTab === 'workday' ? '週一～週五（非國定假日）' : '週末 + 國定假日（見紅就休）' }}
            </p>
            <div
              v-for="(period, index) in schedulePreviewTab === 'workday'
                ? SCHEDULE_TEMPLATES_V2.find(t => t.id === selectedTemplateId)?.schedule.workdayPeriods || []
                : SCHEDULE_TEMPLATES_V2.find(t => t.id === selectedTemplateId)?.schedule.holidayPeriods || []"
              :key="index"
              class="period-item"
            >
              <span class="period-time">
                {{ String(period.start).padStart(2, '0') }}:00 - {{ String(period.end).padStart(2, '0') }}:00
              </span>
              <span :class="['status-badge', period.status]">
                {{ period.status === 'online' ? '在線' : period.status === 'away' ? '忙碌' : '離線' }}
              </span>
            </div>
          </div>
        </div>

        <!-- 自訂時段說明 -->
        <div v-if="scheduleMode === 'custom'" class="custom-notice">
          <p>⚠️ 自訂時段功能尚未完成，請先使用快速模板</p>
          <p class="help-text">未來版本將支援完整的自訂時段設定</p>
        </div>

        <!-- 狀態說明 -->
        <div v-if="scheduleMode !== 'disabled'" class="status-explanation">
          <h4>狀態說明：</h4>
          <ul>
            <li><strong class="status-online">在線：</strong>100% 回應所有訊息</li>
            <li><strong class="status-away">忙碌：</strong>被 @ 時 80% 回應，@all 時 50% 回應</li>
            <li><strong class="status-offline">離線：</strong>被 @ 時 30% 回應，@all 時 10% 回應</li>
          </ul>
        </div>
      </div>

      <!-- 進階模式 -->
      <div v-if="isAdvancedMode" class="form-section">
        <h3>進階設定</h3>
        <!-- LLM 服務商選擇 -->
        <div class="form-group">
          <label for="llmProviderRadioGroup">AI 服務商</label>
          <p class="help-text">
            選擇此好友對話時使用的 AI 服務商。「預設」會使用全域設定（目前為 {{ getProviderConfig(userStore.defaultProvider).name }}）。
          </p>
          <div id="llmProviderRadioGroup" class="radio-group provider-radio-group">
            <!-- 預設選項 -->
            <label class="radio-item">
              <input v-model="llmProvider" type="radio" value="">
              <span class="provider-option">
                <b class="provider-icon" :style="{ color: getProviderConfig(userStore.defaultProvider).iconColor }">
                  {{ getProviderConfig(userStore.defaultProvider).icon }}
                </b>
                <span class="provider-label">預設</span>
              </span>
            </label>
            <!-- 各服務商選項 -->
            <label
              v-for="provider in implementedProviders"
              :key="provider"
              class="radio-item"
              :class="{ disabled: !userStore.hasApiKey(provider) }"
            >
              <input
                v-model="llmProvider"
                type="radio"
                :value="provider"
                :disabled="!userStore.hasApiKey(provider)"
              >
              <span class="provider-option">
                <b class="provider-icon" :style="{ color: getProviderConfig(provider).iconColor }">
                  {{ getProviderConfig(provider).icon }}
                </b>
                <span class="provider-label">{{ getProviderConfig(provider).name }}</span>
                <span v-if="!userStore.hasApiKey(provider)" class="no-key-hint">（未設定）</span>
              </span>
            </label>
          </div>          
        </div>

        <div class="form-group">
          <label for="systemPrompt">系統提示詞</label>
          <textarea id="systemPrompt" v-model="systemPrompt" placeholder="自訂系統提示詞（留空則使用預設）" class="textarea-field"
            :maxlength="LIMITS.MAX_SYSTEM_PROMPT_LENGTH" rows="6" />
          <div class="char-count">{{ systemPrompt.length }}/{{ LIMITS.MAX_SYSTEM_PROMPT_LENGTH }}</div>
          <div class="help-text">
            <p>
              <strong>💡
                提示：</strong>系統提示詞可用於<span class="text-info">補充特殊設定、禁忌話題或好友獨有的表達模式</span>，會附加在自動生成內容之後。
              <br />因此<span class="text-info">無須重複自動生成的內容</span>。
            </p>
            <p><strong>📝 自動生成的內容包含：</strong></p>
            <ul style="margin: 8px 0; padding-left: 20px; line-height: 1.6;">
              <li>好友基本資料（姓名、背景、性格、說話風格、喜好等）</li>
              <li>目前時間與情境</li>
              <li>使用者資料與關係</li>
              <li>好感度系統規則（含回應格式要求）</li>
              <li>好友記憶（長期與短期）</li>
              <li>結尾指示（避免書信體、強制口語化、動作描述規則等）</li>
            </ul>
          </div>
        </div>

        <div class="form-group">
          <label for="maxOutputTokens">最大輸出 Token 數</label>
          <input id="maxOutputTokens" v-model.number="maxOutputTokens" type="number" min="256" max="8192" step="256"
            placeholder="2048" class="input-field">
          <div class="help-text">
            控制 AI 回應的最大長度。建議值：1024（簡短）、2048（標準）、4096（詳細）
          </div>
        </div>
      </div>


    </div>

    <div v-if="error" class="error-message">{{ error }}</div>

    <div class="button-group">
      <button class="btn-secondary" @click="handleCancel">
        取消
      </button>
      <button class="btn-primary" @click="handleSubmit">
        {{ isEditMode ? '儲存' : '建立' }}
      </button>
    </div>

    <!-- 頭像裁剪器 -->
    <AvatarCropper v-if="showCropper" :image="originalImage" @confirm="handleCropConfirm" @cancel="handleCropCancel" />
  </div>
</template>

<style scoped>
.character-form {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--spacing-xl);
}

.header {
  position: sticky;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  top: 0;
  width: 100%;
  padding: var(--spacing-lg);
  border-bottom: 2px solid var(--color-border);
  z-index: var(--z-sticky);
  background: var(--color-bg-secondary);
  margin-bottom: var(--spacing-xl);
}

/* Toggle Switch */
.toggle-switch {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  user-select: none;
}

.toggle-switch input[type="checkbox"] {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--color-border);
  border-radius: var(--radius-full);
  transition: all var(--transition);
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: var(--color-text-white);
  border-radius: var(--radius-full);
  transition: all var(--transition);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-switch input[type="checkbox"]:checked + .toggle-slider {
  background: var(--color-primary);
}

.toggle-switch input[type="checkbox"]:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle-label {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  font-weight: 500;
}

.form-content {
  margin-bottom: var(--spacing-2xl);
}

.form-section {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-2xl);
  margin-bottom: var(--spacing-xl);
  box-shadow: var(--shadow);
}

.form-section h3 {
  font-size: var(--text-2xl);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-lg) 0;
}

.section-desc {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  margin: calc(var(--spacing-sm) * -1) 0 var(--spacing-lg) 0;
}

.avatar-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.avatar-preview {
  width: 100px;
  height: 100px;
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--spacing-md);
  border: 3px solid var(--color-border);
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  font-size: 48px;
}

.upload-btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-size: var(--text-base);
  cursor: pointer;
  transition: all var(--transition);
  border: none;
  color: var(--color-text-primary);
}

.upload-btn:hover {
  background: var(--color-bg-hover);
}

.form-group {
  text-align: left;
  margin-bottom: var(--spacing-xl);
}

.form-group label {
  display: block;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}

.input-field,
.textarea-field {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  font-size: var(--text-base);
  font-family: inherit;
  transition: all var(--transition-fast);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.input-field:focus,
.textarea-field:focus {
  outline: none;
  border-color: var(--color-primary);
}

.textarea-field {
  resize: vertical;
}

.radio-group {
  display: flex;
  gap: var(--spacing-md);
}

.radio-item {
  position: relative;
  flex: 1;
  cursor: pointer;
}

.radio-item input[type="radio"] {
  position: absolute;
  opacity: 0;
  cursor: pointer;
}

/* 基本 radio 樣式 */
.radio-item > input + span {
  display: block;
  padding: var(--spacing-md) var(--spacing-lg);
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  text-align: center;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  transition: all var(--transition);
  user-select: none;
}

.radio-item input[type="radio"]:checked + span {
  color: var(--color-text-white);
  background: var(--color-primary);
  border-color: rgba(102, 126, 234, 0.08);
  font-weight: 500;
}

.radio-item:not(:has(input:disabled)):hover > input + span {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: rgba(102, 126, 234, 0.04);
}

.radio-item input[type="radio"]:disabled + span {
  cursor: not-allowed;
  opacity: 0.5;
}

/* LLM 服務商 radio group */
.provider-radio-group {
  flex-wrap: wrap;
  gap: var(--spacing-xs);
    
}

.provider-radio-group .radio-item {
  flex: 0 0 auto;
  min-width: 80px;
}

/* .provider-option 覆寫基本 radio 樣式（優先順序要比 .radio-item > input + span 高） */
.provider-radio-group .radio-item > input + span.provider-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-xs);
}

.provider-icon {
  display: block;
  font-size: 20px;
  line-height: 1;
}

.provider-label {
  display: block;
  font-size: var(--text-sm);
}

.no-key-hint {
  display: block;
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  margin-top: 2px;
}

/* 選中時 icon 稍微亮一點，文字白色 */
.radio-item input[type="radio"]:checked + .provider-option .provider-icon {
  filter: brightness(1.2);
}

.radio-item input[type="radio"]:checked + .provider-option .provider-label {
  color: var(--color-text-white);
}

/* hover 時文字變 primary 色（不論是否選中，優先順序要比 :checked 高） */
.radio-item:not(:has(input:disabled)):hover input[type="radio"] + .provider-option .provider-label {
  color: var(--color-primary);
}

.char-count {
  text-align: right;
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-xs);
}

.help-text {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-);
  font-style: italic;
}

/* 事件列表 */
.event-input-group {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.event-input-group .input-field {
  flex: 1;
}

.btn-add {
  padding: 10px var(--spacing-xl);
  background: var(--color-primary);
  color: var(--color-text-white);
  border: none;
  border-radius: var(--radius);
  font-size: var(--text-base);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
}

.btn-add:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.btn-add:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.event-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
}

.event-text {
  flex: 1;
  font-size: var(--text-base);
  color: var(--color-text-primary);
  white-space: pre-line;
}

.event-delete {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: var(--color-error);
  color: var(--color-text-white);
  border: none;
  cursor: pointer;
  font-size: var(--text-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
  margin-left: var(--spacing-md);
}

.event-delete:hover {
  background: #d32f2f;
}

/* 作息時間設定 */
.schedule-mode-tabs {
  display: flex;
  gap: var(--spacing-sm);
  background: var(--color-bg-secondary);
  padding: var(--spacing-xs);
  border-radius: var(--radius);
}

.mode-tab {
  flex: 1;
  padding: var(--spacing-md) var(--spacing-lg);
  background: transparent;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  transition: all var(--transition);
}

.mode-tab:hover {
  background: var(--color-bg-hover);
}

.mode-tab.active {
  background: var(--color-primary);
  color: white;
  font-weight: 600;
}

.template-preview {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
}

.schedule-tabs {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.schedule-tab {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-primary);
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  transition: all var(--transition);
}

.schedule-tab:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.schedule-tab.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
  font-weight: 600;
}

.schedule-hint {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  margin: 0 0 var(--spacing-md) 0;
  text-align: center;
}

.template-preview h4 {
  font-size: var(--text-base);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-md) 0;
  font-weight: 600;
}

.period-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-xs);
  background: var(--color-bg-primary);
  border-radius: var(--radius-sm);
}

.period-time {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-family: monospace;
}

/* 使用全域 .status-badge 樣式 */

.custom-notice {
  padding: var(--spacing-lg);
  background: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: var(--radius);
  margin-top: var(--spacing-lg);
}

.custom-notice p {
  margin: var(--spacing-xs) 0;
  color: var(--color-text-primary);
}

.status-explanation {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
}

.status-explanation h4 {
  font-size: var(--text-base);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-md) 0;
  font-weight: 600;
}

.status-explanation ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.status-explanation li {
  padding: var(--spacing-sm) 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* 使用全域 .text-status-online, .text-status-away, .text-status-offline 樣式 */

.error-message {
  color: var(--color-error);
  font-size: var(--text-base);
  text-align: center;
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-md);
  background: #fff1f0;
  border-radius: var(--radius);
}

.button-group {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
}

.btn-primary,
.btn-secondary {
  padding: var(--spacing-md) var(--spacing-3xl);
  border-radius: var(--radius);
  font-size: var(--text-lg);
  cursor: pointer;
  transition: all var(--transition);
  border: none;
}

.btn-primary {
  background: var(--color-primary);
  color: var(--color-text-white);
}

.btn-primary:hover {
  background: var(--color-primary-dark);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
}

@media (max-width: 768px) {
  .character-form {
    padding: var(--spacing-md);
  }

  .form-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-md);
  }

  .event-input-group {
    flex-direction: column;
  }

  .schedule-mode-tabs {
    flex-direction: column;
  }

  .period-item {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-xs);
  }

  .radio-group {
    gap: var(--spacing-xs);
  }

  .provider-radio-group {
    gap: 0;
  }
}

/* 隱藏設定區塊 */
.private-placeholder {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  border: 2px dashed var(--color-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-3xl) var(--spacing-xl);
  text-align: center;
  margin: var(--spacing-xl) 0;
}

.private-icon {
  font-size: 48px;
  margin-bottom: var(--spacing-md);
}

.private-text {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.private-hint {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  margin: 0;
  font-style: italic;
}

.empty-hint {
  text-align: center;
  padding: var(--spacing-2xl);
  color: var(--color-text-tertiary);
  font-size: var(--text-base);
  font-style: italic;
}

</style>
