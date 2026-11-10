import { describe, it, expect } from 'vitest'
import { stripThinkTags } from './utils'

describe('stripThinkTags', () => {
  it('移除開頭的 <think> 區塊，保留後面的回覆', () => {
    const text = '<think>\nRespond naturally.\nAffinity: 1530 → maybe 1532.\n</think>*抬頭看向手機*\n\n在在在，我在。\n\n1532'
    expect(stripThinkTags(text)).toBe('*抬頭看向手機*\n\n在在在，我在。\n\n1532')
  })

  it('<thinking> 也會移除', () => {
    expect(stripThinkTags('<thinking>想一下</thinking>好喔')).toBe('好喔')
  })

  it('沒有結尾標籤時不處理', () => {
    expect(stripThinkTags('<think>我在想事情')).toBe('<think>我在想事情')
  })

  it('一般回覆不受影響', () => {
    expect(stripThinkTags('*推眼鏡*\n\n在啊。')).toBe('*推眼鏡*\n\n在啊。')
  })
})
