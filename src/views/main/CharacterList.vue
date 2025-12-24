<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCharacterStore } from '@/stores/characters'
import { useRelationshipsStore } from '@/stores/relationships'
import { useUserStore } from '@/stores/user'
import { useToast } from '@/composables/useToast'
import { getRelationshipLevelInfo } from '@/utils/relationshipHelpers'
import { downloadCharacterCard, readCharacterCardFromFile } from '@/utils/characterExport'
import { getProviderConfig, isProviderImplemented } from '@/services/llm'
import PageHeader from '@/components/common/PageHeader.vue'
import type { Character } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { UserPlus, Download, X, ImageUp } from 'lucide-vue-next'
import {getCharacterStatus} from '@/utils/chatHelpers'

const router = useRouter()
const characterStore = useCharacterStore()
const relationshipsStore = useRelationshipsStore()
const userStore = useUserStore()
const { success, error } = useToast()

const characters = computed(() => characterStore.characters)
const characterCount = computed(() => characters.value.length)
const canAddMore = computed(() => characterCount.value < 15)

const handleAddCharacter = () => {
  showFabMenu.value = false  // 關閉選單
  router.push('/main/characters/new')
}

const handleViewCharacter = (character: Character) => {
  router.push(`/main/characters/${character.id}`)
}

// 匯出/匯入相關（已改用 Toast 顯示訊息）

// FAB 選單
const showFabMenu = ref(false)

// 匯出角色卡相關
const showExportModal = ref(false)
const exportingCharacter = ref<Character | null>(null)
const hidePrivateSettings = ref(false)

const handleExportCharacter = async (character: Character, event: Event) => {
  event.stopPropagation() // 防止觸發卡片點擊
  exportingCharacter.value = character
  // 如果角色本身就是隱藏設定的，預設勾選且不可關閉
  hidePrivateSettings.value = character.isPrivate || false
  showExportModal.value = true
}

const confirmExport = async () => {
  if (!exportingCharacter.value) return

  try {
    // 取得角色的好感度
    const relationship = relationshipsStore.getUserCharacterRelationship(exportingCharacter.value.id)
    const affection = relationship?.affection || 0

    // 取得使用者名稱作為作者
    const authorName = userStore.profile?.nickname || userStore.profile?.realName || undefined

    // 如果角色是匯入的，保留原始 metadata
    const existingMetadata = exportingCharacter.value.importedMetadata

    await downloadCharacterCard(
      exportingCharacter.value,
      affection,
      authorName,
      existingMetadata,
      hidePrivateSettings.value
    )

    showExportModal.value = false
    success('成功匯出好友名片')
  } catch (error) {
    console.error('匯出失敗:', error)
    showMessage('匯出好友名片失敗，請稍後再試', 'error')
  }
}

// 匯入角色卡
const handleImportCharacter = async (event: Event) => {
  showFabMenu.value = false  // 關閉選單

  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  try {
    const characterData = await readCharacterCardFromFile(file)

    if (!characterData) {
      showMessage('這張圖片不包含好友名片資料', 'error')
      return
    }

    // 檢查是否超過好友數量限制
    if (characterCount.value >= 15) {
      showMessage('已達到好友數量上限（15 位）', 'error')
      return
    }

    // 處理建議服務商
    let llmProvider: Character['llmProvider'] = undefined
    let providerHint = ''

    if (characterData.recommendedProvider) {
      const recommendedProvider = characterData.recommendedProvider
      const providerConfig = getProviderConfig(recommendedProvider)

      // 檢查該服務商是否已實作
      if (isProviderImplemented(recommendedProvider)) {
        // 檢查使用者是否有該服務商的 API Key
        const hasApiKey = !!userStore.getApiKey(recommendedProvider)

        if (hasApiKey) {
          // 使用者有 API Key，直接使用建議的服務商
          llmProvider = recommendedProvider
        } else {
          // 使用者沒有 API Key，提示可以在進階設定中設定
          providerHint = `（原作者建議使用 ${providerConfig.name}，可在進階設定中變更）`
        }
      } else {
        // 服務商尚未實作，提示
        providerHint = `（原作者建議使用 ${providerConfig.name}，目前尚未支援）`
      }
    }

    // 創建新角色（保留所有匯入的資料，包括 metadata）
    const newCharacter: Character = {
      ...characterData as Character,
      id: uuidv4(),
      events: characterData.events || [],
      createdAt: characterData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // 如果使用者有建議服務商的 API Key，就套用；否則保持 undefined（使用全域預設）
      llmProvider
    }

    // 添加到 store
    characterStore.addCharacter(newCharacter)

    // 為沒有作息設定的角色執行 migration（處理舊版名片）
    characterStore.migrateCharacterSchedules()

    // 根據是否有作者資訊，顯示不同的訊息
    const author = characterData.importedMetadata?.author
    let message = author
      ? `經由 ${author} 的介紹，認識了 ${newCharacter.name}`
      : `成功匯入好友 ${newCharacter.name}`

    // 如果有服務商提示，加到訊息後面
    if (providerHint) {
      message += providerHint
    }

    showMessage(message, 'success')
  } catch (error) {
    console.error('匯入失敗:', error)
    showMessage('匯入好友名片失敗，請確認檔案格式正確', 'error')
  }

  // 清空 input，允許重複選擇同一個檔案
  input.value = ''
}

// 顯示訊息（改用 Toast）
const showMessage = (message: string, type: 'success' | 'error') => {
  if (type === 'success') {
    success(message)
  } else {
    error(message)
  }
}

const getGenderText = (gender?: string) => {
  switch (gender) {
    case 'male': return '男'
    case 'female': return '女'
    default: return '未設定'
  }
}

const getCharacterRelationship = (characterId: string) => {
  return relationshipsStore.getUserCharacterRelationship(characterId)
}

const getRelationshipDisplay = (characterId: string) => {
  const relationship = getCharacterRelationship(characterId)
  if (!relationship) {
    return {
      name: '陌生人',
      affection: 0,
      color: '#999999'
    }
  }
  const levelInfo = getRelationshipLevelInfo(relationship.level, relationship.isRomantic)
  return {
    name: levelInfo.name,
    affection: relationship.affection,
    color: levelInfo.color
  }
}

const getDefaultAvatar = (name: string) => {
  const initial = name.charAt(0).toUpperCase()
  const colors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a']
  const colorIndex = name.length % colors.length
  const color = colors[colorIndex]

  const canvas = document.createElement('canvas')
  canvas.width = 80
  canvas.height = 80
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.fillRect(0, 0, 80, 80)
    ctx.fillStyle = color || '#ffffff'
    ctx.font = 'bold 36px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initial, 40, 40)
  }

  return canvas.toDataURL()
}
</script>

<template>
  <div class="page">
    <PageHeader title="好友">
      <template #extra-info>
        <div class="count-info">{{ characterCount }}/15 位好友</div>
      </template>
    </PageHeader>

    <!-- 空狀態 -->
    <div v-if="characterCount === 0" class="empty-state">
      <div class="empty-icon">👥</div>
      <h3>還沒有 AI 好友</h3>
      <p>建立你的第一個 AI 好友，或匯入好友名片開始對話吧！</p>
      <div class="button-group" style="justify-content: center; margin-top: var(--spacing-xl);">
        <button class="btn-primary empty-btn" @click="handleAddCharacter">
          <UserPlus :size="20" />
          <span>新增好友</span>
        </button>
        <label class="btn-secondary empty-btn" for="empty-import-input">
          <Download :size="20" />
          <span>匯入名片</span>
          <input id="empty-import-input" type="file" accept="image/*" style="display: none"
            @change="handleImportCharacter" />
        </label>
      </div>
    </div>

    <!-- 好友列表 -->
    <div v-else class="character-grid">
      <div v-for="character in characters" :key="character.id" class="character-card"
        @click="handleViewCharacter(character)">
        <button class="export-btn btn btn-sm btn-info-outline" @click="handleExportCharacter(character, $event)">
          <ImageUp /> 抽名片
        </button>
        <div class="character-avatar-wrapper">
          <div class="character-avatar">
            <img :src="character.avatar || getDefaultAvatar(character.name)" :alt="character.name"></img>
          </div>
          <div :class="['status-dot', getCharacterStatus(character)]"></div>
        </div>
        <div class="character-info">
          <h3 class="character-name">{{ character.name }}</h3>
          <p v-if="character.statusMessage" class="status-message">{{ character.statusMessage }}</p>
          <span class="meta-item">{{ getGenderText(character.gender) }}</span>
          <span class="meta-item">{{ character.age }}歲</span>
          <div style="margin-top: 0.3rem;"><span class="meta-item">{{ character.profession }}</span></div>
          <div class="relationship-info">
            <span class="relationship-level" :style="{ backgroundColor: getRelationshipDisplay(character.id).color }">
              {{ getRelationshipDisplay(character.id).name }}
            </span>
            <span class="affection-value">♥ {{ getRelationshipDisplay(character.id).affection }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增按鈕與選單（當已有好友時） -->
    <div v-if="characterCount > 0 && canAddMore" class="fab-container">
      <!-- FAB 選單 -->
      <div v-if="showFabMenu" class="fab-menu">
        <button class="fab-menu-item" @click="handleAddCharacter">
          <UserPlus :size="20" />
          <span>新增好友</span>
        </button>
        <label class="fab-menu-item" for="fab-import-input">
          <Download :size="20" />
          <span>匯入名片</span>
          <input id="fab-import-input" type="file" accept="image/*" style="display: none"
            @change="handleImportCharacter" />
        </label>
      </div>

      <!-- FAB 主按鈕 -->
      <button class="fab-add" @click="showFabMenu = !showFabMenu">
        <X v-if="showFabMenu" :size="28" />
        <span v-else style="font-size: 30px; font-weight: bold;">＋</span>
      </button>
    </div>

    <!-- 已達上限提示 -->
    <div v-if="!canAddMore" class="limit-notice">
      已達好友數量上限（15位）
    </div>

    <!-- 匯出設定 Modal -->
    <div v-if="showExportModal" class="modal-overlay" @click="showExportModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>匯出好友名片</h3>
          <button class="modal-close" @click="showExportModal = false">
            <X :size="24" />
          </button>
        </div>
        <div class="modal-body">
          <p class="modal-description">
            即將匯出 <strong>{{ exportingCharacter?.name }}</strong> 的好友名片
          </p>
          <div class="form-group">
            <div class="switch-group">

              <label class="toggle-switch" :class="{ disabled: exportingCharacter?.isPrivate }">
                <input v-model="hidePrivateSettings" type="checkbox" :disabled="exportingCharacter?.isPrivate">
                <span class="toggle-slider"></span>
              </label>
              <div class="switch-info">
                <span class="switch-label">隱藏詳細設定</span>
                <p v-if="exportingCharacter?.isPrivate" class="switch-hint locked">
                  此角色的詳細設定已經是秘密，我們必須繼續保密。
                </p>
                <p v-else class="switch-hint">
                  勾選後，性格、說話風格、背景故事等欄位將不會被匯出。<br>
                  匯入此名片的人將無法看到這些設定，並且這些欄位會變成唯讀狀態。
                </p>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showExportModal = false">取消</button>
          <button class="btn btn-primary" @click="confirmExport">確定匯出</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

.count-info {
  font-size: var(--text-base);
  color: #eee;
}


/* 好友網格 */
.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(680px, 100%), 1fr));
  gap: var(--spacing-xl);
  padding: var(--spacing-xl);
  max-width: 1440px;
  margin: 0 auto;
}

.character-card {
  position: relative;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: all var(--transition);
  display: flex;
  flex-direction: row;
  align-items: center;
  text-align: left;
  overflow: hidden;
}

.character-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}

.character-avatar-wrapper {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}

.character-avatar {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: var(--radius-full);  
  margin-bottom: var(--spacing-lg);
  border: 3px solid var(--color-border);
}

.character-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-info {
  flex: 1;
  min-width: 0;
  padding-left: 2rem;
  padding-bottom: 1rem;
}

.character-name {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.status-message {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-style: italic;
  margin: 0 0 var(--spacing-sm) 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-item {
  margin: 0.2rem;
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(0, 0, 0, 0.1);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
}

.relationship-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.relationship-level {
  padding: var(--spacing-xs) var(--spacing-md);
  color: white;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
}

.affection-value {
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(255, 77, 79, 0.1);
  color: #ff4d4f;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
}

.delete-btn {
  position: absolute;
  top: var(--spacing-md);
  right: var(--spacing-md);
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--color-error);
  color: var(--color-text-white);
  border: none;
  cursor: pointer;
  font-size: var(--text-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all var(--transition);
}

.character-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #d32f2f;
  transform: scale(1.1);
}

/* FAB 容器 */
.fab-container {
  position: fixed;
  bottom: 102px;
  right: var(--spacing-3xl);
  z-index: var(--z-dropdown);
}

/* FAB 選單 */
.fab-menu {
  position: absolute;
  bottom: 80px;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  animation: fadeInUp 0.2s ease-out;
}

.fab-menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  background: white;
  border: none;
  border-radius: var(--radius-lg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
  font-size: var(--text-base);
  color: var(--color-text-primary);
}

.fab-menu-item:hover {
  background: var(--color-primary);
  color: white;
  transform: translateX(-4px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 浮動新增按鈕 */
.fab-add {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-text-white);
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transition: all var(--transition);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fab-add:hover {
  background: var(--color-primary-dark);
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
}

/* 空狀態按鈕 - 支援圖示 */
.empty-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
}

/* 主要按鈕 */
.btn-primary {
  padding: var(--spacing-md) var(--spacing-3xl);
  border-radius: var(--radius);
  font-size: var(--text-lg);
  cursor: pointer;
  transition: all var(--transition);
  border: none;
  background: var(--color-primary);
  color: var(--color-text-white);
}

.btn-primary:hover {
  background: var(--color-primary-dark);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* 上限提示 */
/* 匯入按鈕 */
.import-btn {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.import-btn:hover {
  background: var(--color-primary);
  color: white;
}

/* 匯出按鈕 */
.export-btn {
  position: absolute;
  top: var(--spacing-sm);
  right: var(--spacing-sm);
  margin: var(--spacing-xs);
  padding:var(--spacing-xs);
  z-index: 1;
}

.export-btn:hover {
  transform: scale(1.1);
}

.export-btn:hover::after {
  content: ' 匯出好友名片';
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  font-size: 12px;
  border-radius: 4px;
  white-space: nowrap;
}

/* 匯入訊息提示已改用全域 Toast 系統 */

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.limit-notice {
  position: fixed;
  bottom: var(--spacing-3xl);
  right: var(--spacing-3xl);
  background: var(--color-warning);
  color: var(--color-text-white);
  padding: var(--spacing-md) var(--spacing-2xl);
  border-radius: var(--radius);
  font-size: var(--text-base);
  box-shadow: var(--shadow);
}

/* 狀態點 */
.status-dot {
  position: relative;
  bottom: 30px;
  left: 55px;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  border: 2px solid var(--color-bg-primary);
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

@media (max-width: 768px) {
  .character-grid {
    grid-template-columns: 1fr;
    padding: var(--spacing-md);
    gap: var(--spacing-md);
  }

  .character-card {
    padding: var(--spacing-lg);
    overflow: hidden;
  }

  .character-info {
    padding-left: var(--spacing-lg);
  }

  .fab-add {
    right: 20px;
    width: 56px;
    height: 56px;
    font-size: 30px;
  }
}

/* Modal 相關樣式 */
.modal-description {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  margin: 0 0 var(--spacing-xl) 0;
}

.switch-group {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-lg);
}

.switch-info {
  flex: 1;
}

.switch-label {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  display: block;
  margin-bottom: var(--spacing-sm);
}

.switch-hint {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 28px;
  flex-shrink: 0;
  margin-top: var(--spacing-xs);
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-border);
  transition: var(--transition);
  border-radius: 34px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: var(--transition);
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--color-primary);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(24px);
}

.toggle-switch input:focus + .toggle-slider {
  box-shadow: 0 0 1px var(--color-primary);
}

.toggle-switch.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-switch.disabled .toggle-slider {
  cursor: not-allowed;
}

.toggle-switch.disabled input:checked+.toggle-slider {
  background-color: var(--color-text-secondary);
}

.switch-hint.locked {
  color: var(--color-warning);
  font-weight: 500;
}
</style>
