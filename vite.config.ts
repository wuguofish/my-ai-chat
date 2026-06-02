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
  // 統一使用 '/my-ai-chat/' 作為 base path
  base: '/my-ai-chat/',
  build: {
    // 確保每次 build 都會生成新的檔案 hash
    rollupOptions: {
      output: {
        // 為 JS 和 CSS 檔案加上 hash，避免快取問題
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
})
