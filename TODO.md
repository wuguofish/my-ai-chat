# 愛聊天 AI Chat - 待開發功能

## 待實作功能

### Phase 1：角色生日欄位 ✅

**目前狀態：** 已完成

**功能描述：**
為角色新增生日欄位，作為後續生日相關功能的基礎。

**實作內容：**
- 在 `Character` interface 加上 `birthday?: string` (MM-DD 格式)
- 在角色編輯頁面加上生日輸入欄位
- 名片匯出時包含生日資訊

---

### Phase 2：使用者生日祝福功能 ✅

**目前狀態：** 已完成

**功能描述：**
當使用者生日當天開啟 App 時，好友會自動發送生日祝福訊息。

**實作內容：**
1. **進入 App 時檢測** (`App.vue` onMounted)
   - 檢查是否為使用者生日當天（MM-DD 格式比對）
   - 檢查今年是否已發送過祝福（避免重複）
   - 好感度達到 friend（30）以上的好友會自動發送祝福

2. **資料結構**
   - 獨立 localStorage key：`ai-chat-birthday-wishes`
   - 格式：`{ characterId: year }` 記錄發送年份

3. **祝福訊息生成** (`src/services/birthdayService.ts`)
   - 使用 Gemini 2.5 Flash Lite 生成個性化祝福
   - Prompt 包含角色個性、說話風格、與使用者的關係等級
   - AI 失敗時有 fallback 預設模板

4. **Settings 頁面**
   - 新增使用者生日輸入欄位（MM-DD 格式）
   - 自動格式化輸入

---

### Phase 3：狀態訊息 mood 參數實作 ✅

**目前狀態：** 已完成

**功能描述：**
角色情緒由 AI 根據對話內容自動評估，並在生成狀態訊息時使用。

**實作內容：**

1. **資料結構**
   - 在 `Character` interface 加上 `mood?: string` 和 `moodUpdatedAt?: number`
   - 在 `characters.ts` store 新增 `updateCharacterMood()` action

2. **私聊情緒評估**（每 15 則訊息）
   - `generateMemorySummaryWithMood()` 同時回傳摘要和角色情緒
   - 整合到短期記憶生成流程，不增加 API 呼叫次數

3. **群聊情緒評估**（每 30 則訊息）
   - `evaluateCharacterRelationshipsWithMood()` 同時回傳關係和所有角色情緒
   - 整合到角色間關係評估流程，不增加 API 呼叫次數

4. **狀態訊息生成**
   - 所有 `generateStatusMessage()` 呼叫處都帶入 `character.mood`
   - Prompt 會包含「目前心情」段落，讓狀態訊息更符合角色當前情緒

**修改的檔案：**
- `src/types/index.ts` - Character interface
- `src/stores/characters.ts` - updateCharacterMood action
- `src/services/memoryService.ts` - 新增情緒評估函數
- `src/views/main/ChatRoom.vue` - 處理情緒更新
- `src/stores/memories.ts` - 帶入 mood
- `src/stores/relationships.ts` - 帶入 mood
- `src/utils/chatHelpers.ts` - 帶入 mood
- `src/views/main/CharacterDetail.vue` - 帶入 mood

---

### Phase 4：動態牆功能

**目前狀態：** 規劃中

**功能描述：**
類似社群媒體的動態牆，好友和使用者都可以發布動態訊息並互動。

#### 設計方向

**1. 觸發機制：事件驅動 + 機率**
- mood 改變時
- 關係等級變化時
- 新的長期記憶產生時
- 角色上線時（根據作息系統）
- 生日、特殊節日等

每個事件有各自的發文機率，避免動態牆過滿或過空。

**2. 內容來源**
- 與觸發事件相關（例如 mood 改變 → 心情分享）
- 參考角色個性、角色關係、記憶系統生成內容

**3. 互動機制**

| 功能 | 說明 |
|------|------|
| 按讚 | 使用者 + AI 角色都可按讚，顯示按讚名單 |
| 回應 | 扁平式留言板，用 `#樓層` 回覆特定人 |
| @ 提及 | 可 @ 特定角色引發互動 |
| 使用者發文 | 使用者可發動態，AI 角色會來互動 |

**4. AI 互動觸發時機**
- 整合角色上線檢查機制
- 角色「上線」時會瀏覽動態牆，根據關係決定是否按讚/回應

**5. 資料保存策略**
- 設定數量上限
- 超過上限時提醒使用者匯出 + 清理
- 使用者確認匯出後，只保留最近一天內的動態
- 匯出格式：JSON（可匯入）+ Markdown（方便閱讀）

#### 待細化事項
- 各事件的發文機率數值
- 動態數量上限具體數字
- UI/UX 設計
- 資料結構定義

---

### Phase 5：多 LLM 服務支援

**目前狀態：** 規劃中

**功能描述：**
讓使用者可以選擇串接 Gemini 以外的 LLM 服務。

#### 設計方向

**1. 初期支援的服務商**
- Gemini（現有）
- OpenAI
- Claude

**2. 模型選擇：粗顆粒（服務商層級）**

使用者只選服務商，內部自動配對主要模型 + 輕量模型：

| 服務商 | 主要對話 | 輕量任務（狀態訊息、記憶摘要等） |
|--------|----------|--------------------------------|
| Gemini | 2.5 Flash | 2.5 Flash Lite |
| OpenAI | GPT-4o | GPT-4o-mini |
| Claude | Sonnet | Haiku |

**3. API Key 管理**
- Settings 頁面統一設定各家 API Key
- 選擇預設服務商

**4. 角色專屬設定**
- 角色編輯頁面可指定服務商
- 未指定時使用全域預設

**5. 名片匯出整合**
- 匯出時包含「建議使用的 LLM 服務商」
- 匯入時若無對應 API Key，提示使用者並用預設服務

**6. 錯誤處理**
- API 呼叫失敗時直接報錯，提供明確資訊
- 不自動 fallback 到其他服務商

**7. UI 說明**
- Settings 頁面：選擇服務商時顯示模型配對說明
- 角色編輯頁面：服務商選項旁放 info icon 說明

#### 技術實作要點
- 模型配對關係集中管理在 config 檔，方便日後更新
- 抽象化 AI 服務層，定義統一介面
- 各服務商實作 adapter

#### 待細化事項
- 各服務商的 API 呼叫實作細節
- UI/UX 設計
- 資料結構定義

---

**最後更新：** 2025-12-10
