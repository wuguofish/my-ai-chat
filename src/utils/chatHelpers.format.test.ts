import { describe, it, expect } from 'vitest'
import { formatMessageForDisplay } from './chatHelpers'
import type { Character } from '@/types'

const ID = '11111111-2222-3333-4444-555555555555'
const char = (name: string) => ({ id: ID, name }) as Character

describe('formatMessageForDisplay', () => {
  it('應跳脫訊息中的 HTML，避免被 v-html 渲染成標籤', () => {
    const result = formatMessageForDisplay('<img src=x onerror="alert(1)">', [])
    expect(result).not.toContain('<img')
    expect(result).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  })

  it('@提及、粗體、動作標記仍應正常轉換', () => {
    const result = formatMessageForDisplay(`@${ID} 你好 **重點** *揮手* @user @all`, [char('小明')], '阿童')
    expect(result).toBe(
      '<span class="tag-text">@小明</span> 你好 <b>重點</b> <i>揮手</i> ' +
      '<span class="tag-text">@阿童</span> <span class="tag-text">@all</span>'
    )
  })

  it('好友名稱與使用者暱稱中的 HTML 也應跳脫', () => {
    const result = formatMessageForDisplay(`@${ID} @user`, [char('<b onmouseover=x>壞</b>')], '<script>')
    expect(result).not.toContain('<b onmouseover')
    expect(result).not.toContain('<script>')
    expect(result).toContain('@&lt;b onmouseover=x&gt;壞&lt;/b&gt;')
    expect(result).toContain('@&lt;script&gt;')
  })

  it('名稱裡的 $ 不應被當成替換樣式', () => {
    const result = formatMessageForDisplay(`嗨 @${ID}`, [char('A$&B$`C')], '$1')
    expect(result).toContain('@A$&amp;B$`C')
    expect(formatMessageForDisplay('@user', [], '$1')).toBe('<span class="tag-text">@$1</span>')
  })
})
