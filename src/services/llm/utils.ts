/**
 * LLM 服務層 - 共用工具函數
 */

/**
 * 法定成年年齡（大多數國家標準）
 */
export const LEGAL_ADULT_AGE = 18

/**
 * 解析年齡字串，回傳數字
 * 支援格式：「25」、「25歲」、「二十五」等
 * 無法解析或未填寫時回傳 null
 */
export function parseAge(ageStr?: string | number): number | null {
  // 防護：確保 ageStr 是字串
  if (ageStr === undefined || ageStr === null) {
    return null
  }

  // 如果是數字，直接驗證並回傳
  if (typeof ageStr === 'number') {
    return (!isNaN(ageStr) && ageStr > 0 && ageStr < 150) ? ageStr : null
  }

  // 確保是字串
  const safeStr = typeof ageStr === 'string' ? ageStr : String(ageStr)
  if (!safeStr.trim()) {
    return null
  }

  // 移除「歲」等後綴
  const cleaned = safeStr.trim().replace(/歲|岁|years?\s*old/gi, '').trim()

  // 嘗試直接解析數字
  const num = parseInt(cleaned, 10)
  if (!isNaN(num) && num > 0 && num < 150) {
    return num
  }

  return null
}

/**
 * 判斷是否為成年人對話情境
 * 只有當玩家和角色都是成年人時才回傳 true
 * 未填寫年齡一律視為未成年
 */
export function isAdultConversation(userAge?: string | number, characterAge?: string | number): boolean {
  const userAgeNum = parseAge(userAge)
  const charAgeNum = parseAge(characterAge)

  // 未填寫年齡 → 視為未成年
  if (userAgeNum === null || charAgeNum === null) {
    return false
  }

  // 雙方都必須 >= 18 歲
  return userAgeNum >= LEGAL_ADULT_AGE && charAgeNum >= LEGAL_ADULT_AGE
}

/**
 * 清理 AI 回應中可能的前綴文字
 * 只有當「整個訊息被單一引號包住」時才取引號內的文字
 * 避免誤判回覆中本身就包含多個引號的情況
 */
export function getActuallyContent(msg: string): string {
  // 防護性檢查：確保輸入是字符串
  if (typeof msg !== 'string') {
    return ''
  }
  let _msg = msg.trim()

  // 檢查是否整個訊息被引號包住（開頭是引號，結尾是引號）
  // 或者是「前綴文字「內容」」的格式（結尾是引號，且只有一對引號）
  const quotePairs: Array<[string, string]> = [['「', '」'], ['"', '"'], ['"', '"']]

  // 情況1：整個訊息被引號包住
  for (const [openQuote, closeQuote] of quotePairs) {
    if (_msg.startsWith(openQuote) && _msg.endsWith(closeQuote)) {
      // 確認中間沒有其他同類型的引號對（避免「A」B「C」這種情況）
      const inner = _msg.slice(1, -1)
      const hasNestedQuotes = inner.includes(openQuote) && inner.includes(closeQuote)
      if (!hasNestedQuotes) {
        return inner
      }
    }
  }

  // 情況2：前綴文字 + 引號包住的內容（例如「讓我想想...「實際內容」」）
  // 只有當訊息以引號結尾，且只有一對引號時才處理
  for (const [openQuote, closeQuote] of quotePairs) {
    if (_msg.endsWith(closeQuote)) {
      const openIndex = _msg.indexOf(openQuote)
      const closeIndex = _msg.lastIndexOf(closeQuote)

      // 確認有開始引號，且開始引號不在開頭（有前綴）
      if (openIndex > 0 && closeIndex > openIndex) {
        const quotedContent = _msg.slice(openIndex + 1, closeIndex)

        // 確認引號內沒有其他同類型的引號（表示這是唯一一對）
        if (!quotedContent.includes(openQuote) && !quotedContent.includes(closeQuote)) {
          // 額外確認：引號內的內容應該佔原文的大部分
          if (quotedContent.length >= _msg.length * 0.7) {
            return quotedContent
          }
        }
      }
    }
  }

  return _msg
}

/**
 * 清理 AI 濫用的引號（『』和「」）
 * AI 常常用引號來「強調」詞彙，但這不符合中文習慣且影響閱讀體驗
 * 這個函數會移除用於強調的引號，但保留用於引述的引號
 *
 * 判斷邏輯：
 * - 如果引號內的文字很短（≤10字）且不是完整句子 → 移除引號
 * - 如果引號內是完整的句子（有句號、問號等） → 保留引號
 * - 如果引號內超過 10 個字 → 保留引號（可能是引述）
 */
export function cleanExcessiveQuotes(text: string): string {
  // 輔助函數：判斷是否應該保留引號
  const shouldKeepQuotes = (content: string): boolean => {
    // 如果內容包含句號、問號、驚嘆號，可能是引述完整句子，保留
    if (/[。？！?!]/.test(content)) {
      return true
    }
    // 如果內容超過 10 個字，可能是引述，保留
    if (content.length > 10) {
      return true
    }
    return false
  }

  // 先處理『』（這個幾乎都是濫用）
  let result = text.replace(/『([^『』]+)』/g, (match, content) => {
    return shouldKeepQuotes(content) ? match : content
  })

  // 再處理「」，但要小心不要影響對話格式
  // 對話格式的「」通常在行首或 *動作* 之後
  // 我們只處理在句子中間、用於強調詞彙的「」
  result = result.replace(/「([^「」]+)」/g, (match, content, offset) => {
    // 檢查是否在行首（可能是對話）
    const beforeMatch = result.substring(0, offset)
    const lastNewline = beforeMatch.lastIndexOf('\n')
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1
    const textBeforeOnLine = result.substring(lineStart, offset).trim()

    // 如果這個「」在行首或 * 之後，可能是對話，保留
    if (textBeforeOnLine === '' || textBeforeOnLine.endsWith('*')) {
      return match
    }

    // 如果引號內容應該保留，保留
    if (shouldKeepQuotes(content)) {
      return match
    }

    // 否則移除引號
    return content
  })

  return result
}

/**
 * 被封鎖的 finishReason 類型
 */
export const BLOCKED_FINISH_REASONS = [
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SAFETY',
  'OTHER'  // 'OTHER' 有時也代表被封鎖
]

/**
 * 檢查錯誤是否為內容封鎖
 */
export function isBlockedError(error: any): boolean {
  if (error?.name === 'ContentBlockedError') {
    return true
  }
  const message = error?.message || ''
  return message.includes('PROHIBITED_CONTENT') ||
         message.includes('blocked') ||
         message.includes('SAFETY')
}

/**
 * 格式化錯誤訊息
 */
export function formatErrorMessage(error: any): string {
  const message = error?.message || ''

  // 內容被封鎖
  if (message.includes('PROHIBITED_CONTENT') ||
      message.includes('blocked') ||
      message.includes('BLOCKED_BY_SAFETY') ||
      message.includes('SAFETY')) {
    return '回應因違反內容政策而被封鎖。請嘗試調整對話內容、角色記憶或角色設定。'
  }

  // 空回應
  if (message === 'EMPTY_RESPONSE') {
    return 'AI 回應內容為空，請稍後再試。'
  }

  // Token 上限
  if (message === 'MAX_TOKENS_REACHED') {
    return 'AI 回應因達到 token 上限而被截斷。請到好友的「進階設定」中調高「最大輸出 Token 數」（建議 2048 以上）。'
  }

  // 額度用盡
  if (message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
    return 'API 額度已用盡，請稍後再試或檢查您的 API 配額。'
  }

  // API Key 無效
  if (message.includes('API_KEY_INVALID') || message.includes('invalid')) {
    return 'API Key 無效，請檢查您的設定。'
  }

  // 其他封鎖原因
  if (message.startsWith('BLOCKED:')) {
    const reason = message.replace('BLOCKED:', '').trim()
    return `AI 回應被封鎖（${reason}），請稍後再試或調整對話內容。`
  }

  // 未知錯誤
  return `無法取得 AI 回應：${message || '未知錯誤'}`
}
