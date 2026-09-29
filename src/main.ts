import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import pinia from './stores'
import { migrateLocalStorage } from './utils/dataObfuscation'
import { initPersistentStorage } from './utils/persistentStorage'

async function bootstrap() {
  // 在 Pinia 初始化之前遷移舊格式 LocalStorage 資料
  // 這確保 Pinia persist 讀取時已經是新編碼格式
  migrateLocalStorage()

  // 開啟 IndexedDB（必要時從 localStorage 搬移資料），並預先讀取所有存檔
  // 必須在 router 之前完成，因為路由守衛會用到 userStore
  try {
    await initPersistentStorage()
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

void bootstrap()
