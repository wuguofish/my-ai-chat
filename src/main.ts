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
  await initPersistentStorage()

  const app = createApp(App)

  app.use(pinia)
  app.use(router)

  app.mount('#app')
}

void bootstrap()
