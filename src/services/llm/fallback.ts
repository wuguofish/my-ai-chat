/**
 * 背景任務的內容被服務商擋下時，換下一家服務商的順序
 */

import type { LLMProvider } from './types'

/**
 * 依使用者偏好排出可用的服務商。
 * 使用者還沒排過的服務商（例如後來才填 key 的）接在最後，維持 available 原本的順序。
 *
 * @param preferredOrder 使用者設定的順序
 * @param available 已實作而且有 API Key 的服務商
 */
export function orderFallbackProviders(
  preferredOrder: LLMProvider[],
  available: LLMProvider[]
): LLMProvider[] {
  const preferred = preferredOrder.filter(provider => available.includes(provider))
  const unranked = available.filter(provider => !preferred.includes(provider))
  return [...preferred, ...unranked]
}
