<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessageCircleMore, UsersRound, Settings, Newspaper } from 'lucide-vue-next'


const route = useRoute()
const router = useRouter()

const currentTab = computed(() => {
  const path = route.path
  if (path.includes('/characters')) return 'characters'
  if (path.includes('/settings')) return 'settings'
  if (path.includes('/feed')) return 'feed'
  return 'chats'
})

// 輔助函數：檢查是否為目前活動的 tab
const isActive = (tab: string) => currentTab.value === tab

// 輔助函數：取得圖示的 fill 顏色
const getIconFill = (tab: string) => isActive(tab) ? '#764ba2' : '#ffffff00'

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
      <button :class="['nav-item', { active: isActive('chats') }]" @click="navigateTo('chats')">
        <MessageCircleMore :fill="getIconFill('chats')" />
        <span class="nav-label">聊天</span>
      </button>

      <button :class="['nav-item', { active: isActive('characters') }]" @click="navigateTo('characters')">
        <UsersRound :fill="getIconFill('characters')" />
        <span class="nav-label">好友</span>
      </button>

      <button :class="['nav-item', { active: isActive('feed') }]" @click="navigateTo('feed')">
        <Newspaper :fill="getIconFill('feed')" />
        <span class="nav-label">動態</span>
      </button>

      <button :class="['nav-item', { active: isActive('settings') }]" @click="navigateTo('settings')">
        <Settings :fill="getIconFill('settings')" />
        <span class="nav-label">設定</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.main-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  height: calc(100vh - 60px);/* 為底部導航留出空間 */
}

.bottom-nav {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: var(--color-bg-primary);
  border-top: 1px solid var(--color-border);  
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-sm) var(--spacing-md);
  background: none;
  border: none;
  border-radius: 0;
  cursor: pointer;
  transition: all var(--transition);
  color: var(--color-text-tertiary);
}

.nav-item.active {
  background: var(--color-primary);
  color: var(--color-text-white);  
}

.nav-item:hover {
  background: var(--color-primary-dark);
  color: var(--color-text-white);
}

.nav-icon {
  font-size: 24px;
  margin-bottom: var(--spacing-xs);
  filter: grayscale(100%);
  transition: filter var(--transition);
}

.nav-item.active .nav-icon {
  filter: grayscale(0%);
}

.nav-label {
  font-size: var(--text-xs);
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
