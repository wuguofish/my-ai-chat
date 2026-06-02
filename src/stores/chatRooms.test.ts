import { describe, it, expect } from 'vitest'

/**
 * 測試 cleanMentions 函數
 * 由於 cleanMentions 是 store 內部函數，這裡直接複製邏輯來測試
 */

/**
 * 清理訊息中的 @ 提及
 * - 第一次提到：`@ID 名字` 或 `@ID名字` 或 `@ID` → `@ID`（保留 @ID，移除冗餘名字）
 * - 第二次以後：`@ID 名字` 或 `@ID名字` 或 `@ID` → `名字`（替換成純名字）
 * - 無效的 @ID：直接移除
 * - @all：特殊處理，不移除冗餘名字
 */
function cleanMentions(content: string, idToName: Map<string, string>): string {
  // 收集所有有效的 ID（小寫形式）
  const validIds = new Set<string>()
  for (const id of idToName.keys()) {
    validIds.add(id.toLowerCase())
  }

  let result = content

  for (const [id, name] of idToName) {
    const isSpecialId = id.toLowerCase() === 'all'
    const atId = `@${id}`

    // 找第一次出現 @ID 的位置
    const firstIdx = result.indexOf(atId)
    if (firstIdx === -1) continue // 這個 ID 沒出現過

    // 切出第一次 @ID 之後的部分
    let afterFirst = result.substring(firstIdx + atId.length)

    // 處理第一次出現：移除冗餘的名字（如果有的話）
    // @all 特殊處理：不移除第一次的冗餘名字
    if (!isSpecialId) {
      const trimmedAfter = afterFirst.trimStart()
      if (trimmedAfter.startsWith(name)) {
        // 開頭是名字，移除它
        afterFirst = trimmedAfter.substring(name.length)
      }
    }

    // 對剩下的部分做簡單取代（第二次以後的 @ID 都換成名字）
    // 注意：要先處理有名字的情況，再處理純 @ID
    if (!isSpecialId) {
      afterFirst = afterFirst.split(`${atId} ${name}`).join(name)
      afterFirst = afterFirst.split(`${atId}${name}`).join(name)
      afterFirst = afterFirst.split(atId).join(name)
    } else {
      // @all 特殊處理：第二次以後的 @all 大家 換成 大家
      afterFirst = afterFirst.split(`${atId} ${name}`).join(name)
      afterFirst = afterFirst.split(`${atId}${name}`).join(name)
      afterFirst = afterFirst.split(atId).join(name)
    }

    // 拼回去：前面的部分 + @ID + 空白 + 處理過的後半部分
    // 如果原本 @ID 後面沒有任何內容就不加空白
    const prefix = result.substring(0, firstIdx)
    if (afterFirst.length > 0 && !afterFirst.startsWith(' ')) {
      result = `${prefix}${atId} ${afterFirst}`
    } else {
      result = `${prefix}${atId}${afterFirst}`
    }
  }

  // 移除無效的 @ID（UUID 格式但不在 validIds 中的）
  result = result.replace(/@([a-f0-9-]{36})/gi, (match, uuid) => {
    return validIds.has(uuid.toLowerCase()) ? match : ''
  })

  // 清理多餘空白
  return result.replace(/ {2,}/g, ' ').trim()
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
    ['ee63a6a5-f818-48b0-aaea-4f93a2ae8166', '林佳慧'],
  ])

  it('應該移除無效的 @ID', () => {
    const input = '@aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee 測試 @user 你好'
    const result = cleanMentions(input, idToName)
    expect(result).toBe('測試 @user 你好')
  })

  it('應該保留第一次出現的 @ID 並移除冗餘名字', () => {
    const input = '@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 張瑞辰 你好'
    const result = cleanMentions(input, idToName)
    expect(result).toBe('@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 你好')
  })

  it('第二次出現時應該替換成名字', () => {
    const input = '@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 張瑞辰 第一次提到，@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 第二次'
    const result = cleanMentions(input, idToName)
    expect(result).toBe('@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 第一次提到，張瑞辰 第二次')
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
    const input = '@all 大家好，@all 大家再說一次'
    const result = cleanMentions(input, idToName)
    // 第二個 @all 大家 被替換成 大家
    expect(result).toBe('@all 大家好，大家再說一次')
  })

  // @user 測試
  it('應該移除 @user 後面的冗餘使用者名字', () => {
    const input = '@user 阿童的異想天開'
    const result = cleanMentions(input, idToName)
    expect(result).toBe('@user 的異想天開')
  })

  it('應該移除 @user 後面的冗餘使用者名字（有空白）', () => {
    const input = '聽著@user 阿童的異想天開'
    const result = cleanMentions(input, idToName)
    expect(result).toBe('聽著@user 的異想天開')
  })

  it('應該處理複雜的群聊訊息（包含 @user 和多個角色）', () => {
    const input = `*林佳慧聽著@user 阿童的異想天開，和@ee63a6a5-f818-48b0-aaea-4f93a2ae8166 林佳慧的浮誇附和*`
    const expected = `*林佳慧聽著@user 的異想天開，和@ee63a6a5-f818-48b0-aaea-4f93a2ae8166 的浮誇附和*`
    const result = cleanMentions(input, idToName)
    expect(result).toBe(expected)
  })

  // 測試複雜情境
  it('應該正確處理複雜的群聊訊息', () => {
    const input = `@user 我也看到了，這好像是許多財之前拍的影片？@a6df0cd6-f02e-41e7-bf18-db2dc90f2d60 范納斯 你怎麼挖到這個的啦，笑死😂

不過那個「居家好男人」的稱號是怎麼回事？@ee63a6a5-ef0d-4b50-8c9a-16f7a659dc5f 趙書煜 你自己出來解釋一下😏

我投張瑞辰一票👋 @4a2b0dab-19b9-4cd7-b2f9-d4a11bd6b7a9 許多財 你那個影片現在還找得到嗎？

不過話說回來，我們群裡真的居家好男人應該是 @7e40b84f-2b9a-4e42-b878-8f7bfd917c92 張瑞辰 吧？@7e40b84f-2b9a-4e42-b878-8f7bfd917c92 之前不是還會做飯給家人吃嗎？`

    const expected = `@user 我也看到了，這好像是許多財之前拍的影片？@a6df0cd6-f02e-41e7-bf18-db2dc90f2d60 你怎麼挖到這個的啦，笑死😂

不過那個「居家好男人」的稱號是怎麼回事？@ee63a6a5-ef0d-4b50-8c9a-16f7a659dc5f 你自己出來解釋一下😏

我投張瑞辰一票👋 @4a2b0dab-19b9-4cd7-b2f9-d4a11bd6b7a9 你那個影片現在還找得到嗎？

不過話說回來，我們群裡真的居家好男人應該是 @7e40b84f-2b9a-4e42-b878-8f7bfd917c92 吧？張瑞辰 之前不是還會做飯給家人吃嗎？`

    const result = cleanMentions(input, idToName)
    expect(result).toBe(expected)
  })
})
