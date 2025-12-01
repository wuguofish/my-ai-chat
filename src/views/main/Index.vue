<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const currentTab = computed(() => {
  const path = route.path
  if (path.includes('/characters')) return 'characters'
  if (path.includes('/settings')) return 'settings'
  return 'chats'
})

const navigateTo = (tab: string) => {
  router.push(`/main/${tab}`)
}
</script>

<template>
  <div class="main-layout">
    <!-- 主要內容區域 -->
    <div class="content-area">
      <router-view />
    </div>

    <!-- 底部導航 -->
    <nav class="bottom-nav">
      <button
        :class="['nav-item', { active: currentTab === 'chats' }]"
        @click="navigateTo('chats')"
      >
        <span class="nav-icon">💬</span>
        <span class="nav-label">聊天</span>
      </button>

      <button
        :class="['nav-item', { active: currentTab === 'characters' }]"
        @click="navigateTo('characters')"
      >
        <span class="nav-icon">👥</span>
        <span class="nav-label">好友</span>
      </button>

      <button
        :class="['nav-item', { active: currentTab === 'settings' }]"
        @click="navigateTo('settings')"
      >
        <span class="nav-icon">⚙️</span>
        <span class="nav-label">設定</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.main-layout {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  overflow: hidden;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 60px; /* 為底部導航留出空間 */
}

.bottom-nav {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: white;
  border-top: 1px solid #e0e0e0;
  padding: 8px 0;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.3s;
  color: #999;
}

.nav-item.active {
  color: #667eea;
}

.nav-item:hover {
  background: #f5f5f5;
}

.nav-icon {
  font-size: 24px;
  margin-bottom: 4px;
  filter: grayscale(100%);
  transition: filter 0.3s;
}

.nav-item.active .nav-icon {
  filter: grayscale(0%);
}

.nav-label {
  font-size: 12px;
  font-weight: 500;
}

@media (max-width: 768px) {
  .nav-icon {
    font-size: 20px;
  }

  .nav-label {
    font-size: 11px;
  }
}
</style>
