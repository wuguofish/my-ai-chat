# 愛聊天 AI Chat - 開發計畫

## 目前進行中的新功能開發

### 階段一：狀態訊息欄（動態簽名）✅ 最優先

**功能描述：**
- 類似 LINE 的個人狀態訊息
- 角色上線時會根據情境自動生成符合個性的狀態訊息
- 玩家也可以手動編輯

**實作步驟：**

1. **修改資料結構** `src/types/index.ts`
   ```typescript
   interface Character {
     // ... 現有欄位
     statusMessage?: string  // 新增：狀態訊息
     statusUpdatedAt?: number // 新增：狀態訊息更新時間
   }
   ```

2. **Store 支援** `src/stores/characters.ts`
   - 新增 `updateCharacterStatus(characterId: string, message: string)` action
   - 狀態訊息會隨 character 資料一起持久化

3. **自動生成狀態訊息邏輯** `src/utils/chatHelpers.ts`（新增函數）
   - `generateStatusMessage(character: Character, context?: {shortTermMemories?, mood?, timeOfDay?})`
   - 呼叫 Gemini API 生成符合角色個性的狀態訊息
   - 考量因素：
     - 角色性格描述與說話風格
     - **短期記憶**（最近的互動經驗，最多 6 筆）
     - 心情（好感度變化趨勢）
     - 時間（早/午/晚）
   - 限制字數：建議 30 字以內
   - 優點：直接利用現有記憶系統，不需要重複讀取訊息

4. **觸發時機**
   - **作息變化**：角色從 offline/away 變成 online 時
     - 實作位置：作息系統的狀態切換邏輯
   - **關係等級變化**：與使用者的好感度等級突破時
     - 例如：stranger → acquaintance、friend → close_friend
     - 實作位置：`src/stores/relationships.ts` 的 `updateAffection()` action
   - **角色間關係變化**：兩個角色之間的關係類型改變時
     - 例如：normal → friend、friend → romantic
     - 實作位置：階段二實作的關係評估邏輯
   - **重大事件**：生成長期記憶時（可選）
     - 代表發生了值得紀念的重要事件
     - 實作位置：`src/stores/memories.ts` 的記憶生成邏輯

5. **UI 顯示**
   - **好友列表** `src/views/CharacterList.vue`
     - 在角色名稱下方顯示狀態訊息（灰色小字）
   - **角色詳情** `src/views/CharacterDetail.vue`
     - 顯示狀態訊息
     - 提供「編輯狀態訊息」按鈕（手動修改）
   - **聊天室** `src/views/ChatRoom.vue`（可選）
     - 點擊角色頭像時的資訊卡片中顯示

6. **手動編輯介面**
   - 在角色詳情頁面加入編輯欄位
   - 輸入限制：30 字
   - 提供「清除狀態」選項

**預估工作量：** 3-4 小時

---

### 階段二：角色間關係動態調整 🎯 次優先

**功能描述：**
- 角色之間的關係會根據互動動態變化
- 在群聊情境摘要更新時，同步請 LLM 評估角色間的關係
- 關係有固定類型 + LLM 自由描述

**實作步驟：**

1. **修改資料結構** `src/types/index.ts`
   ```typescript
   // 已存在，需要調整
   interface CharacterRelationship {
     fromCharacterId: string
     toCharacterId: string
     relationshipType: CharacterRelationType  // 已有：'normal' | 'friend' | 'rival' | 'family' | 'romantic'
     description: string  // 玩家可編輯的備註
     note?: string        // 已有
     // 新增以下欄位：
     state?: string      // LLM 評估的最新關係描述（玩家可編輯/刪除）
     updatedAt?: number  // 最後更新時間戳
   }
   ```

2. **Store 功能擴充** `src/stores/relationships.ts`
   - 新增 `updateRelationshipState(fromId: string, toId: string, type: CharacterRelationType, state?: string)` action
   - 新增 `deleteRelationshipState(fromId: string, toId: string)` action
   - 新增 `getRelationshipBetween(char1: string, char2: string)` getter（雙向查詢）

3. **LLM 關係評估邏輯** `src/utils/relationshipHelpers.ts`（新增）
   - `evaluateRelationships(chatRoomId: string, characters: Character[], recentMessages: Message[])`
   - 呼叫 Gemini API，提示詞包含：
     - 聊天室內所有角色的基本資料
     - 最近 30 則訊息（或情境摘要）
     - 要求 LLM 評估「每對角色之間的關係」
   - 回應格式（JSON）：
     ```json
     {
       "relationships": [
         {
           "from": "角色A的ID",
           "to": "角色B的ID",
           "type": "friend",  // normal/friend/rival/family/romantic
           "state": "最近因為工作上的合作變得更親近了"
         },
         // ...
       ]
     }
     ```
   - 解析回應並更新 relationshipStore

4. **整合到情境摘要流程** `src/stores/chatRooms.ts` 或 `src/stores/memories.ts`
   - 在群聊情境摘要生成後（每 30 則訊息）
   - 呼叫 `evaluateRelationships()`
   - 更新所有角色對的關係狀態

5. **UI 顯示與編輯**
   - **角色詳情頁** `src/views/CharacterDetail.vue`
     - 新增「角色關係」區塊
     - 顯示該角色對其他角色的關係
     - 格式：
       ```
       對 [角色名稱] 的關係：朋友 💚
       目前狀態：最近因為工作上的合作變得更親近了
       [編輯] [刪除狀態]
       ```
   - **關係編輯功能**
     - 可修改 `relationshipType`（下拉選單）
     - 可編輯/刪除 `state`（文字輸入）
     - **不能新增**關係（關係由 LLM 自動建立）

6. **關係對稱性處理**
   - 關係是**單向**的（A 對 B 的關係 ≠ B 對 A 的關係）
   - 但 LLM 評估時應該兩個方向都評估
   - 例如：A 暗戀 B（romantic），但 B 對 A 只是普通朋友（friend）

**預估工作量：** 5-6 小時

---

### 階段三：未讀訊息回應系統 🔮 最後實作

**功能描述：**
- 角色從離線變成上線時，會檢查是否有未讀訊息
- 如果有重要內容（被 @ 或關鍵對話），角色會主動回應

**實作步驟：**

1. **修改資料結構** `src/types/index.ts`
   ```typescript
   interface Character {
     // ... 現有欄位
     lastReadMessages?: {
       [chatRoomId: string]: {
         lastReadAt: number       // 最後已讀時間戳
         lastReadMessageId?: string  // 最後已讀訊息 ID
       }
     }
   }
   ```

2. **Store 支援** `src/stores/characters.ts`
   - `updateLastRead(characterId: string, chatRoomId: string, timestamp: number, messageId?: string)` action
   - 每次角色發送訊息時，更新該角色在該聊天室的 lastRead

3. **未讀訊息檢測邏輯** `src/utils/chatHelpers.ts`
   - `getUnreadMessages(character: Character, chatRoom: ChatRoom): Message[]`
   - 根據 `lastReadAt` 時間戳，找出該角色在該聊天室的未讀訊息
   - 過濾條件：
     - 訊息時間晚於 lastReadAt
     - 不是角色自己發的

4. **判斷是否需要回應** `src/utils/chatHelpers.ts`
   - `shouldRespondToUnread(character: Character, unreadMessages: Message[]): boolean`
   - 回應條件：
     - 被 @ 提及
     - 訊息數量 > 5 則（避免太久沒上線一次回太多）
     - 包含關鍵字（可選，例如角色名字）
   - **限制：避免一上線就狂洗訊息**
     - 最多回應 1-2 次
     - 或者只針對「最近 10 則未讀訊息」做回應判斷

5. **自動回應生成** `src/utils/chatHelpers.ts`
   - `generateCatchUpResponse(character: Character, unreadMessages: Message[], chatRoom: ChatRoom)`
   - 呼叫 Gemini API 生成回應
   - 提示詞包含：
     - 「你剛上線，看到了這些訊息...」
     - 未讀訊息內容（摘要）
     - 角色個性與說話風格
   - 回應應該自然，例如：「欸抱歉我剛剛沒看手機，你們在聊什麼？」

6. **整合到作息系統** `src/utils/chatHelpers.ts` 或 `src/stores/chatRooms.ts`
   - 在角色狀態從 offline/away → online 時觸發
   - 檢查所有該角色參與的聊天室
   - 如果有符合條件的未讀訊息，自動發送回應

7. **UI 顯示**
   - 聊天室中顯示角色「剛上線」的提示（可選）
   - 自動回應的訊息會標註「自動回應」（可選，或者完全看起來像自然訊息）

8. **避免無限循環**
   - 如果角色 A 回應未讀 → 角色 B 上線檢測到 A 的回應 → B 又回應 → ...
   - 解決方案：
     - 標記「自動回應」的訊息
     - 自動回應不會觸發其他角色的自動回應
     - 或設定冷卻時間（同一聊天室 10 分鐘內只能有一次自動回應）

**預估工作量：** 6-7 小時

---

## 開發順序與理由

1. **階段一：狀態訊息欄** → 獨立功能，不影響現有邏輯，最容易實作
2. **階段二：角色關係動態調整** → 與情境摘要整合，需要調整現有流程
3. **階段三：未讀訊息回應** → 最複雜，涉及作息系統、訊息流、避免循環等多個模組

## 注意事項

- 所有新功能都要考慮 LocalStorage 持久化
- LLM 呼叫要加入錯誤處理（API 失敗不應影響核心功能）
- 測試時注意效能（特別是關係評估，可能涉及大量運算）
- UI 設計要符合現有的全域樣式系統

## 版本規劃

- **v1.x.0**：狀態訊息欄
- **v1.x+1.0**：角色關係動態調整
- **v1.x+2.0**：未讀訊息回應系統

---

**最後更新：** 2025-12-05
**負責人：** 阿宇 & 阿童
