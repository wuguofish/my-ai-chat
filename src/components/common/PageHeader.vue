<template>
  <div class="page-header-wrapper">
    <!-- 節日特效 -->
    <!-- 情人節愛心 -->
    <div v-if="showHearts" class="falling-items hearts" aria-hidden="true">
      <div class="falling-item">❤</div>
      <div class="falling-item">💕</div>
      <div class="falling-item">💗</div>
      <div class="falling-item">❤</div>
      <div class="falling-item">💕</div>
      <div class="falling-item">💗</div>
      <div class="falling-item">❤</div>
      <div class="falling-item">💕</div>
    </div>
    <!-- 農曆新年福字 -->
    <div v-else-if="showLunarNewYear" class="falling-items lunar-new-year" aria-hidden="true">
      <div class="falling-item">福</div>
      <div class="falling-item">🧧</div>
      <div class="falling-item">💰</div>
      <div class="falling-item">春</div>
      <div class="falling-item">🪙</div>
      <div class="falling-item">福</div>
      <div class="falling-item">🧧</div>
      <div class="falling-item">💰</div>
    </div>
    <!-- 冬季雪花 -->
    <div v-else-if="showSnow" class="falling-items snowflakes" aria-hidden="true">
      <div class="falling-item">❄</div>
      <div class="falling-item">❅</div>
      <div class="falling-item">❆</div>
      <div class="falling-item">❄</div>
      <div class="falling-item">❅</div>
      <div class="falling-item">❆</div>
      <div class="falling-item">❄</div>
      <div class="falling-item">❅</div>
    </div>
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
import { computed } from 'vue'

defineProps<{
  title: string
}>()

// 七夕農曆對照表（農曆 7/7 對應的公曆日期）
const QIXI_DATES: Record<number, string> = {
  2024: '08-10',
  2025: '08-29',
  2026: '08-19',
  2027: '08-08',
  2028: '08-26',
  2029: '08-16',
  2030: '08-05'
}

// 農曆新年對照表（除夕日期）
const LUNAR_NEW_YEAR_EVE: Record<number, string> = {
  2024: '02-09',
  2025: '01-28',
  2026: '02-16',
  2027: '02-05',
  2028: '01-25',
  2029: '02-12',
  2030: '02-02'
}

// 取得今天的 MM-DD 格式
const getTodayMMDD = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

// 計算農曆新年期間（除夕到初五）
const isLunarNewYearPeriod = () => {
  const now = new Date()
  const year = now.getFullYear()
  const eveDate = LUNAR_NEW_YEAR_EVE[year]
  if (!eveDate) return false

  const [eveMonth, eveDay] = eveDate.split('-').map(Number)
  const eve = new Date(year, eveMonth! - 1, eveDay!)
  const endDate = new Date(eve)
  endDate.setDate(endDate.getDate() + 5) // 初五

  return now >= eve && now <= endDate
}

// 情人節愛心特效：2/14、3/14、七夕當天
const showHearts = computed(() => {
  const todayMMDD = getTodayMMDD()
  const year = new Date().getFullYear()

  // 西洋情人節
  if (todayMMDD === '02-14') return true
  // 白色情人節
  if (todayMMDD === '03-14') return true
  // 七夕
  if (QIXI_DATES[year] === todayMMDD) return true

  return false
})

// 農曆新年特效：除夕到初五
const showLunarNewYear = computed(() => {
  return isLunarNewYearPeriod()
})

// 冬季雪花效果：12/25 ~ 農曆新年前
const showSnow = computed(() => {
  // 如果已經顯示愛心或農曆新年，就不顯示雪花
  if (showHearts.value || showLunarNewYear.value) return false

  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  // 12/25 ~ 12/31
  if (month === 12 && day >= 25) return true
  // 1/1 ~ 農曆新年前（用 2/15 作為保守估計）
  if (month === 1) return true
  if (month === 2 && day <= 15) return true

  return false
})
</script>

<style scoped>
/* 節日特效共用樣式 */
.falling-items {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
  z-index: 1;
}

.falling-item {
  position: absolute;
  top: -10px;
  font-size: 1rem;
  animation: falling linear infinite;
  user-select: none;
}

.falling-item:nth-child(1) { left: 5%; animation-duration: 4s; animation-delay: 0s; font-size: 0.8rem; }
.falling-item:nth-child(2) { left: 15%; animation-duration: 5s; animation-delay: 1s; font-size: 1rem; }
.falling-item:nth-child(3) { left: 30%; animation-duration: 4.5s; animation-delay: 0.5s; font-size: 0.7rem; }
.falling-item:nth-child(4) { left: 45%; animation-duration: 5.5s; animation-delay: 2s; font-size: 0.9rem; }
.falling-item:nth-child(5) { left: 55%; animation-duration: 4s; animation-delay: 1.5s; font-size: 0.8rem; }
.falling-item:nth-child(6) { left: 70%; animation-duration: 5s; animation-delay: 0.8s; font-size: 1rem; }
.falling-item:nth-child(7) { left: 82%; animation-duration: 4.2s; animation-delay: 2.5s; font-size: 0.75rem; }
.falling-item:nth-child(8) { left: 92%; animation-duration: 5.2s; animation-delay: 1.2s; font-size: 0.85rem; }

/* 雪花特效 */
.snowflakes .falling-item {
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 0 0 3px rgba(255, 255, 255, 0.5);
}

/* 愛心特效 */
.hearts .falling-item {
  color: #ff6b8a;
  text-shadow: 0 0 5px rgba(255, 107, 138, 0.5);
}

/* 農曆新年特效 */
.lunar-new-year .falling-item {
  color: #ffd700;
  text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
  font-weight: bold;
}

@keyframes falling {
  0% {
    transform: translateY(-10px) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(80px) rotate(360deg);
    opacity: 0.3;
  }
}

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
  overflow: hidden; /* 確保雪花不會溢出 */
}

/* 確保內容在雪花之上 */
.brand-logo,
.function-header,
.header-right {
  position: relative;
  z-index: 2;
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
  flex-direction: column;
  justify-items: center;
  align-items: end;
  min-width: 150px;
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
