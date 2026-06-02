import { describe, it, expect } from 'vitest'
import { getActuallyContent } from './llm/utils'

describe('getActuallyContent', () => {
  // 情況1：整個訊息被引號包住
  describe('整個訊息被引號包住', () => {
    it('應該移除外層的「」引號', () => {
      const input = '「這是完整的內容」'
      expect(getActuallyContent(input)).toBe('這是完整的內容')
    })

    it('應該移除外層的 "" 引號', () => {
      const input = '"This is the content"'
      expect(getActuallyContent(input)).toBe('This is the content')
    })

    it('應該處理有前後空白的情況', () => {
      const input = '  「這是完整的內容」  '
      expect(getActuallyContent(input)).toBe('這是完整的內容')
    })
  })

  // 情況2：前綴文字 + 引號包住的內容
  // 注意：引號內容需佔總長度 70% 以上才會被處理
  describe('前綴文字 + 引號內容', () => {
    it('應該取出引號內的內容（前綴 + 單一引號對，佔比 > 70%）', () => {
      // 引號內容長度: 25, 總長度: 31, 佔比約 80.6% > 70%
      const input = '讓我想想...「這是實際的回覆內容，應該才是真正要被完整取出來的部分喔」'
      expect(getActuallyContent(input)).toBe('這是實際的回覆內容，應該才是真正要被完整取出來的部分喔')
    })

    it('應該取出引號內的內容（短前綴）', () => {
      const input = '嗯「這是回覆內容這是回覆內容」'
      expect(getActuallyContent(input)).toBe('這是回覆內容這是回覆內容')
    })
  })

  // 情況3：內容中有多個引號 - 不應該處理
  describe('多個引號的情況（不應處理）', () => {
    it('不應處理含有多個引號對的文字', () => {
      const input = '林佳慧分享了「居家好男人」的貼文，引起趙書煜誤以為是在稱讚自己，並與林敬妍、陳婉婷等人打趣討論人設。隨後阿童和林佳慧、林敬妍等人繼續追問「居家好男人」的真實身份，氣氛輕鬆幽默。'
      expect(getActuallyContent(input)).toBe(input)
    })

    it('不應處理「A」B「C」這種格式', () => {
      const input = '「早安」今天天氣真好「晚安」'
      expect(getActuallyContent(input)).toBe(input)
    })

    it('不應處理引號在中間的一般對話', () => {
      const input = '他說「你好」然後就走了'
      expect(getActuallyContent(input)).toBe(input)
    })
  })

  // 情況4：沒有引號 - 直接返回
  describe('沒有引號', () => {
    it('應該直接返回原文', () => {
      const input = '這是一段普通的文字，沒有引號'
      expect(getActuallyContent(input)).toBe(input)
    })

    it('應該處理空白並返回', () => {
      const input = '  這是一段普通的文字  '
      expect(getActuallyContent(input)).toBe(input.trim())
    })
  })

  // 情況5：引號內容太短（不符合 70% 門檻）
  describe('引號內容比例不足', () => {
    it('引號內容太短時不應處理', () => {
      const input = '這是很長很長的前綴文字，後面才有「短」'
      expect(getActuallyContent(input)).toBe(input)
    })
  })

  // 邊界情況
  describe('邊界情況', () => {
    it('應該處理空字串', () => {
      expect(getActuallyContent('')).toBe('')
    })

    it('應該處理只有引號的情況', () => {
      expect(getActuallyContent('「」')).toBe('')
    })

    it('應該處理換行符號', () => {
      const input = '\n\n「這是內容」\n'
      expect(getActuallyContent(input)).toBe('這是內容')
    })
  })
})
