# 動態牆功能實作計畫

## 功能概述

類似社群媒體的動態牆，好友和使用者都可以發布動態訊息並互動。

---

## 一、資料結構設計

### 1. 動態（Post）

```typescript
interface Post {
  id: string
  authorId: string              // 'user' 或 characterId
  authorName: string
  authorAvatar: string
  content: string               // 動態內容
  timestamp: number             // 發布時間戳

  // 觸發來源（用於 debug 和統計）
  triggerEvent?: PostTriggerEvent

  // 互動數據
  likes: PostLike[]             // 按讚列表
  comments: PostComment[]       // 留言列表（最多 48 則）
}

type PostTriggerEvent =
  | 'mood_change'           // 情緒改變
  | 'relationship_change'   // 關係等級變化
  | 'new_memory'            // 新的長期記憶
  | 'come_online'           // 角色上線
  | 'birthday'              // 生日
  | 'holiday'               // 特殊節日
  | 'random'                // 隨機發文
  | 'user_post'             // 使用者發文

interface PostLike {
  oderId: string              // 'user' 或 characterId
  timestamp: number
}

interface PostComment {
  id: string
  authorId: string            // 'user' 或 characterId
  authorName: string
  authorAvatar: string
  content: string
  timestamp: number
  replyTo?: string            // 回覆的樓層 ID（可選）
}
```

### 2. 通知（Notification）

```typescript
interface FeedNotification {
  id: string
  type: 'like' | 'comment' | 'mention'
  postId: string
  postPreview: string         // 動態內容預覽（前 30 字）
  actorId: string             // 觸發者 ID
  actorName: string
  actorAvatar: string
  timestamp: number
  read: boolean               // 是否已讀
}
```

---

## 二、Store 設計

### 新增 `src/stores/feed.ts`

```typescript
// State
posts: Post[]                     // 所有動態（最多 120 則）
notifications: FeedNotification[] // 通知列表（最多 50 則）
unreadCount: number              // 未讀通知數量
lastEventCheck: Record<string, number>  // 各事件類型最後檢查時間

// Actions
addPost(post)                    // 新增動態
deletePost(postId)               // 刪除動態
addLike(postId, oderId)        // 新增按讚
removeLike(postId, oderId)     // 移除按讚
addComment(postId, comment)      // 新增留言
deleteComment(postId, commentId) // 刪除留言
addNotification(notification)    // 新增通知
markNotificationRead(id)         // 標記通知已讀
markAllNotificationsRead()       // 標記全部已讀
clearOldPosts()                  // 清理舊動態

// Getters
sortedPosts                      // 按時間排序的動態
unreadNotifications              // 未讀通知
```

---

## 三、觸發機制設計

### 1. 事件觸發機率表

| 事件 | 觸發機率 | 冷卻時間 | 說明 |
|------|---------|---------|------|
| mood_change | 30% | 2 小時 | 情緒改變時 |
| relationship_change | 50% | 無 | 關係等級變化時（升級才觸發） |
| new_memory | 20% | 4 小時 | 新增長期記憶時 |
| come_online | 15% | 8 小時 | 角色從 offline 變成 online |
| birthday | 100% | 每年一次 | 角色生日當天 |
| holiday | 40% | 每節日一次 | 特殊節日 |
| random | 5% | 12 小時 | 定時檢查，隨機發文 |

### 2. 觸發時機整合點

**在 `App.vue` 的 `onMounted` 中：**
- 初始化動態牆監控服務
- 檢查角色上線事件

**在 `memoryService.ts` 中：**
- 新增長期記憶時觸發 `new_memory` 事件
- 情緒評估完成時觸發 `mood_change` 事件

**在 `relationshipsStore.ts` 中：**
- 關係等級升級時觸發 `relationship_change` 事件

**在 `chatHelpers.ts` 的作息監控中：**
- 角色上線時觸發 `come_online` 事件

---

## 四、AI 互動機制

### 1. 角色瀏覽動態牆

當角色「上線」時（根據作息系統），有機率瀏覽動態牆：
- 檢查是否有新動態（自上次檢查後）
- 根據與動態作者的關係決定是否按讚/留言
- 好感度越高，互動機率越高

### 2. AI 回應機率表

| 關係等級 | 按讚機率 | 留言機率 |
|---------|---------|---------|
| enemy | 0% | 0% |
| dislike | 5% | 0% |
| stranger | 10% | 0% |
| acquaintance | 30% | 10% |
| friend | 50% | 25% |
| close_friend | 70% | 40% |
| soulmate | 85% | 55% |

### 3. 內容生成

使用 Gemini API 生成：
- 動態內容：根據觸發事件 + 角色個性 + 記憶
- 留言內容：根據動態內容 + 角色與作者的關係

---

## 五、通知系統

### 1. 即時通知（Toast）

當使用者**不在動態牆頁面**時：
- 好友按讚使用者的動態 → Toast 通知
- 好友回覆使用者的動態/留言 → Toast 通知
- 好友 @ 使用者 → Toast 通知

### 2. 歷史通知（通知中心）

- 位置：動態牆 PageHeader 右上角的鈴鐺按鈕
- 功能：顯示所有通知，可標記已讀
- 最多保留 50 則通知

---

## 六、UI/UX 設計

### 1. 底部 Tab

在 `Index.vue` 新增第四個 Tab「動態」：
- 圖示：`Newspaper` 或 `Activity`（from lucide-vue-next）
- 路由：`/main/feed`

### 2. 動態牆頁面結構

```
┌─────────────────────────────────┐
│ PageHeader [動態牆]        🔔   │  ← 通知按鈕
├─────────────────────────────────┤
│ [發布動態輸入框]                │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 頭像  角色名稱    3分鐘前   │ │
│ │ 動態內容...                 │ │
│ │ ❤️ 3   💬 2                 │ │
│ │ ─────────────────────────── │ │
│ │ 留言列表...                 │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ...更多動態                 │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### 3. 通知面板

點擊鈴鐺按鈕後展開的下拉面板：
- 顯示未讀/已讀通知
- 點擊可跳轉到對應動態
- 「全部標為已讀」按鈕

---

## 七、資料保存策略

### 1. 數量限制

- 動態總數上限：**120 則**
- 每則動態留言上限：**48 則**
- 通知上限：**50 則**

### 2. 自動清理

當動態數量達到上限時：
1. 彈出提醒對話框
2. 提供匯出功能（JSON + Markdown）
3. 使用者確認後，保留最近 7 天的動態，刪除其餘

### 3. LocalStorage Key

```typescript
STORAGE_KEYS = {
  // ... 現有 keys
  FEED: 'ai-chat-feed'  // 動態牆資料
}
```

---

## 八、實作順序

### Phase 1：基礎架構（預計 3 個檔案）

1. **新增型別定義** - `src/types/index.ts`
   - Post, PostLike, PostComment, FeedNotification 型別

2. **新增常數** - `src/utils/constants.ts`
   - 動態牆相關限制常數
   - 事件觸發機率常數

3. **新增 Feed Store** - `src/stores/feed.ts`
   - 完整的 state/actions/getters

### Phase 2：UI 頁面（預計 3 個檔案）

4. **新增路由** - `src/router/index.ts`
   - 新增 `/main/feed` 路由

5. **修改底部導航** - `src/views/main/Index.vue`
   - 新增「動態」Tab

6. **新增動態牆頁面** - `src/views/main/Feed.vue`
   - 動態列表
   - 發布動態輸入框
   - 按讚/留言功能

### Phase 3：通知系統（預計 2 個檔案）

7. **新增通知面板元件** - `src/components/NotificationPanel.vue`
   - 通知列表
   - 標記已讀功能

8. **擴充 Toast** - `src/composables/useToast.ts`
   - 新增動態牆相關的 Toast 類型

### Phase 4：AI 服務層（預計 2 個檔案）

9. **新增動態牆服務** - `src/services/feedService.ts`
   - AI 生成動態內容
   - AI 生成留言內容
   - 事件觸發邏輯

10. **整合觸發點**
    - 修改 `memoryService.ts`（情緒/記憶變化）
    - 修改 `chatHelpers.ts`（作息監控）
    - 修改 `App.vue`（初始化）

### Phase 5：匯出功能（預計 1 個檔案）

11. **新增匯出功能** - `src/utils/feedExport.ts`
    - JSON 匯出
    - Markdown 匯出
    - 匯入功能

---

## 九、待確認事項

1. ✅ 動態數量上限：120 則
2. ✅ 留言數量上限：48 則
3. ✅ 底部新增第四個 Tab
4. ✅ 通知鈴鐺放在 PageHeader 右上角
5. ✅ 使用 Toast 即時通知

---

## 十、風險評估

1. **LocalStorage 容量**
   - 120 則動態 × 48 則留言 = 最壞情況約 5760 則留言
   - 預估每則約 500 bytes，總計約 2.8MB
   - LocalStorage 限制約 5MB，應該安全

2. **API 呼叫頻率**
   - AI 生成動態/留言會消耗 API 額度
   - 建議使用 `gemini-2.5-flash-lite` 降低成本
   - 設定合理的冷卻時間避免過度呼叫

3. **背景執行效能**
   - 定時檢查事件可能影響效能
   - 建議使用較長的檢查間隔（如 5 分鐘）
   - 僅在角色上線時才進行 AI 互動

---

*規劃完成，等待確認後開始實作。*
