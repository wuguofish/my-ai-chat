import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // GitHub Pages 部署設定
  // 如果部署到 https://username.github.io/repo-name/，則設定為 '/repo-name/'
  // 如果部署到自訂網域或 https://username.github.io/，則設定為 '/'
  base: process.env.NODE_ENV === 'production' ? '/my-ai-chat/' : '/'
})
