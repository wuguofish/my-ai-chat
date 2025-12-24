# 愛茶的 AI Chat - 待開發功能

## Phase 5：多 LLM 服務支援

**目前狀態：** ✅ 核心功能完成（Gemini + Claude）

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

- [ ] OpenAI Adapter 實作
- [ ] Grok Adapter 實作

### 支援的服務商

| 服務商 | 主要對話 | 輕量任務 | 狀態 |
|--------|----------|----------|------|
| Gemini | 2.5 Flash | 2.5 Flash Lite | ✅ 已完成 |
| Claude | Sonnet 4.5 | Haiku 4.5 | ✅ 已完成 |
| OpenAI | GPT-4o | GPT-4o-mini | 🔜 待開發 |
| Grok | Grok 3 | Grok 3 mini | 🔜 待開發 |

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
│   ├── openai.ts     # OpenAI adapter 🔜
│   └── grok.ts       # Grok adapter 🔜
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

**目前狀態：** 待 Phase 5 完成後開始

**功能描述：**
讓使用者可以在聊天中分享圖片給 AI 好友。

**前置依賴：** Phase 5（多 LLM 支援）

**設計方向：**
- 各 adapter 實作多模態 API 呼叫
- 聊天室 UI 支援圖片上傳
- 圖片預覽與壓縮處理

---

**最後更新：** 2025-12-24
