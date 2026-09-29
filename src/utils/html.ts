/**
 * HTML 相關工具
 */

/**
 * 跳脫 HTML 特殊字元，讓文字可以安全地透過 v-html 顯示
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
