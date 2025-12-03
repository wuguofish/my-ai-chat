/**
 * 記憶管理服務
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Message, Memory } from '@/types'

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
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3,  // 較低溫度，確保摘要穩定
        maxOutputTokens: 2048
      }
    })

    // 格式化對話內容
    const conversation = messages
      .map(m => `${m.senderName}: ${m.content}`)
      .join('\n')

    const prompt = `請分析以下對話，提取最重要的資訊作為記憶摘要。

對話內容：
${conversation}

請用 1-2 句話總結這段對話的重點，包括：
- 關鍵事件或話題
- 重要的情緒或態度變化
- 任何需要記住的具體資訊（時間、地點、人物等）

只輸出摘要內容，不要加任何前綴或說明：`

    const result = await model.generateContent(prompt)
    const summary = result.response.text().trim()

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
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    })

    // 格式化短期記憶
    const memoriesText = shortTermMemories
      .map((m, i) => `${i + 1}. ${m.content}`)
      .join('\n')

    const prompt = `請分析以下短期記憶，提取真正重要、需要長期保存的資訊。

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
    const responseText = result.response.text().trim()

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
