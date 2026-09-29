import { describe, it, expect } from 'vitest'
import { detectDegenerateContent, escapeHtml } from './feedContentGuard'

const post = { minMeaningfulChars: 10 }
const comment = { minMeaningfulChars: 2 }

describe('detectDegenerateContent', () => {
  it('正常的動態不應被判定為異常', () => {
    expect(detectDegenerateContent('今天終於把報告寫完了！晚上要去吃火鍋慶祝一下 🍲 超讚的', post)).toBeNull()
  })

  it('正常的短留言不應被判定為異常', () => {
    expect(detectDegenerateContent('好棒喔 👍', comment)).toBeNull()
    expect(detectDegenerateContent('哈哈哈哈哈哈哈哈哈哈哈哈哈哈 笑死', comment)).toBeNull()
    expect(detectDegenerateContent('好開心~~~ ^_^ 明天見', comment)).toBeNull()
    expect(detectDegenerateContent('好想睡 >_<', comment)).toBeNull()
  })

  it('空內容應判定為異常', () => {
    expect(detectDegenerateContent('   ', comment)).not.toBeNull()
  })

  it('「*A *A」這種碎片應判定為異常（issue #22）', () => {
    expect(detectDegenerateContent('*A *A', post)).not.toBeNull()
    expect(detectDegenerateContent('*A *A', comment)).not.toBeNull()
  })

  it('有效字數不足的動態應判定為異常', () => {
    expect(detectDegenerateContent('好 😂😂😂', post)).not.toBeNull()
  })

  it('符號比文字多應判定為異常', () => {
    expect(detectDegenerateContent('** ## __ ** 嗯嗯', comment)).not.toBeNull()
  })

  it('陷入重複迴圈的內容應判定為異常', () => {
    const looped = '今天天氣很好。' + '我好想你我好想你'.repeat(5)
    expect(detectDegenerateContent(looped, post)).not.toBeNull()
  })

  it('單一字元重複（情緒表達）不應被當成迴圈', () => {
    expect(detectDegenerateContent('今天終於拿到期待很久的演唱會門票了！！！！！！！！！！！！', post)).toBeNull()
  })

  it('短詞、emoji、空白分隔的情緒重複不應被當成迴圈', () => {
    expect(detectDegenerateContent('太棒了👍🏻👍🏻👍🏻👍🏻👍🏻👍🏻', comment)).toBeNull()
    expect(detectDegenerateContent('好耶好耶好耶好耶好耶好耶', comment)).toBeNull()
    expect(detectDegenerateContent('嗚嗚嗚嗚 嗚嗚嗚嗚 嗚嗚嗚嗚 想哭', comment)).toBeNull()
  })

  it('長文中少量刻意重複的句子不應被當成迴圈', () => {
    const text = '今天去看了期待已久的電影，劇情非常精彩，尤其是最後的反轉讓人印象深刻。' +
      '好好看好好看好好看！下次還想再和朋友一起去電影院看續集，希望不要等太久。'
    expect(detectDegenerateContent(text, post)).toBeNull()
  })
})

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
