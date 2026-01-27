# 愛茶的 AI Chat - 待開發功能

## Phase 5：多 LLM 服務支援

**目前狀態：** ✅ 完成（Gemini + Claude + OpenAI）

**功能描述：**
讓使用者可以選擇串接 Gemini 以外的 LLM 服務。

### 已完成項目

- [x] LLM 服務層架構重構（`src/services/llm/`）
- [x] 統一介面定義（`types.ts`）
- [x] 模型配置集中管理（`config.ts`）
- [x] 共用工具函數抽取（`utils.ts`）
- [x] Gemini Adapter 實作
- [x] Claude Adapter 實作
- [x] Settings 頁面 - 多服務商 API Key 管理 UI
- [x] 角色編輯頁面 - 進階設定中可選擇 LLM 服務商
- [x] 聊天室使用角色設定的服務商進行對話
- [x] Adapter 自動從 userStore 取得 API Key（簡化呼叫端程式碼）
- [x] 移除舊的 `@/services/gemini` 模組
- [x] 聊天室顯示服務商 icon（私聊 Header + 群聊成員面板）
- [x] 名片匯入時的「建議服務商」處理

### 待開發項目

- [x] OpenAI Adapter 實作
- [ ] ~~Grok Adapter 實作~~ （暫緩，使用者較少）

### 支援的服務商

| 服務商 | 主要對話 | 輕量任務 | 狀態 |
|--------|----------|----------|------|
| Gemini | 2.5 Flash | 2.5 Flash Lite | ✅ 已完成 |
| Claude | Sonnet 4.5 | Haiku 4.5 | ✅ 已完成 |
| OpenAI | GPT-4.1 | GPT-4.1 mini | ✅ 已完成 |
| Grok | Grok 3 | Grok 3 mini | ⏸️ 暫緩 |

### 架構說明

#### 服務層結構

```
src/services/llm/
├── types.ts          # 統一介面定義（LLMAdapter, GenerateOptions 等）
├── config.ts         # 各服務商模型配置
├── utils.ts          # 共用邏輯（年齡判斷、文字清理、錯誤處理等）
├── adapters/
│   ├── gemini.ts     # Gemini adapter ✅
│   ├── claude.ts     # Claude adapter ✅
│   ├── openai.ts     # OpenAI adapter ✅
│   └── grok.ts       # Grok adapter ⏸️
└── index.ts          # 主要入口，匯出 getAdapter、getDefaultAdapter 等
```

#### LLMAdapter 介面

```typescript
interface LLMAdapter {
  readonly provider: LLMProvider

  // 驗證 API Key（外部傳入，用於驗證尚未儲存的 key）
  validateApiKey(apiKey: string): Promise<ValidateApiKeyResult>

  // 生成內容（API Key 自動從 userStore 取得）
  generate(messages: LLMMessage[], options?: GenerateOptions): Promise<GenerateResponse>

  // 取得角色回應（API Key 自動從 userStore 取得）
  getCharacterResponse(params: GetCharacterResponseParams): Promise<CharacterResponse>
}
```

#### 使用方式

```typescript
// 取得 adapter（根據角色的 LLM 設定）
const adapter = await getDefaultAdapter(character)

// 直接呼叫，不需傳入 apiKey
const response = await adapter.generate(messages, options)
const chatResponse = await adapter.getCharacterResponse(params)
```

---

## Phase 6：圖片輸入功能

**目前狀態：** ✅ 完成

**功能描述：**
讓使用者可以在聊天中分享圖片給 AI 好友。

### 已完成項目

- [x] 各 adapter 實作多模態 API 呼叫（Gemini / Claude / OpenAI）
- [x] 聊天室 UI 支援圖片上傳（按鈕 + 貼上）
- [x] 圖片預覽與壓縮處理（最大 1024px、500KB）
- [x] 訊息資料結構支援圖片附件（`ImageAttachment`）
- [x] 私聊與群聊皆支援圖片

### Bug 修復

- [x] 修復群聊傳送圖片時 Gemini API 錯誤（空 parts 陣列問題）
- [x] 修復群聊第一輪訊息傳遞邏輯（所有第一輪角色都收到使用者文字訊息）
- [x] 修復短 ID 轉長 ID 的正則表達式問題（避免 `@1` 誤匹配 UUID 開頭）

### 設計說明

- **圖片壓縮**：上傳時自動壓縮（Canvas API），漸進式品質降低
- **歷史訊息**：僅當前訊息的圖片會傳送給 API，歷史圖片不重複傳送（節省 token）
- **群聊處理**：只有第一輪的第一個角色會「看到」圖片，其他角色從對話中得知圖片內容

### 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/types/index.ts` | ImageAttachment 介面、Message.images 欄位 |
| `src/services/llm/types.ts` | LLMImageContent、userImages 參數 |
| `src/utils/imageHelpers.ts` | 圖片壓縮/驗證工具 |
| `src/utils/constants.ts` | 圖片限制常數 |
| `src/services/llm/adapters/*.ts` | 各 adapter 多模態轉換 |
| `src/views/main/ChatRoom.vue` | UI 實作 |

---

**最後更新：** 2026-01-27
