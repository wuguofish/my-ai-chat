<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { checkVersion, updateStoredVersion, clearCacheAndReload, fetchServerVersion, getVersionInfo, type VersionInfo } from '@/utils/version'
import { startStatusMonitoring, stopStatusMonitoring, syncHolidayCache } from '@/utils/chatHelpers'
import { useMemoriesStore } from '@/stores/memories'
import { useChatRoomsStore } from '@/stores/chatRooms'
import { useCharacterStore } from '@/stores/characters'
import ToastContainer from '@/components/ToastContainer.vue'
import GlobalModal from '@/components/GlobalModal.vue'

// 版本更新提示
const showUpdateDialog = ref(false)
const isNewVersion = ref(false)
const serverVersion = ref('')
const versionInfo = ref<VersionInfo | null>(null)

const memoriesStore = useMemoriesStore()
const chatRoomsStore = useChatRoomsStore()
const characterStore = useCharacterStore()
const router = useRouter()

// 檢查版本的函數
const performVersionCheck = async () => {
  isNewVersion.value = await checkVersion()
  if (isNewVersion.value) {
    // 取得伺服器版本號和更新說明
    serverVersion.value = await fetchServerVersion()
    versionInfo.value = await getVersionInfo(serverVersion.value) || null
    showUpdateDialog.value = true
  }
}

onMounted(async () => {
  // 遷移舊版本的記憶資料（需要傳入聊天室列表）
  memoriesStore.migrateLegacyRoomMemories(chatRoomsStore.chatRooms)

  // 為沒有作息設定的舊角色加上預設作息
  characterStore.migrateCharacterSchedules()

  // 初始化假日快取（用於角色作息判斷）
  await syncHolidayCache()

  // 啟動作息狀態監控系統
  startStatusMonitoring()

  // 初始版本檢查
  await performVersionCheck()
})

// 組件卸載時停止監控
onUnmounted(() => {
  stopStatusMonitoring()
})

// 監聽路由變化，每次導航時檢查版本
watch(() => router.currentRoute.value.path, async () => {
  await performVersionCheck()
})

// 確認更新
const handleUpdate = async () => {
  showUpdateDialog.value = false
  await updateStoredVersion()

  // 清除快取並重新載入
  await clearCacheAndReload()
}

// 稍後更新
const handleLater = () => {
  showUpdateDialog.value = false
  // 不更新版本號，下次啟動時還會提示
}
</script>

<template>
  <!-- 版本更新提示對話框 -->
  <div v-if="showUpdateDialog" class="update-dialog-overlay">
    <div class="update-dialog">
      <h3>🎉 發現新版本</h3>
      <p class="version-info">版本 {{ serverVersion }} 已發布！</p>
      <div v-if="versionInfo?.features && versionInfo.features.length > 0" class="update-features">
        <p><strong>更新內容：</strong></p>
        <ul>
          <li v-for="(feature, index) in versionInfo.features" :key="index">
            {{ feature }}
          </li>
        </ul>
      </div>
      <div class="update-instructions">
        <p class="update-note"><strong>更新說明：</strong></p>
        <p class="update-note">點擊「立即更新」會自動清除快取並重新載入。</p>
        <p class="update-note secondary">如果更新後仍看到舊版本，請：</p>
        <ul class="update-tips">
          <li>🖥️ 電腦：按 <strong>Ctrl+Shift+R</strong> (Windows) 或 <strong>Cmd+Shift+R</strong> (Mac)</li>
          <li>📱 手機：完全關閉瀏覽器後重新開啟</li>
        </ul>
      </div>
      <div class="dialog-actions">
        <button @click="handleUpdate" class="btn-primary">立即更新</button>
        <button @click="handleLater" class="btn-secondary">稍後再說</button>
      </div>
    </div>
  </div>

  <!-- Toast 通知容器 -->
  <ToastContainer />

  <!-- 全域 Modal 對話框 -->
  <GlobalModal />

  <RouterView />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  background-color: #f5f5f5;
  color: #333;
}

/* 版本更新對話框樣式 */
.update-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.update-dialog {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.update-dialog h3 {
  margin: 0 0 16px;
  font-size: 20px;
  color: #333;
}

.version-info {
  color: #666;
  margin-bottom: 16px;
  font-size: 14px;
}

.update-features {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.update-features p {
  margin: 0 0 8px;
  font-weight: 600;
  color: #333;
}

.update-features ul {
  margin: 0;
  padding-left: 20px;
}

.update-features li {
  color: #666;
  margin-bottom: 4px;
  font-size: 14px;
}

.update-note {
  color: #666;
  font-size: 13px;
  margin-bottom: 8px;
}

.update-note.secondary {
  color: #999;
  margin-top: 12px;
  margin-bottom: 8px;
}

.update-instructions {
  background: #fff3cd;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #ffc107;
}

.update-tips {
  margin: 8px 0 0;
  padding-left: 20px;
  list-style: none;
}

.update-tips li {
  color: #666;
  font-size: 13px;
  margin-bottom: 6px;
  padding-left: 4px;
}

.update-tips strong {
  color: #333;
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.dialog-actions button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover {
  background: #0056b3;
}

.btn-secondary {
  background: #e9ecef;
  color: #666;
}

.btn-secondary:hover {
  background: #dee2e6;
}
</style>
