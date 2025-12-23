# 愛茶的 AI Chat - 待開發功能

## Phase 5：多 LLM 服務支援

**目前狀態：** 規劃中

**功能描述：**
讓使用者可以選擇串接 Gemini 以外的 LLM 服務。

### 支援的服務商

| 服務商 | 主要對話 | 輕量任務 |
|--------|----------|----------|
| Gemini | 2.5 Flash | 2.5 Flash Lite |
| OpenAI | GPT-4o | GPT-4o-mini |
| Claude | Sonnet | Haiku |
| Grok | Grok 3 | Grok 3 mini |

### UI 設計

#### 1. Settings 頁面 - API 設定區塊

```
┌─────────────────────────────────────────────┐
│  API 設定                                    │
├─────────────────────────────────────────────┤
│  預設 AI 服務商：[▼ Gemini              ]    │
│                                             │
│  ── Gemini ──                               │
│  API Key: [••••••••••••••] 👁               │
│  [更新] [檢測連線]                           │
│  └ 主要對話：2.5 Flash ／輕量：2.5 Flash Lite │
│  💡 額度查詢請前往 Google AI Studio          │
│                                             │
│  ── OpenAI ── (選填)                        │
│  API Key: [                   ] 👁          │
│  [更新] [檢測連線]                           │
│  └ 主要對話：GPT-4o ／輕量：GPT-4o-mini      │
│  💡 額度查詢請前往 OpenAI Platform           │
│                                             │
│  ── Claude ── (選填)                        │
│  API Key: [                   ] 👁          │
│  [更新] [檢測連線]                           │
│  └ 主要對話：Sonnet ／輕量：Haiku            │
│  💡 額度查詢請前往 Anthropic Console         │
│                                             │
│  ⚠️ 「檢測連線」僅驗證 API Key 是否有效，     │
│     不代表有剩餘額度。各模型額度獨立計算，     │
│     請至各服務商後台確認。                    │
└─────────────────────────────────────────────┘
```

**重點：**
- 預設服務商下拉選單（Gemini / OpenAI / Claude）
- 每家服務商獨立的 API Key 輸入框
- 「檢測連線」按鈕（僅驗證 API Key 有效性，不保證額度）
- 每家都附上對應後台連結
- 底部統一說明檢測的限制

#### 2. 角色編輯頁面 - 進階設定

```
┌─────────────────────────────────────────────┐
│  進階設定                                    │
├─────────────────────────────────────────────┤
│  AI 服務商                                   │
│  [▼ 使用全域設定 (Gemini)              ]    │
│  💡 若該服務商的 API Key 未設定，將無法對話   │
│                                             │
│  系統提示詞 ...                              │
└─────────────────────────────────────────────┘
```

**下拉選項：**
- 使用全域設定（顯示目前預設是哪家）
- Gemini
- OpenAI
- Claude

**匯入名片的特殊處理：**
- 若原作者有設定建議服務商，顯示提示文字：「此好友的中之人建議使用：XXX」
- 即使是隱藏設定的名片，AI 服務商選項仍可讓使用者手動調整

#### 3. 名片匯入流程

```
匯入名片
    ↓
檢查名片內的「建議服務商」
    ↓
使用者有該 API Key？
    ├─ 有 → 直接匯入，套用建議服務商
    └─ 沒有 → 彈出提示：
             「此名片建議使用 Claude，但你尚未設定
              Claude API Key，將改用預設服務商」
             [確定]
             → 匯入後修改設定為預設服務商
             → 進階設定顯示：「此好友的中之人建議使用：Claude」
```

### 技術實作要點

#### 1. 資料結構

**Settings（user store）：**
```typescript
interface LLMSettings {
  defaultProvider: 'gemini' | 'openai' | 'claude'
  apiKeys: {
    gemini?: string
    openai?: string
    claude?: string
  }
}
```

**Character：**
```typescript
interface Character {
  // ... 現有欄位
  llmProvider?: 'gemini' | 'openai' | 'claude'  // 未設定時使用全域預設
  recommendedProvider?: 'gemini' | 'openai' | 'claude'  // 名片匯入時保留原作者建議
}
```

#### 2. 服務層架構

**檔案結構：**
```
src/services/
├── llm/
│   ├── types.ts          # 統一介面定義
│   ├── config.ts         # 各服務商模型配對
│   ├── utils.ts          # 共用邏輯（年齡判斷、文字清理等）
│   ├── adapters/
│   │   ├── gemini.ts     # Gemini adapter
│   │   ├── openai.ts     # OpenAI adapter
│   │   ├── claude.ts     # Claude adapter
│   │   └── grok.ts       # Grok adapter
│   └── index.ts          # 匯出 + 取得 adapter 的 factory
├── gemini.ts             # 保留舊檔案，向後兼容（內部引用 llm/）
```

- 抽象化 AI 服務層，定義統一介面
- 各服務商實作 adapter
- 模型配對關係集中管理在 config

```typescript
// 統一介面
interface LLMAdapter {
  chat(messages: Message[], options: ChatOptions): Promise<ChatResponse>
  validateApiKey(apiKey: string): Promise<boolean>
}

// 模型配對 config
const LLM_CONFIG = {
  gemini: {
    mainModel: 'gemini-2.5-flash',
    liteModel: 'gemini-2.5-flash-lite',
    consoleUrl: 'https://aistudio.google.com/app/api-keys'
  },
  openai: {
    mainModel: 'gpt-4o',
    liteModel: 'gpt-4o-mini',
    consoleUrl: 'https://platform.openai.com/api-keys'
  },
  claude: {
    mainModel: 'claude-sonnet-4-20250514',
    liteModel: 'claude-haiku',
    consoleUrl: 'https://console.anthropic.com/settings/keys'
  },
  grok: {
    mainModel: 'grok-3',
    liteModel: 'grok-3-mini',
    consoleUrl: 'https://console.x.ai/'
  }
}
```

#### 4. 聊天室 LLM 顯示

在記憶/成員面板中顯示目前使用的 AI 服務商：

**私聊：**
```
┌────────────────────────┐
│ 小明 G 的記憶           │  ← 名稱旁顯示服務商 icon
├────────────────────────┤
│ [短期記憶] [長期記憶]    │
└────────────────────────┘
```

**群聊：**
```
┌────────────────────────┐
│ 成員 (3)               │
├────────────────────────┤
│ 👤 小明  G              │  ← 每個成員旁顯示 icon
│ 👤 小花  ⬡             │
│ 👤 阿強  ✳             │
└────────────────────────┘
```

**Icon 設計：**

| 服務商 | Icon | 顏色 | Tooltip |
|--------|------|------|---------|
| Gemini | **G** | `#4285F4` 藍 | Google Gemini |
| OpenAI | **⬡** | `#10A37F` 綠 | OpenAI |
| Claude | **✳** | `#D97706` 橘 | Claude |
| Grok | **⌀** | `#000`/`#FFF` 黑白 | Grok |

- 使用 CSS 實現，不需額外 icon 資源
- hover 時顯示 tooltip 說明

### 待細化事項

- [ ] 各服務商的 API 呼叫實作細節
- [ ] 錯誤處理與提示訊息

---

## Phase 6：圖片輸入功能

**目前狀態：** 待 Phase 5 完成後開始

**功能描述：**
讓使用者可以在聊天中分享圖片給 AI 好友。

**前置依賴：** Phase 5（多 LLM 支援）

**設計方向：**
- 各 adapter 實作多模態 API 呼叫
- 聊天室 UI 支援圖片上傳
- 圖片預覽與壓縮處理

---

**最後更新：** 2025-12-23
