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

**最後更新：** 2025-12-10
