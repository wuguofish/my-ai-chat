<template>
  <div class="page-header-wrapper">
    <img src="/logo.svg" alt="愛茶的 AI Chat" class="brand-logo" />
    <div class="function-header">
      <!-- 品牌欄位 -->
      <div class="brand-header">
        <div class="brand-info">
          <h2 class="brand-title">愛茶的 AI Chat</h2>
          <span class="brand-subtitle">－－和專屬於你的 AI 夥伴們泡茶聊天－－</span>
        </div>
      </div>
      <!-- 頁面標題列 -->
      <div class="page-header">
        <div class="header-left">
          <slot name="back-button"></slot>
          <h3>{{ title }}</h3>
        </div>
      </div>
    </div>
    <div class="header-right">
      <slot name="actions"></slot>
      <slot name="extra-info"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<style scoped>

.function-header{
  align-items: center;
  padding: 0 var(--spacing-xl);
  width: 100%;
}

.page-header-wrapper {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: row;
  justify-content: start;
  align-items: center;
  flex: 1;
  border-bottom: 2px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  padding: var(--spacing-xs) var(--spacing-xl);
}

/* 品牌欄位 */
.brand-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  
}

.brand-logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.brand-info {
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 2px;
}

.brand-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: white;
  margin: 0;
}

.brand-subtitle {
  font-size: var(--text-sm);
  color: rgba(255, 255, 255, 0.9);
  margin-left: 10px;
  margin-top: 0.2rem;
}

/* 頁面標題列 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h1,
.page-header h2,
.page-header h3 {
  color: var(--color-text-white);
  margin: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.header-left h2 {
  font-size: var(--text-4xl);
  color: var(--color-text-primary);
  margin: 0;
}

.header-right {
  display: flex;
  gap: var(--spacing-sm);
  min-width: 100px;
}

/* 響應式 */
@media (max-width: 768px) {

  .brand-logo {
    width: 48px;
    height: 48px;
  }

  .brand-title {
    font-size: var(--text-base);
  }

  .brand-subtitle {
    display: none;
  }

  .header-left h2 {
    font-size: var(--text-2xl);
  }

  .brand-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    justify-content: start;
  }

  .brand-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: white;
    margin: 0;
    text-align: left;
  }

  .brand-subtitle {
    font-size: var(--text-sm);
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
    text-align: left;
  }
}
</style>
