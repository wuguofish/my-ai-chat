/**
 * 記憶管理服務
 */

import { getDefaultAdapter, isAdultConversation, getActuallyContent } from '@/services/llm'
import type { Message, Memory, Character, CharacterRelationType, Post } from '@/types'

/**
 * 記憶生成的年齡資訊
 */
export interface AgeContext {
  userAge?: string
  characterAge?: string
}

/**
 * 長期記憶提取的上下文資訊
 */
export interface LongTermMemoryContext extends AgeContext {
  characterId?: string       // 角色 ID（用於取得關係資訊）
  characterName?: string     // 角色名稱
}

/**
 * LLM 評估的關係結果
 */
export interface RelationshipEvaluation {
  fromId: string
  toId: string
  type: CharacterRelationType
  state: string
}

/**
 * 記憶摘要結果（包含角色情緒）
 */
export interface MemorySummaryResult {
  summary: string
  mood?: string  // 角色當前情緒（私聊時評估）
}

/**
 * 群聊關係評估結果（包含角色情緒）
 */
export interface RelationshipEvaluationResult {
  relationships: RelationshipEvaluation[]
  moods: { [characterId: string]: string }  // 每個角色的情緒狀態
}

/**
 * 從最近對話生成短期記憶摘要（基礎版，不含情緒評估）
 */
export async function generateMemorySummary(
  messages: Message[],
  ageContext?: AgeContext
): Promise<string> {
  try {
    const isAdult = isAdultConversation(ageContext?.userAge, ageContext?.characterAge)

    // 系統指令：定義 AI 的角色和任務
    // 使用「小說創作分析」的框架，降低被誤判為真實情境的機率
    const systemInstruction = `你是一個小說創作輔助系統，專門整理虛構故事的劇情摘要。

這是一個${isAdult ? '面向成人讀者的' : ''}互動式小說創作平台。以下對話是作者創作的虛構劇情片段，所有角色、事件、關係都是文學創作的一部分。

你的任務是以編輯的角度，整理這段劇情的重點摘要。${isAdult ? '作為成人向作品，故事中的角色皆已成年，故事可能包含複雜的情感或親密互動，請如實記錄。' : ''}

請用 1-2 句話總結劇情的重點，包括：
- 關鍵事件或話題
- 重要的情緒或態度變化
- 任何需要記住的具體資訊（時間、地點、人物等）

只輸出摘要內容，不要加任何前綴或說明。`

    // 格式化對話內容
    const conversation = messages
      .map(m => `${m.senderName}: ${m.content}`)
      .join('\n')

    // 使用者輸入：要分析的對話
    const prompt = `對話內容：
${conversation}`

    // 透過 LLM adapter 發送請求
    const adapter = await getDefaultAdapter()
    const response = await adapter.generate(
      [{ role: 'user', content: prompt }],
      {
        modelType: 'lite',
        systemInstruction,
        temperature: 0.3,  // 較低溫度，確保摘要穩定
        maxOutputTokens: 2048,
        safeMode: !isAdult,
        queueDescription: '短期記憶摘要'
      }
    )

    // 檢查是否被封鎖或為空回應
    if (response.blocked || !response.text) {
      console.warn('記憶摘要為空或被封鎖:', { blocked: response.blocked, blockReason: response.blockReason })
      throw new Error(`記憶摘要生成失敗: ${response.blockReason || '空回應'}`)
    }

    return response.text
  } catch (error) {
    console.error('生成記憶摘要失敗:', error)
    throw new Error('無法生成記憶摘要')
  }
}

/**
 * 從最近對話生成短期記憶摘要（私聊版，包含情緒評估）
 * 一次 API 呼叫同時取得摘要和角色情緒
 */
export async function generateMemorySummaryWithMood(
  messages: Message[],
  character: Character,
  ageContext?: AgeContext
): Promise<MemorySummaryResult> {
  try {
    const isAdult = isAdultConversation(ageContext?.userAge, ageContext?.characterAge)

    // 系統指令：整合摘要生成和情緒評估
    const systemInstruction = `你是一個小說創作輔助系統，專門整理虛構故事的劇情摘要並分析角色情緒。

這是一個${isAdult ? '面向成人讀者的' : ''}互動式小說創作平台。以下對話是作者創作的虛構劇情片段，所有角色、事件、關係都是文學創作的一部分。

你的任務是以編輯的角度：
1. 整理這段劇情的重點摘要（1-2 句話）
2. 分析角色「${character.name}」在這段對話結束時的情緒狀態

${isAdult ? '作為成人向作品，故事中的角色皆已成年，故事可能包含複雜的情感或親密互動，請如實記錄。' : ''}

請以 JSON 格式回應：
{
  "summary": "劇情摘要（1-2 句話，包含關鍵事件、情緒變化、重要資訊）",
  "mood": "角色當前情緒（2-4 個字，例如：開心、有點煩躁、期待、平靜、害羞）"
}

如果無法判斷情緒，mood 可以設為 null。`

    // 格式化對話內容
    const conversation = messages
      .map(m => `${m.senderName}: ${m.content}`)
      .join('\n')

    // 角色資訊
    const characterInfo = `角色名稱：${character.name}
性格：${character.personality || '無描述'}`

    const prompt = `${characterInfo}

對話內容：
${conversation}

請分析並回傳 JSON：`

    // 透過 LLM adapter 發送請求（使用 responseMimeType 強制 JSON 輸出）
    const adapter = await getDefaultAdapter()
    const response = await adapter.generate(
      [{ role: 'user', content: prompt }],
      {
        modelType: 'lite',
        systemInstruction,
        temperature: 0.3,
        maxOutputTokens: 2048,
        safeMode: !isAdult,
        responseMimeType: 'application/json',
        queueDescription: '短期記憶摘要（含情緒）'
      }
    )

    // 檢查是否被封鎖或為空回應
    if (response.blocked || !response.text) {
      console.warn('記憶摘要為空或被封鎖:', { blocked: response.blocked, blockReason: response.blockReason })
      throw new Error(`記憶摘要生成失敗: ${response.blockReason || '空回應'}`)
    }

    // 解析 JSON 回應
    const parsed = JSON.parse(response.text)

    return {
      summary: getActuallyContent(parsed.summary || ''),
      mood: getActuallyContent(parsed.mood) || undefined
    }
  } catch (error) {
    console.error('生成記憶摘要（含情緒）失敗:', error)
    // 降級：只回傳基本摘要
    const summary = await generateMemorySummary(messages, ageContext)
    return { summary }
  }
}

/**
 * 從 6 筆短期記憶中提取重要資訊，升級為長期記憶
 * @returns 提取出的長期記憶列表（可能是空陣列）
 */
export async function extractLongTermMemories(
  shortTermMemories: Memory[],
  context?: LongTermMemoryContext
): Promise<string[]> {
  try {
    const isAdult = isAdultConversation(context?.userAge, context?.characterAge)

    // 動態載入相關 stores（避免循環依賴）
    const { useUserStore } = await import('@/stores/user')
    const { useCharacterStore } = await import('@/stores/characters')
    const { useRelationshipsStore } = await import('@/stores/relationships')
    const { getRelationshipLevelName, getCharacterRelationshipTypeText } = await import('@/utils/relationshipHelpers')

    const userStore = useUserStore()
    const characterStore = useCharacterStore()
    const relationshipsStore = useRelationshipsStore()
    const user = userStore.profile

    // 組裝人物資訊（使用者 + 角色認識的其他人）
    let peopleContext = ''
    if (context?.characterId && context?.characterName) {
      const knownPeople: string[] = []

      // 加入記憶所屬的角色
      knownPeople.push(`- ${context.characterName}：記憶的主人`)

      // 加入使用者
      if (user) {
        const userRelationship = relationshipsStore.getUserCharacterRelationship(context.characterId)
        const userName = user.nickname + (user.realName ? `（${user.realName}）` : '')
        const relName = userRelationship
          ? getRelationshipLevelName(userRelationship.level, userRelationship.isRomantic)
          : '認識的人'
        knownPeople.push(`- ${userName}：${relName}`)
      }

      // 加入其他角色（角色認識的人，只加入非 neutral 的關係）
      const charRelationships = relationshipsStore.getCharacterRelationships(context.characterId)
        .filter(rel => rel.fromCharacterId === context.characterId && rel.relationshipType !== 'neutral')

      for (const rel of charRelationships) {
        const otherChar = characterStore.getCharacterById(rel.toCharacterId)
        if (otherChar) {
          const relDesc = rel.description || getCharacterRelationshipTypeText(rel.relationshipType)
          knownPeople.push(`- ${otherChar.name}：${relDesc}`)
        }
      }

      if (knownPeople.length > 0) {
        peopleContext = `\n\n## 故事中的人物\n${knownPeople.join('\n')}`
      }
    }

    // 系統指令：定義 AI 的角色和任務
    // 使用「小說創作分析」的框架，降低被誤判為真實情境的機率
    const systemInstruction = `你是一個小說創作輔助系統，專門從劇情摘要中提取重要的角色設定和劇情線索。

這是一個${isAdult ? '面向成人讀者的' : ''}互動式小說創作平台。以下記憶內容是作者創作的虛構劇情摘要，所有角色、事件、關係都是文學創作的一部分。

你的任務是以編輯的角度，提取需要長期記住的重要資訊。${isAdult ? '作為成人向作品，故事中的角色皆已成年，且可能包含複雜的情感或親密互動，請如實記錄。' : ''}${peopleContext}

請提取以下類型的重要資訊：
1. 角色的個人資訊（生日、喜好、職業、重要經歷等）
2. 重要的承諾或約定
3. 關鍵事件的轉折點
4. 需要長期記住的特殊偏好或習慣

輸出格式：
- 每條長期記憶用一行
- 如果沒有需要保存的重要資訊，直接輸出「無」
- 每條記憶要簡潔明確，不超過 30 字
- 只輸出記憶內容，不要編號或前綴

範例輸出：
主角的生日是 5 月 20 日
主角喜歡喝拿鐵咖啡，不加糖
主角計劃下個月去日本旅遊`

    // 格式化短期記憶
    const memoriesText = shortTermMemories
      .map((m, i) => `${i + 1}. ${m.content}`)
      .join('\n')

    // 使用者輸入：要分析的短期記憶
    const prompt = `短期記憶：
${memoriesText}

請開始分析：`

    // 透過 LLM adapter 發送請求
    const adapter = await getDefaultAdapter()
    const response = await adapter.generate(
      [{ role: 'user', content: prompt }],
      {
        modelType: 'lite',
        systemInstruction,
        temperature: 0.3,
        maxOutputTokens: 2048,
        safeMode: !isAdult,
        queueDescription: '長期記憶提取'
      }
    )

    // 檢查是否被封鎖或為空回應
    if (response.blocked) {
      console.warn('長期記憶提取被封鎖:', { blockReason: response.blockReason })
      throw new Error(`長期記憶提取失敗: ${response.blockReason}`)
    }

    const responseText = response.text.trim()

    // 如果沒有內容，當作沒有需要提取的記憶
    if (!responseText) {
      return []
    }

    // 如果回應是「無」，返回空陣列
    if (responseText === '無' || responseText.toLowerCase() === 'none') {
      return []
    }

    // 分割成多條記憶
    const memories = responseText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line !== '無')

    return memories
  } catch (error) {
    console.error('提取長期記憶失敗:', error)
    throw new Error('無法提取長期記憶')
  }
}

/**
 * 生成動態牆貼文的摘要
 * 用於將超過 36 小時的貼文互動整理成記憶，存入參與者的短期記憶
 * @param post 要摘要的貼文
 * @param userAge 使用者年齡（用於安全模式判斷）
 * @returns 貼文摘要（1-2 句話）
 */
export async function generatePostSummary(
  post: Post,
  userAge?: string
): Promise<string> {
  try {
    const isAdult = isAdultConversation(userAge, '18')

    const systemInstruction = `你是一個社群媒體摘要系統，專門整理動態貼文和留言互動。

這是一個${isAdult ? '面向成人的' : ''}虛擬社群平台。以下是一則動態貼文及其互動內容。

你的任務是用 1-2 句話總結這則動態發生了什麼事，包括：
- 原 PO 發了什麼內容
- 主要的留言互動和討論
- 重要的情緒或關係變化

請用第三人稱客觀描述，例如：
「小明分享了去日本旅遊的照片，小華表示也想去，兩人約定下次一起出遊」

只輸出摘要內容，不要加任何前綴或說明。`

    // 格式化貼文內容
    let postContent = `【原 PO】${post.authorName}：${post.content}`

    // 加入留言（如果有）
    if (post.comments.length > 0) {
      const commentsText = post.comments
        .map(c => {
          let commentLine = `${c.authorName}：${c.content}`
          if (c.replyToFloors && c.replyToFloors.length > 0) {
            commentLine = `${c.authorName}（回覆 #${c.replyToFloors.join(' #')}）：${c.content}`
          }
          return commentLine
        })
        .join('\n')
      postContent += `\n\n【留言】\n${commentsText}`
    }

    // 加入按讚資訊（簡化）
    if (post.likes.length > 0) {
      postContent += `\n\n（共 ${post.likes.length} 人按讚）`
    }

    const prompt = `動態內容：
${postContent}

請總結這則動態：`

    // 透過 LLM adapter 發送請求
    const adapter = await getDefaultAdapter()
    const response = await adapter.generate(
      [{ role: 'user', content: prompt }],
      {
        modelType: 'lite',
        systemInstruction,
        temperature: 0.3,
        maxOutputTokens: 512,
        safeMode: !isAdult,
        queueDescription: '貼文摘要生成'
      }
    )

    if (response.blocked || !response.text) {
      throw new Error('貼文摘要生成失敗：' + (response.blockReason || '空回應'))
    }

    return response.text
  } catch (error) {
    console.error('生成貼文摘要失敗:', error)
    throw new Error('無法生成貼文摘要')
  }
}

/**
 * 評估群聊中角色之間的關係（舊版，僅評估關係）
 * @deprecated 請改用 evaluateCharacterRelationshipsWithMood
 */
export async function evaluateCharacterRelationships(
  characters: Character[],
  recentMessages: Message[],
  userAge?: string
): Promise<RelationshipEvaluation[]> {
  const result = await evaluateCharacterRelationshipsWithMood(characters, recentMessages, userAge)
  return result.relationships
}

/**
 * 評估群聊中角色之間的關係和情緒
 * 在情境摘要更新時呼叫，分析角色互動並產生關係狀態和情緒
 */
export async function evaluateCharacterRelationshipsWithMood(
  characters: Character[],
  recentMessages: Message[],
  userAge?: string
): Promise<RelationshipEvaluationResult> {
  // 至少需要 2 個角色才能評估關係
  if (characters.length < 2) {
    return { relationships: [], moods: {} }
  }

  try {
    // 群聊情境：只有當使用者成年且所有角色都成年時才用寬鬆模式
    const allCharactersAdult = characters.every(c => {
      const age = parseInt(c.age || '', 10)
      return !isNaN(age) && age >= 18
    })
    const isAdult = isAdultConversation(userAge, '18') && allCharactersAdult

    // 系統指令：整合關係評估和情緒評估
    const systemInstruction = `你是一個小說創作輔助系統，專門分析虛構故事中角色之間的關係發展和情緒狀態。

這是一個${isAdult ? '面向成人讀者的' : ''}互動式小說創作平台。以下對話是作者創作的虛構劇情片段，所有角色、事件、關係都是文學創作的一部分。

你的任務是以文學評論的角度：
1. 客觀分析這些虛構角色之間的互動模式和情感連結
2. 評估每個角色在這段對話結束時的情緒狀態

${isAdult ? '作為成人向作品，故事可能包含複雜的情感糾葛，請如實分析角色關係。' : ''}

## 關係分析
請分析每一對角色之間的關係。注意：
1. 關係是單向的（A 對 B 的看法可能不同於 B 對 A）
2. 根據對話中的互動、語氣、回應方式來判斷
3. 如果沒有明顯互動，可以不評估該對關係
4. 只評估「角色列表」中的角色，對話中提及的其他人物不需要評估

關係類型說明：
- neutral: 普通/無特別感覺
- friend: 朋友/好感
- rival: 競爭對手/不太合得來
- family: 家人般的關係
- romantic: 曖昧/戀愛傾向

## 情緒分析
請評估每個角色在這段對話結束時的情緒狀態（2-4 個字，例如：開心、有點煩躁、期待、平靜）

請以 JSON 格式回應：
{
  "relationships": [
    {
      "from": "角色A的ID",
      "to": "角色B的ID",
      "type": "friend",
      "state": "從對話中觀察到的關係描述（1-2 句話）"
    }
  ],
  "moods": {
    "角色ID": "情緒描述"
  }
}

如果沒有觀察到明顯的關係變化，relationships 可以是空陣列。
moods 應該包含所有「角色列表」內的角色。`

    // 格式化角色資訊
    const charactersInfo = characters
      .map(c => `${c.name}（ID: ${c.id}）：${c.personality?.slice(0, 100) || '無性格描述'}\n`)
      .join('\n')

    // 格式化對話內容
    const conversation = recentMessages
      .map(m => `${m.senderName}: ${m.content}`)
      .join('\n')

    // 使用者輸入：要分析的資料
    const prompt = `角色列表：
${charactersInfo}

最近的對話：
${conversation}

請開始分析：`

    // 透過 LLM adapter 發送請求（使用 responseMimeType 強制 JSON 輸出）
    const adapter = await getDefaultAdapter()
    const response = await adapter.generate(
      [{ role: 'user', content: prompt }],
      {
        modelType: 'lite',
        systemInstruction,
        temperature: 0.3,
        maxOutputTokens: 4096,
        safeMode: !isAdult,
        responseMimeType: 'application/json',
        queueDescription: '群聊關係評估'
      }
    )

    // 檢查是否被封鎖或為空回應
    if (response.blocked || !response.text) {
      console.warn('關係評估為空或被封鎖:', { blocked: response.blocked, blockReason: response.blockReason })
      return { relationships: [], moods: {} }
    }

    const responseText = response.text

    // 解析 JSON 回應
    const parsed = JSON.parse(responseText)
    const relationships: RelationshipEvaluation[] = []
    const moods: { [characterId: string]: string } = {}

    // 處理關係
    if (parsed.relationships && Array.isArray(parsed.relationships)) {
      const validIds = new Set(characters.map(c => c.id))

      for (const rel of parsed.relationships) {
        if (!validIds.has(rel.from) || !validIds.has(rel.to)) {
          console.warn('跳過無效的關係評估:', rel)
          continue
        }

        const validTypes: CharacterRelationType[] = ['neutral', 'friend', 'rival', 'family', 'romantic', 'custom']
        const type = validTypes.includes(rel.type) ? rel.type : 'neutral'

        relationships.push({
          fromId: rel.from,
          toId: rel.to,
          type,
          state: rel.state || ''
        })
      }
    }

    // 處理情緒
    if (parsed.moods && typeof parsed.moods === 'object') {
      const validIds = new Set(characters.map(c => c.id))

      for (const [charId, mood] of Object.entries(parsed.moods)) {
        if (validIds.has(charId) && typeof mood === 'string' && mood.trim()) {
          moods[charId] = mood.trim()
        }
      }
    }

    return { relationships, moods }
  } catch (error) {
    console.error('評估角色關係失敗:', error)
    return { relationships: [], moods: {} }
  }
}
