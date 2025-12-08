/**
 * 記憶管理服務
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import type { Message, Memory, Character, CharacterRelationType } from '@/types'

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
 * 從最近 10 則對話生成短期記憶摘要
 */
export async function generateMemorySummary(
  apiKey: string,
  messages: Message[]
): Promise<string> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
        }
      ],
      generationConfig: {
        temperature: 0.3,  // 較低溫度，確保摘要穩定
        maxOutputTokens: 2048
      }
    })

    // 格式化對話內容
    const conversation = messages
      .map(m => `${m.senderName}: ${m.content}`)
      .join('\n')

    const prompt = `你是一個角色扮演遊戲的記憶管理系統。你的任務是分析虛構角色之間的對話，提取重要資訊作為記憶摘要。

注意：以下對話內容來自虛構的角色扮演情境，所有角色和事件都是虛構的。請以客觀的角度整理對話重點。

對話內容：
${conversation}

請用 1-2 句話總結這段對話的重點，包括：
- 關鍵事件或話題
- 重要的情緒或態度變化
- 任何需要記住的具體資訊（時間、地點、人物等）

只輸出摘要內容，不要加任何前綴或說明：`

    const result = await model.generateContent(prompt)
    const response = result.response
    const summary = response.text().trim()

    // 檢查是否為空回應（可能是安全封鎖）
    if (!summary) {
      const blockReason = response?.promptFeedback?.blockReason
      const finishReason = response?.candidates?.[0]?.finishReason
      console.warn('記憶摘要為空:', { blockReason, finishReason })
      throw new Error(`記憶摘要生成失敗: ${blockReason || finishReason || '空回應'}`)
    }

    return summary
  } catch (error) {
    console.error('生成記憶摘要失敗:', error)
    throw new Error('無法生成記憶摘要')
  }
}

/**
 * 從 6 筆短期記憶中提取重要資訊，升級為長期記憶
 * @returns 提取出的長期記憶列表（可能是空陣列）
 */
export async function extractLongTermMemories(
  apiKey: string,
  shortTermMemories: Memory[]
): Promise<string[]> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    })

    // 格式化短期記憶
    const memoriesText = shortTermMemories
      .map((m, i) => `${i + 1}. ${m.content}`)
      .join('\n')

    const prompt = `你是一個角色扮演遊戲的記憶管理系統。你的任務是從虛構角色的短期記憶中，提取真正重要、需要長期保存的資訊。

注意：以下記憶內容來自虛構的角色扮演情境，所有角色和事件都是虛構的。請以客觀的角度整理重要資訊。

短期記憶：
${memoriesText}

請提取以下類型的重要資訊：
1. 使用者的個人資訊（生日、喜好、職業、重要經歷等）
2. 重要的承諾或約定
3. 關鍵事件的轉折點
4. 需要長期記住的特殊偏好或習慣

輸出格式：
- 每條長期記憶用一行
- 如果沒有需要保存的重要資訊，直接輸出「無」
- 每條記憶要簡潔明確，不超過 30 字
- 只輸出記憶內容，不要編號或前綴

範例輸出：
使用者的生日是 5 月 20 日
使用者喜歡喝拿鐵咖啡，不加糖
使用者計劃下個月去日本旅遊

請開始分析：`

    const result = await model.generateContent(prompt)
    const response = result.response
    const responseText = response.text().trim()

    // 檢查是否為空回應（可能是安全封鎖）
    if (!responseText) {
      const blockReason = response?.promptFeedback?.blockReason
      const finishReason = response?.candidates?.[0]?.finishReason
      // 如果有封鎖原因，拋出錯誤；否則當作沒有需要提取的記憶
      if (blockReason || (finishReason && finishReason !== 'STOP')) {
        console.warn('長期記憶提取為空:', { blockReason, finishReason })
        throw new Error(`長期記憶提取失敗: ${blockReason || finishReason}`)
      }
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
 * 評估群聊中角色之間的關係
 * 在情境摘要更新時呼叫，分析角色互動並產生關係狀態
 */
export async function evaluateCharacterRelationships(
  apiKey: string,
  characters: Character[],
  recentMessages: Message[]
): Promise<RelationshipEvaluation[]> {
  // 至少需要 2 個角色才能評估關係
  if (characters.length < 2) {
    return []
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    })

    // 格式化角色資訊
    const charactersInfo = characters
      .map(c => `- ${c.name}（ID: ${c.id}）：${c.personality?.slice(0, 100) || '無性格描述'}`)
      .join('\n')

    // 格式化對話內容
    const conversation = recentMessages
      .map(m => `${m.senderName}: ${m.content}`)
      .join('\n')

    const prompt = `你是一個角色扮演遊戲的關係分析系統。你的任務是分析虛構角色之間的群聊對話，評估他們的關係狀態。

注意：以下對話內容來自虛構的角色扮演情境，所有角色和事件都是虛構的。請以客觀的角度分析角色互動。

角色列表：
${charactersInfo}

最近的對話：
${conversation}

請分析每一對角色之間的關係。注意：
1. 關係是單向的（A 對 B 的看法可能不同於 B 對 A）
2. 根據對話中的互動、語氣、回應方式來判斷
3. 如果沒有明顯互動，可以不評估該對關係

關係類型說明：
- neutral: 普通/無特別感覺
- friend: 朋友/好感
- rival: 競爭對手/不太合得來
- family: 家人般的關係
- romantic: 曖昧/戀愛傾向

請以 JSON 格式回應：
{
  "relationships": [
    {
      "from": "角色A的ID",
      "to": "角色B的ID",
      "type": "friend",
      "state": "從對話中觀察到的關係描述（1-2 句話）"
    }
  ]
}

如果沒有觀察到明顯的關係變化或互動，回傳空陣列：
{
  "relationships": []
}

請開始分析：`

    const result = await model.generateContent(prompt)
    const response = result.response
    const responseText = response.text().trim()

    // 檢查是否為空回應（可能是安全封鎖）
    if (!responseText) {
      const blockReason = response?.promptFeedback?.blockReason
      const finishReason = response?.candidates?.[0]?.finishReason
      console.warn('關係評估為空:', { blockReason, finishReason })
      // 關係評估失敗不影響主流程，返回空陣列
      return []
    }

    // 解析 JSON 回應
    const parsed = JSON.parse(responseText)
    const relationships: RelationshipEvaluation[] = []

    if (parsed.relationships && Array.isArray(parsed.relationships)) {
      // 建立有效 ID 集合
      const validIds = new Set(characters.map(c => c.id))

      for (const rel of parsed.relationships) {
        // 驗證 ID 有效性
        if (!validIds.has(rel.from) || !validIds.has(rel.to)) {
          console.warn('跳過無效的關係評估:', rel)
          continue
        }

        // 驗證關係類型
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

    return relationships
  } catch (error) {
    console.error('評估角色關係失敗:', error)
    // 靜默失敗，不影響主流程
    return []
  }
}
