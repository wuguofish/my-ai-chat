import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import pinia from './stores'
import { migrateLocalStorage } from './utils/dataObfuscation'
import { initPersistentStorage } from './utils/persistentStorage'
import { initImageStore } from './utils/imageStore'
import { useChatRoomsStore } from './stores/chatRooms'

async function bootstrap() {
  // 在 Pinia 初始化之前遷移舊格式 LocalStorage 資料
  // 這確保 Pinia persist 讀取時已經是新編碼格式
  migrateLocalStorage()

  // 開啟 IndexedDB（必要時從 localStorage 搬移資料），並預先讀取所有存檔
  // 必須在 router 之前完成，因為路由守衛會用到 userStore
  // 同時開啟聊天圖片的資料庫（失敗時圖片維持存在訊息裡）
  try {
    await Promise.all([initPersistentStorage(), initImageStore()])
  } catch (error) {
    // 讀檔失敗（例如其他分頁正在升級資料庫、瀏覽器暫時無法開啟 IndexedDB）：
    // 不要用空資料啟動，避免玩家以為存檔不見
    console.error('❌ 讀取存檔失敗:', error)
    showStartupError()
    return
  }

  const app = createApp(App)

  app.use(pinia)
  app.use(router)

  app.mount('#app')

  // 背景整理聊天圖片：舊存檔/匯入備份裡的 Base64 圖片搬進 IndexedDB，並清掉已無訊息使用的圖片
  void organizeChatImages()
}

function showStartupError() {
  const root = document.getElementById('app')
  if (!root) return
  const box = document.createElement('div')
  box.className = 'text-center'
  box.style.padding = 'var(--spacing-3xl) var(--spacing-lg)'
  box.textContent = '讀取存檔時發生問題，你的資料沒有遺失。請關閉其他開著本網站的分頁後，重新整理頁面。'
  const button = document.createElement('button')
  button.textContent = '重新整理'
  button.className = 'btn-primary'
  button.style.marginTop = 'var(--spacing-lg)'
  button.onclick = () => window.location.reload()
  box.appendChild(document.createElement('br'))
  box.appendChild(button)
  root.replaceChildren(box)
}

async function organizeChatImages() {
  try {
    const chatRoomStore = useChatRoomsStore()
    const migrated = await chatRoomStore.migrateInlineImages()
    const removed = await chatRoomStore.cleanupOrphanImages()
    if (migrated || removed) {
      console.log(`🖼️ 聊天圖片整理完成：搬移 ${migrated} 張、清除 ${removed} 張`)
    }
  } catch (error) {
    console.error('❌ 整理聊天圖片失敗:', error)
  }
}

void bootstrap()
