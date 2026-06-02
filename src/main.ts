import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import pinia from './stores'
import { migrateLocalStorage } from './utils/dataObfuscation'

// 在 Pinia 初始化之前遷移舊格式 LocalStorage 資料
// 這確保 Pinia persist 讀取時已經是新編碼格式
migrateLocalStorage()

const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')
