# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# 愛聊天 AI Chat - 開發者文件

此文件提供專案的開發指南，包括架構說明、設計系統使用原則、樣式規範、程式碼慣例等。

## 開發命令

```bash
npm install    # 安裝依賴
npm run dev    # 啟動開發伺服器
npm run build  # 建置生產版本（會自動執行 prebuild 更新版本資訊）
npm run preview # 預覽生產版本
```

## 專案架構

### 技術棧
- **Vue 3 Composition API + TypeScript**
- **Pinia** 狀態管理（使用 pinia-plugin-persistedstate 持久化）
- **Vue Router** 路由管理
- **Google Gemini API** AI 對話服務
- **Vite** 建置工具
- **GitHub Pages** 部署（base path: `/my-ai-chat/`）

### 核心架構模式

#### 1. 資料持久化架構
- 所有應用資料存儲在 **LocalStorage**，無後端伺服器
- Pinia stores 自動持久化，刷新頁面不會遺失資料
- LocalStorage Keys:
  - `ai-chat-user-profile` - 使用者資料
  - `ai-chat-app-data` - 應用程式主要資料（Pinia persist）
  - `ai-chat-settings` - 應用程式設定

#### 2. 狀態管理結構（Pinia Stores）
```
stores/
├── user.ts           # 使用者個人資料、API Key
├── characters.ts     # 好友（角色）管理
├── chatRooms.ts      # 聊天室與訊息管理
├── relationships.ts  # 好感度與關係系統
├── memories.ts       # 記憶系統（長期/短期）
└── settings.ts       # 應用程式設定
```

**重要：記憶系統採用「角色綁定」架構**
- 短期記憶：每個角色最多 6 筆，跨所有聊天室共用
- 長期記憶：每個角色最多 10 筆，全域共用
- 情境記憶：綁定特定聊天室，用於群聊摘要

#### 3. AI 對話流程
**單人聊天**：
1. 使用者發送訊息 → ChatRoom 組件
2. 組裝 System Prompt（包含角色資料、記憶、關係等）
3. 呼叫 Gemini API → 回應包含好感度變化
4. 解析回應，更新好感度，儲存訊息
5. 每 15 則訊息自動生成短期記憶

**群組聊天**（複雜）：
1. 使用者發送訊息
2. 判斷哪些角色需要回應（在線狀態 + @提及）
3. **多輪對話機制**：角色輪流回應，可互相 @
4. 偵測無限循環（連續兩輪相同角色組合 → 強制結束）
5. 每個角色獨立維護記憶
6. 每 30 則訊息生成情境摘要

#### 4. 角色作息系統
- 支援每週時間表（`activePeriods`）
- 三種狀態：`online` / `away` / `offline`
- 影響群聊回應機率和顯示狀態
- 工具函數：`src/utils/chatHelpers.ts` 的 `isCharacterOnline()`

#### 5. 好友名片系統（PNG 隱寫術）
- 使用 Canvas API 繪製精美名片
- PNG tEXt chunk 嵌入完整好友資料（不含好感度與記憶）
- 稀有度機制：根據好感度決定 R/SR/SSR/UR 機率
- 工具：`src/utils/pngSteganography.ts`、`src/utils/characterExport.ts`

### 重要工具模組

- **`src/utils/constants.ts`** - 所有限制常數（MAX_CHARACTERS, 記憶上限等）
- **`src/utils/chatHelpers.ts`** - 聊天相關輔助函數（在線判斷、@ 解析等）
- **`src/utils/relationshipHelpers.ts`** - 關係等級計算與顯示
- **`src/utils/characterExport.ts`** - 名片匯出/匯入功能
- **`src/utils/pngSteganography.ts`** - PNG tEXt chunk 讀寫與 CRC32 校驗
- **`src/utils/version.ts`** - 版本檢查與更新通知

### 版本管理機制
- 版本號統一寫在 `public/CHANGELOG.md` 的第一個 `## [版本號]`
- `scripts/update-version-time.js` 在 build 前自動更新 `public/version.json`
- 應用程式啟動時從 `/version.json` 讀取版本資訊
- 路由切換時檢查版本更新

### 用詞規範
**前端顯示文字統一使用：**
- 「好友」（而非「角色」）
- 「名片」（而非「角色卡」）

**程式碼變數名稱保持：**
- `character`、`characterStore`（技術層面）
- 註解可用「角色」或「好友」

---

## 設計系統核心原則

### ✅ 必須遵守的原則

1. **使用全域 CSS Variables**
   - 所有顏色、間距、字體大小都已定義在 `src/style.css`
   - 不要硬編碼數值，使用 `var(--variable-name)`

2. **優先使用全域樣式類別**
   - 檢查是否已有現成的全域類別（如 `.page-header`、`.form-group`）
   - 避免在每個組件重複定義相同的樣式

3. **遵循 8px 間距系統**
   - 使用 `--spacing-*` 變數
   - 保持間距一致性

4. **重要！！！創建新的樣式前，應先檢查全域樣式是否已有定義！！！！！**

### ❌ 應該避免的做法

1. **不要硬編碼**
   ```css
   /* ❌ 錯誤 */
   .my-button {
     background: #667eea;
     padding: 20px;
     border-radius: 8px;
   }

   /* ✅ 正確 */
   .my-button {
     background: var(--color-primary);
     padding: var(--spacing-xl);
     border-radius: var(--radius);
   }
   ```

2. **不要重複定義已存在的樣式**
   ```vue
   <!-- ❌ 錯誤：重新定義 header -->
   <template>
     <div class="my-header">
       <h2>標題</h2>
     </div>
   </template>

   <style scoped>
   .my-header {
     position: sticky;
     top: 0;
     background: var(--color-bg-primary);
     /* ... */
   }
   </style>

   <!-- ✅ 正確：使用全域類別 -->
   <template>
     <div class="page-header">
       <h2>標題</h2>
     </div>
   </template>
   ```

3. **不要過度嵌套**
   ```css
   /* ❌ 避免過深的嵌套 */
   .container .section .card .header .title {
     /* ... */
   }

   /* ✅ 保持簡單 */
   .card-title {
     /* ... */
   }
   ```

## 常用全域樣式類別速查

### 頁面結構
- `.page-header` - 頁面 sticky header
- `.content-section` - 內容區塊
- `.content-section.centered` - 置中內容區塊（max-width: 800px）
- `.section-header` - 區塊標題（左右排列）
- `.section-title` - 單純標題

### 表單元素
- `.form-group` - 表單欄位群組
- `.input-field` - 輸入欄位
- `.button-group` - 按鈕群組

### 按鈕
- `.btn-primary` - 主要按鈕
- `.btn-secondary` - 次要按鈕
- `.btn-danger` - 危險操作
- `.btn-ghost` - 透明按鈕
- `.back-btn` - 返回按鈕
- `.btn-sm` / `.btn-lg` - 尺寸變化

### 狀態顯示
- `.empty-state` - 空狀態容器
- `.empty-state-icon` - 空狀態圖示

### 卡片
- `.card` - 基本卡片
- `.card-header` - 卡片標題區
- `.card-title` - 卡片標題

### 工具類別
- 文字對齊：`.text-center` / `.text-left` / `.text-right`
- 文字顏色：`.text-primary` / `.text-secondary` / `.text-tertiary`
- 背景：`.bg-primary` / `.bg-secondary`
- Flexbox：`.flex` / `.items-center` / `.justify-between`
- 文字截斷：`.truncate`

**完整列表請參考 `src/style.css`**

## 設計變數速查

### 顏色
```css
--color-primary          /* 主色調 #667eea */
--color-text-primary     /* 主要文字 #333 */
--color-text-secondary   /* 次要文字 #666 */
--color-bg-primary       /* 主要背景 #fff */
--color-bg-secondary     /* 次要背景 #f5f5f5 */
--color-border           /* 邊框 #e0e0e0 */
```

### 間距（8px 系統）
```css
--spacing-xs   /* 4px */
--spacing-sm   /* 8px */
--spacing-md   /* 12px */
--spacing-lg   /* 16px */
--spacing-xl   /* 20px */
--spacing-2xl  /* 24px */
--spacing-3xl  /* 32px */
--spacing-4xl  /* 40px */
```

### 其他常用
```css
--text-base      /* 14px */
--text-lg        /* 16px */
--text-xl        /* 18px */
--radius         /* 8px */
--radius-lg      /* 12px */
--radius-full    /* 9999px 圓形 */
--shadow         /* 標準陰影 */
--transition     /* 0.3s ease */
```

**完整變數定義請參考 `src/style.css`**

## 開發流程建議

### 1. 開發新頁面時

```vue
<template>
  <!-- 使用全域 header -->
  <div class="page-header">
    <h2>頁面標題</h2>
  </div>

  <!-- 使用全域 content section -->
  <div class="content-section centered">
    <div class="section-header">
      <h3>區塊標題</h3>
      <button class="btn-secondary">操作</button>
    </div>

    <!-- 表單使用全域樣式 -->
    <div class="form-group">
      <label>欄位</label>
      <input class="input-field" />
    </div>

    <div class="button-group">
      <button class="btn-primary">確定</button>
      <button class="btn-secondary">取消</button>
    </div>
  </div>
</template>

<style scoped>
/* 只定義頁面特有的樣式 */
.special-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-lg);
}
</style>
```

### 2. 檢查清單

開發組件時，問自己：
- ✅ 這個樣式是否已經有全域類別？
- ✅ 顏色和間距是否使用了 CSS Variables？
- ✅ 是否遵循了 8px 間距系統？
- ✅ 命名是否清晰易懂？

### 3. 何時使用 `<style scoped>`

只在以下情況使用：
- 組件特有的佈局（如特殊的 grid 排列）
- 組件特有的動畫效果
- 需要覆蓋全域樣式的特殊情況

## 命名慣例

### Vue 組件
- PascalCase：`CharacterList.vue`、`CharacterDetail.vue`

### CSS 類別
- kebab-case：`.page-header`、`.form-group`
- BEM 風格（可選）：`.card__title`、`.btn--primary`

### TypeScript
- Interface/Type：PascalCase
- 函數/變數：camelCase
- 常數：UPPER_SNAKE_CASE

### 函數命名
- 事件處理：`handle` 前綴 → `handleClick()`
- 取得資料：`get` 前綴 → `getCharacterById()`
- 設定資料：`set` / `update` 前綴 → `updateProfile()`

## 響應式設計

採用桌面優先策略：

```css
/* 桌面樣式 */
.component {
  padding: var(--spacing-xl);
}

/* 平板以下 */
@media (max-width: 768px) {
  .component {
    padding: var(--spacing-md);
  }
}
```

## 常見問題

**Q: 什麼時候應該創建新的全域樣式類別？**

A: 當一個樣式模式在 3 個或更多地方重複使用時，考慮將它提升為全域類別。

**Q: 可以混用全域類別和自訂樣式嗎？**

A: 可以！這是推薦的做法：

```vue
<template>
  <div class="content-section my-custom-layout">
    <!-- ... -->
  </div>
</template>

<style scoped>
.my-custom-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--spacing-lg);
}
</style>
```

**Q: 如何覆蓋全域樣式？**

A: 在組件的 `<style scoped>` 中重新定義：

```vue
<style scoped>
.btn-primary {
  background: var(--color-success); /* 覆蓋為綠色 */
}
</style>
```

## 專案特定規範

### LocalStorage Keys
```typescript
'ai-chat-user-profile'  // 使用者資料
'ai-chat-app-data'      // 應用程式資料
'ai-chat-settings'      // 設定
```

### 功能限制（參考 `src/utils/constants.ts`）
- 最多 15 個角色
- 每個聊天室最多 15 位角色
- 角色性格描述最多 1500 字
- 角色說話風格最多 2000 字

### 關係等級系統
| 等級 | 好感度範圍 | 顏色 |
|------|-----------|------|
| stranger | 0-10 | 灰色 |
| acquaintance | 10-30 | 藍色 |
| friend | 30-80 | 綠色 |
| close_friend | 80-200 | 橘色 |
| soulmate | 200+ | 紅色 |

## 總結

**記住這些核心原則：**
1. ✅ 優先使用全域樣式類別
2. ✅ 使用 CSS Variables
3. ✅ 遵循 8px 間距系統
4. ✅ 保持命名一致性
5. ❌ 不要硬編碼顏色和間距
6. ❌ 不要重複定義已存在的樣式
7. ❌ 不要過度嵌套 CSS

**開發時的最佳實踐：**
- 先查看 `src/style.css` 是否有現成的類別
- 保持 `<style scoped>` 簡潔
- 需要時才創建新的全域類別
- 程式碼可讀性優於簡潔性
