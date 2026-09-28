/**
 * 動態牆內容防護工具
 * - 偵測 LLM 產生的異常輸出（例如「*A *A」這種碎片或無限重複）
 * - 跳脫 HTML，讓內容可以安全地透過 v-html 顯示
 */

/**
 * 跳脫 HTML 特殊字元
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 有意義的字元：文字（含中日韓）與數字 */
const MEANINGFUL_CHAR = /[\p{L}\p{N}]/gu

/** 中日韓文字 */
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/**
 * 常見的 markdown / 標記符號（LLM 壞掉時常吐出一堆）
 * 不含 ~ 和 ^，這兩個在口語（「好開心~~」）和顏文字（^_^）裡很常見
 */
const MARKUP_CHAR = /[*#_`|\\<>[\]{}=]/g

/** 連續重複片段：同一段文字（至少 4 字）連續出現 3 次以上 */
const REPEATED_FRAGMENT = /(.{4,}?)\1{2,}/gsu

export interface DegenerateCheckOptions {
  /** 至少需要多少個有意義的字元（文字或數字） */
  minMeaningfulChars: number
}

/**
 * 判斷 LLM 產生的動態/留言是否為異常輸出
 * @returns 異常原因；正常則回傳 null
 */
export function detectDegenerateContent(
  content: string,
  options: DegenerateCheckOptions
): string | null {
  const text = content.trim()
  if (!text) return '空內容'

  const meaningfulCount = text.match(MEANINGFUL_CHAR)?.length ?? 0
  if (meaningfulCount < options.minMeaningfulChars) {
    return `有效字數不足（${meaningfulCount}）`
  }

  // 標記符號比文字還多，例如「*A *A」
  // 有中文時放寬一點，避免把「好想睡 >_<」這類顏文字誤判
  const markupCount = text.match(MARKUP_CHAR)?.length ?? 0
  const hasCjk = CJK_CHAR.test(text)
  if (hasCjk ? markupCount > meaningfulCount : markupCount >= meaningfulCount) {
    return '符號過多'
  }

  // 模型陷入重複迴圈（排除「哈哈哈哈」這種單一字元的正常情緒表達）
  for (const match of text.matchAll(REPEATED_FRAGMENT)) {
    if (new Set(match[1]).size >= 2) {
      return '內容重複'
    }
  }

  return null
}
