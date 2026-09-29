import { describe, it, expect } from 'vitest'
import { escapeHtml } from './html'

describe('escapeHtml', () => {
  it('應跳脫 HTML 特殊字元', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">&\'')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;'
    )
  })

  it('一般文字不應改變', () => {
    expect(escapeHtml('早安 @小明 回#3：好喔')).toBe('早安 @小明 回#3：好喔')
  })
})
