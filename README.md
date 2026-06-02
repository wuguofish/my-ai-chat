# 愛茶的 AI Chat

> 找群 AI 好友，泡茶聊天 ☕

一個基於 Vue 3 + TypeScript 的純前端 AI 聊天應用程式，使用 Google Gemini API 提供智能對話功能。創造你的 AI 角色，與他們泡茶聊天，建立專屬的互動記憶。

## 專案特色

- 🎯 **純前端應用** - 無需後端伺服器，所有資料存儲在瀏覽器 LocalStorage
- 🤖 **AI 角色系統** - 創建多個自訂 AI 角色，每個角色擁有獨特的性格和說話風格
- 💬 **多人聊天室** - 支援單人對話和群聊（最多 15 位角色）
- ⏰ **角色作息系統** - 設定角色活躍時段，模擬真實的作息時間
- 💕 **關係系統** - 追蹤使用者與角色間的好感度和關係等級
- 🧠 **記憶管理** - 角色綁定的長期/短期記憶系統
- 📱 **響應式設計** - 適配桌面和移動裝置

## 技術棧

- **框架**: Vue 3 (Composition API)
- **語言**: TypeScript
- **狀態管理**: Pinia (with persistence)
- **路由**: Vue Router
- **構建工具**: Vite
- **AI API**: Google Gemini API
- **樣式**: 原生 CSS + CSS Variables
- **Vibe Coding工具**: Claude Code（已包含基礎的CLAUDE.md檔，供其他開發者與Claude Code協作時使用）

## 快速開始

### 安裝依賴

```bash
npm install
```

### 開發模式

```bash
npm run dev
```

### 建置生產版本

```bash
npm run build
```

### 預覽生產版本

```bash
npm run preview
```

## 專案結構

```
my-ai-chat/
├── src/
│   ├── assets/          # 靜態資源
│   ├── components/      # 可重用組件（目前未使用）
│   ├── router/          # 路由配置
│   ├── stores/          # Pinia 狀態管理
│   │   ├── user.ts          # 使用者資料
│   │   ├── characters.ts    # 角色管理
│   │   ├── chatRooms.ts     # 聊天室管理
│   │   └── relationships.ts # 關係系統
│   ├── types/           # TypeScript 型別定義
│   ├── utils/           # 工具函數和常數
│   ├── views/           # 頁面組件
│   │   ├── onboarding/      # 初次使用引導
│   │   └── main/            # 主要功能頁面
│   ├── App.vue          # 根組件
│   ├── main.ts          # 應用程式入口
│   └── style.css        # 全域樣式定義
├── public/              # 公開資源
├── CLAUDE.md            # 開發者文件（樣式系統、設計規範）
├── README.md            # 專案說明
└── package.json         # 專案依賴
```

## 設計系統

本專案使用 CSS Variables 建立完整的設計系統。詳細的樣式規範和使用方式請參閱 [CLAUDE.md](./CLAUDE.md)。

### 常用樣式類別

- `.page-header` - 頁面 sticky header
- `.content-section` - 內容區塊
- `.section-header` - 區塊標題（左右排列）
- `.empty-state` - 空狀態顯示
- `.form-group` - 表單群組
- `.btn-primary` / `.btn-secondary` - 按鈕樣式

完整樣式規範請見 `CLAUDE.md`。

## 資料結構

### LocalStorage Keys

- `ai-chat-user-profile` - 使用者個人資料
- `ai-chat-app-data` - 應用程式資料（角色、聊天室、關係等）
- `ai-chat-settings` - 應用程式設定

### 關係等級系統

| 等級 | 名稱 | 好感度範圍 |
|------|------|-----------|
| stranger | 陌生人 | 0-10 |
| acquaintance | 認識 | 10-30 |
| friend | 朋友 | 30-80 |
| close_friend | 好友/曖昧 | 80-200 |
| soulmate | 摯友/戀人 | 200+ |

## 功能限制

- 最多 15 個角色
- 每個聊天室最多 15 位角色
- 全域記憶最多 10 條
- 情境記憶最多 5 條
- 角色性格描述最多 1500 字
- 角色說話風格最多 2000 字

## 環境需求

- Node.js 18+
- 現代瀏覽器（支援 ES2020+）

## License

MIT

## 作者

阿童、阿宇（由Claude Code詮釋）
