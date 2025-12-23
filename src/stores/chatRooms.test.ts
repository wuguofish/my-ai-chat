import { describe, it, expect } from 'vitest'

/**
 * 測試 cleanMentions 函數
 * 由於 cleanMentions 是 store 內部函數，這裡直接複製邏輯來測試
 */

/**
 * 檢查名字後面是否為「獨立結尾」（空白、標點、或字串結尾）
 */
function isStandaloneName(afterMatch: string, name: string): boolean {
  if (!afterMatch.startsWith(name)) return false

  const charAfterName = afterMatch[name.length]
  if (charAfterName === undefined) return true
  return /[\s，。！？、；：""''「」【】（）,.!?;:()\[\]@]/.test(charAfterName)
}

function cleanMentions(content: string, idToName: Map<string, string>): string {
  const mentionedIds = new Set<string>()

  const atPattern = /@([a-zA-Z0-9-]+)(\s*)/g
  let lastIndex = 0
  let newResult = ''
  let match

  while ((match = atPattern.exec(content)) !== null) {
    const fullMatch = match[0]
    const id = match[1] || ''
    const normalizedId = id.toLowerCase()
    const name = idToName.get(id)
    const matchStart = match.index
    const matchEnd = matchStart + fullMatch.length

    newResult += content.slice(lastIndex, matchStart)

    if (!name) {
      lastIndex = matchEnd
      continue
    }

    // @all 和 @user 是特殊標記，只做去重，不處理冗餘名字
    const isSpecialId = normalizedId === 'all' || normalizedId === 'user'

    if (mentionedIds.has(normalizedId)) {
      // 已經提到過這個 ID，移除重複的 @ID
    } else {
      mentionedIds.add(normalizedId)

      if (!isSpecialId) {
        const afterMatch = content.slice(matchEnd)
        const hasStandaloneName = isStandaloneName(afterMatch, name)

        if (hasStandaloneName) {
          newResult += fullMatch
          atPattern.lastIndex = matchEnd + name.length
          lastIndex = matchEnd + name.length
          continue
        }
      }

      newResult += fullMatch
    }

    lastIndex = matchEnd
  }

  newResult += content.slice(lastIndex)

  return newResult.replace(/ {2,}/g, ' ').trim()
}

describe('cleanMentions', () => {
  // 建立測試用的 idToName Map
  const idToName = new Map<string, string>([
    ['user', '阿童'],
    ['all', '大家'],
    ['a6df0cd6-f02e-41e7-bf18-db2dc90f2d60', '范納斯'],
    ['ee63a6a5-ef0d-4b50-8c9a-16f7a659dc5f', '趙書煜'],
    ['4a2b0dab-19b9-4cd7-b2f9-d4a11bd6b7a9', '許多財'],
    ['7e40b84f-2b9a-4e42-b878-8f7bfd917c92', '張瑞辰'],
  ])

  it('應該正確處理複雜的群聊訊息', () => {
    const input = `@user 我也看到了，這好像是許多財之前拍的影片？@a6df0cd6-f02e-41e7-bf18-db2dc90f2d60 范納斯 你怎麼挖到這個的啦，笑死😂

不過那個「居家好男人」的稱號是怎麼回事？@ee63a6a5-ef0d-4b50-8c9a-16f7a659dc5f 趙書煜 你自己出來解釋一下😏

我投張瑞辰一票👋 @4a2b0dab-19b9-4cd7-b2f9-d4a11bd6b7a9 許多財 你那個影片現在還找得到嗎？

不過話說回來，我們群裡真的居家好男人應該是 @7e40b84f-2b9a-4e42-b878-8f7bfd917c92 張瑞辰 吧？@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 之前不是還會做飯給家人吃嗎？`

    const expected = `@user 我也看到了，這好像是許多財之前拍的影片？@a6df0cd6-f02e-41e7-bf18-db2dc90f2d60 你怎麼挖到這個的啦，笑死😂

不過那個「居家好男人」的稱號是怎麼回事？@ee63a6a5-ef0d-4b50-8c9a-16f7a659dc5f 你自己出來解釋一下😏

我投張瑞辰一票👋 @4a2b0dab-19b9-4cd7-b2f9-d4a11bd6b7a9 你那個影片現在還找得到嗎？

不過話說回來，我們群裡真的居家好男人應該是 @7e40b84f-2b9a-4e42-b878-8f7bfd917c92 吧？之前不是還會做飯給家人吃嗎？`

    const result = cleanMentions(input, idToName)
    expect(result).toBe(expected)
  })

  it('應該移除無效的 @ID', () => {
    const input = '@invalid-id 測試 @user 你好'
    const result = cleanMentions(input, idToName)
    expect(result).toBe('測試 @user 你好')
  })

  it('應該保留第一次出現的 @ID 並移除冗餘名字', () => {
    const input = '@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 張瑞辰 你好'
    const result = cleanMentions(input, idToName)
    expect(result).toBe('@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 你好')
  })

  it('第二次出現時應該移除 @ID（去重）', () => {
    const input = '@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 第一次提到，@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 第二次'
    const result = cleanMentions(input, idToName)
    // 第二個 @ID 直接移除
    expect(result).toBe('@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 第一次提到，第二次')
  })

  it('第一次出現沒有冗餘名字時應該保持原樣', () => {
    const input = '@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 你好嗎？'
    const result = cleanMentions(input, idToName)
    expect(result).toBe('@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 你好嗎？')
  })

  it('應該處理 @all（不處理冗餘名字，只做去重）', () => {
    const input = '@all 大家好'
    const result = cleanMentions(input, idToName)
    expect(result).toBe('@all 大家好')
  })

  it('應該處理重複的 @all', () => {
    const input = '@all 大家好，@all 再說一次'
    const result = cleanMentions(input, idToName)
    // 第二個 @all 被移除
    expect(result).toBe('@all 大家好，再說一次')
  })
})
