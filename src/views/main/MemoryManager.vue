<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCharacterStore } from '@/stores/characters'
import { useMemoriesStore } from '@/stores/memories'
import { useModal } from '@/composables/useModal'
import type { Character, Memory } from '@/types'
import { ArrowLeft } from 'lucide-vue-next'


const { confirmDanger } = useModal()

const router = useRouter()
const route = useRoute()
const characterStore = useCharacterStore()
const memoriesStore = useMemoriesStore()

const characterId = computed(() => route.params.id as string)
const character = ref<Character | null>(null)

// 長期記憶（角色全域記憶）
const longTermMemories = computed(() =>
  memoriesStore.getCharacterMemories(characterId.value)
)

// 短期記憶（角色短期記憶緩衝區）
const shortTermMemories = computed(() =>
  memoriesStore.getCharacterShortTermMemories(characterId.value)
)

// 編輯狀態（長期記憶）
const editingMemoryId = ref<string | null>(null)
const editingContent = ref('')

// 編輯狀態（短期記憶）
const editingShortMemoryId = ref<string | null>(null)
const editingShortContent = ref('')

// 新增記憶
const showAddModal = ref(false)
const newMemoryContent = ref('')

onMounted(() => {
  const found = characterStore.getCharacterById(characterId.value)
  if (found) {
    character.value = found
  } else {
    router.push('/main/characters')
  }
})

const handleBack = () => {
  router.back()
}

// 新增記憶
const handleAddMemory = () => {
  showAddModal.value = true
  newMemoryContent.value = ''
}

const handleSaveNewMemory = () => {
  if (!newMemoryContent.value.trim()) return

  memoriesStore.addCharacterMemory(
    characterId.value,
    newMemoryContent.value.trim(),
    'manual'
  )

  showAddModal.value = false
  newMemoryContent.value = ''
}

// 編輯記憶
const handleEditMemory = (memory: Memory) => {
  editingMemoryId.value = memory.id
  editingContent.value = memory.content
}

const handleSaveEdit = () => {
  if (!editingMemoryId.value || !editingContent.value.trim()) return

  memoriesStore.updateCharacterMemory(
    characterId.value,
    editingMemoryId.value,
    editingContent.value.trim()
  )

  editingMemoryId.value = null
  editingContent.value = ''
}

const handleCancelEdit = () => {
  editingMemoryId.value = null
  editingContent.value = ''
}

// 刪除記憶
const handleDeleteMemory = async (memoryId: string) => {
  if (await confirmDanger('確定要刪除這條記憶嗎？')) {
    memoriesStore.deleteCharacterMemory(characterId.value, memoryId)
  }
}

// 編輯短期記憶
const handleEditShortMemory = (memory: Memory) => {
  editingShortMemoryId.value = memory.id
  editingShortContent.value = memory.content
}

const handleSaveShortEdit = () => {
  if (!editingShortMemoryId.value || !editingShortContent.value.trim()) return

  memoriesStore.updateCharacterShortTermMemory(
    characterId.value,
    editingShortMemoryId.value,
    editingShortContent.value.trim()
  )

  editingShortMemoryId.value = null
  editingShortContent.value = ''
}

const handleCancelShortEdit = () => {
  editingShortMemoryId.value = null
  editingShortContent.value = ''
}

// 刪除短期記憶
const handleDeleteShortMemory = async (memoryId: string) => {
  if (await confirmDanger('確定要刪除這條短期記憶嗎？')) {
    memoriesStore.deleteCharacterShortTermMemory(characterId.value, memoryId)
  }
}

// 格式化日期
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div v-if="character" class="memory-manager">
    <!-- 標題列 -->
    <div class="header">
      <button class="back-btn" @click="handleBack">
        <ArrowLeft :size="20" />
        返回
      </button>
      <h3>
        {{ character.name }} 的記憶
      </h3>
      <span class="btn-ghost btn"></span>
    </div>
    <div class="content-section centered">
      <!-- 說明 -->
      <div class="info-box">
        <p>💡 <strong>長期記憶</strong>：永久保存的重要記憶，會在所有對話中提供給 AI</p>
        <p>💭 <strong>短期記憶</strong>：每 15 則訊息自動生成，最多保留 6 筆，當 6 筆全部未處理時會自動提取為長期記憶</p>
      </div>

      <!-- 短期記憶列表 -->
      <div class="memory-section">
        <div class="section-header">
          <div class="section-title">
            <h3>短期記憶緩衝區</h3>
            <span class="memory-count badge">{{ shortTermMemories.length }}/6 筆</span>
          </div>
        </div>

        <div v-if="shortTermMemories.length === 0" class="empty-state">
          <div class="empty-state-icon">💭</div>
          <h3>尚無短期記憶</h3>
          <p>短期記憶會在聊天過程中自動生成</p>
        </div>

        <div v-else class="memory-list">
          <div v-for="memory in shortTermMemories" :key="memory.id" class="memory-item card">
            <!-- 編輯模式 -->
            <div v-if="editingShortMemoryId === memory.id" class="memory-edit">
              <textarea v-model="editingShortContent" class="input-field" rows="3" placeholder="輸入記憶內容..." />
              <div class="button-group">
                <button class="btn btn-primary" @click="handleSaveShortEdit">儲存</button>
                <button class="btn btn-secondary" @click="handleCancelShortEdit">取消</button>
              </div>
            </div>

            <!-- 檢視模式 -->
            <div v-else class="memory-view">
              <div class="memory-meta">
                <span class="memory-source badge" :class="{ processed: memory.processed }">
                  {{ memory.processed ? '已處理' : '未處理' }}
                </span>
                <span class="memory-date text-tertiary">{{ formatDate(memory.createdAt) }}</span>
                <span v-if="memory.sourceRoomId" class="memory-room text-tertiary">
                  來源：聊天室
                </span>
              </div>
              <div class="memory-content">{{ memory.content }}</div>
              <div class="memory-actions button-group">
                <button class="btn btn-secondary btn-sm" @click="handleEditShortMemory(memory)">編輯</button>
                <button class="btn btn-danger btn-sm" @click="handleDeleteShortMemory(memory.id)">刪除</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 長期記憶列表 -->
      <div class="memory-section">
        <div class="section-header">
          <div class="section-title">
            <h3>長期記憶</h3>
            <span class="memory-count badge">{{ longTermMemories.length }} 筆</span>
          </div>
          <button class="btn btn-primary" @click="handleAddMemory">+ 新增記憶</button>
        </div>

        <div v-if="longTermMemories.length === 0" class="empty-state">
          <div class="empty-state-icon">💭</div>
          <h3>尚無記憶</h3>
          <p>點擊「新增記憶」來建立角色的重要記憶</p>
        </div>

        <div v-else class="memory-list">
          <div v-for="memory in longTermMemories" :key="memory.id" class="memory-item card">
            <!-- 編輯模式 -->
            <div v-if="editingMemoryId === memory.id" class="memory-edit">
              <textarea v-model="editingContent" class="input-field" rows="3" placeholder="輸入記憶內容..." />
              <div class="button-group">
                <button class="btn btn-primary" @click="handleSaveEdit">儲存</button>
                <button class="btn btn-secondary" @click="handleCancelEdit">取消</button>
              </div>
            </div>

            <!-- 檢視模式 -->
            <div v-else class="memory-view">
              <div class="memory-meta">
                <span class="memory-source badge">
                  {{ memory.source === 'manual' ? '手動' : '自動' }}
                </span>
                <span class="memory-date text-tertiary">{{ formatDate(memory.createdAt) }}</span>
              </div>
              <div class="memory-content">{{ memory.content }}</div>
              <div class="memory-actions button-group">
                <button class="btn btn-secondary btn-sm" @click="handleEditMemory(memory)">編輯</button>
                <button class="btn btn-danger btn-sm" @click="handleDeleteMemory(memory.id)">刪除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增記憶 Modal -->
    <div v-if="showAddModal" class="modal-overlay" @click="showAddModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>新增記憶</h3>
          <button class="modal-close" @click="showAddModal = false">×</button>
        </div>
        <div class="modal-body">
          <textarea v-model="newMemoryContent" class="input-field" rows="5" placeholder="輸入記憶內容...（例如：我的生日是 5 月 20 日）"
            autofocus />
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddModal = false">取消</button>
          <button class="btn btn-primary" @click="handleSaveNewMemory">新增</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.memory-manager {
  min-height: 100vh;
  background: var(--color-bg-secondary);
}

.info-box {
  background: linear-gradient(135deg, #667eea20, #764ba220);
  border: 1px solid #667eea40;
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  margin-bottom: var(--spacing-2xl);
}

.info-box p {
  margin: 0;
  line-height: 1.6;
}

.memory-section {
  margin-top: var(--spacing-2xl);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.section-title h3 {
  margin: 0;
}

.memory-count {
  font-size: var(--text-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.memory-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.memory-item {
  padding: var(--spacing-xl);
}

.memory-item:hover {
  box-shadow: var(--shadow-md);
}

.memory-view {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.memory-content {
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.memory-meta {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  font-size: var(--text-sm);
}

.memory-source {
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.memory-source.processed {
  background: #d1f2eb;
  color: #00695c;
}

.memory-actions {
  margin-top: var(--spacing-sm);
}

.memory-edit {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.memory-edit textarea {
  resize: vertical;
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .memory-actions {
    flex-wrap: wrap;
  }
}
</style>
