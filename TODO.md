# 愛聊天 AI Chat - 待開發功能

## 待實作功能

### 狀態訊息 mood 參數實作

**目前狀態：** 預留設計，尚未實作

**功能描述：**
`generateStatusMessage` 函數已預留 `mood` 參數，用於根據角色心情生成更符合情境的狀態訊息。

**現有介面：**
```typescript
interface StatusMessageContext {
  shortTermMemories?: Array<{ content: string }>
  mood?: string  // 心情描述（例如：開心、煩躁）← 尚未使用
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
}
```

**可能的 mood 來源：**

1. **從好感度變化趨勢計算**
   - 追蹤最近幾次好感度變化的數值
   - 計算趨勢（上升/下降/平穩）
   - 轉換為心情描述：
     - 持續上升 → "開心"、"雀躍"
     - 持續下降 → "有點失落"、"煩躁"
     - 平穩 → 不傳入 mood，讓 AI 自由發揮

2. **從特定事件觸發**
   - 被 @ 提及後沒有回應 → "被冷落"
   - 生日當天 → "期待"
   - 長時間沒對話 → "無聊"、"想念"

3. **從對話內容推斷**（較複雜）
   - 分析最近訊息中的情緒詞彙
   - 需要額外的 LLM 呼叫或情緒分析

**建議實作方式：**
在 `relationships.ts` 的 `updateAffection` 中記錄好感度變化歷史，然後在生成狀態訊息時計算趨勢。

**預估工作量：** 2-3 小時

---

**最後更新：** 2025-12-08
