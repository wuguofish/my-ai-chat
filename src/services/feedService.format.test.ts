import { describe, it, expect } from 'vitest'
import type { Character } from '@/types'
import { formatFeedContentForDisplay } from './feedService'

const chars = [{ id: 'c1', name: '小明' }] as Character[]

describe('formatFeedContentForDisplay', () => {
  it('應跳脫內容中的 HTML，避免被 v-html 渲染成標籤', () => {
    const result = formatFeedContentForDisplay('<b>嗨</b><img src=x onerror=alert(1)>', chars, '我')
    expect(result).not.toContain('<b>')
    expect(result).not.toContain('<img')
    expect(result).toContain('&lt;b&gt;嗨&lt;/b&gt;')
  })

  it('跳脫後仍應正確產生 mention 與樓層連結', () => {
    const result = formatFeedContentForDisplay('回#3：@小明 你看 @user', chars, '我')
    expect(result).toContain('<span class="reply-floor-link" data-floor="3">#3</span>')
    expect(result).toContain('<span class="mention">@小明</span>')
    expect(result).toContain('<span class="mention mention-me">@我</span>')
  })
})
