# Gemini SDK 遷移實作計畫（Phase 1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 Gemini adapter 從已棄用的 `@google/generative-ai` SDK 遷移到新版 `@google/genai`。模型暫時保留 Gemini 2.5 系列，以隔離「SDK 行為差異」與「模型升級行為差異」兩種風險。

**Architecture:** 直接原地重寫 `src/services/llm/adapters/gemini.ts`，分階段替換內部 SDK 呼叫。對外的 `LLMAdapter` 介面（`generate()` / `getCharacterResponse()`）行為完全不變，所有 caller（`ChatRoom.vue`、`memoryService`、`feedService`、`birthdayService`、`holidayGreetingService`、`chatHelpers.ts`）皆不需要動。每個 task 可獨立 commit、回滾。

**Tech Stack:** TypeScript, `@google/genai` (新 SDK, ^1.48.0), `@google/generative-ai` (待移除, 0.24.1), Vitest, Vue 3, Pinia。

**Phase 2 預告（不在本計畫範圍）:** SDK 遷移完成、行為驗證穩定後，會開另一份 plan 把 `gemini-2.5-flash` → `gemini-3-flash-preview`、`gemini-2.5-flash-lite` → `gemini-3.1-flash-lite-preview`。

---

## File Structure

**Create:**
- `src/services/llm/adapters/geminiHelpers.ts` — Gemini SDK config 純函數（`buildGenerationConfig`, `buildSafetySettings`），抽出來方便 TDD
- `src/services/llm/adapters/geminiHelpers.test.ts` — 上述純函數的單元測試

**Modify:**
- `package.json` — 替換 SDK 依賴（先並存後移除）
- `src/services/llm/adapters/gemini.ts` — 全檔重寫 SDK 呼叫（原 697 行，預期縮減）
- `src/services/llm/index.ts:45-52` — 移除已不存在的 export（`createGeminiModel`, `prepareGeminiChat`, `sendGeminiRequest`, `sendGeminiRequestText`）
- `public/CHANGELOG.md` — 加 v1.7.20 完成版本

**No change:**
- `src/services/llm/types.ts` — `LLMAdapter` 介面保持
- `src/services/apiQueue.ts` — `GeminiModelType` 與佇列保持（Phase 2 才動）
- `src/services/llm/utils.ts` — 純函數，不依賴 SDK
- 所有 caller（ChatRoom.vue, memoryService, feedService...）— adapter 介面契約不變

---

## TDD 注意事項

⚠️ **本計畫的測試策略偏離標準 TDD**：

- **可 TDD 的部分**：`buildGenerationConfig()`、`buildSafetySettings()` 等純函數 → 寫單元測試
- **不適合 TDD 的部分**：實際 SDK 呼叫（mock 整個 `GoogleGenAI` 物件等於在測 mock 而非真實整合，CP 值極低）
- **替代方案**：每個 SDK-touching task 結束後，依「Manual Test Checklist」（Task 6 之後）逐項在 `npm run dev` 環境驗證

---

## Task 1: 安裝新 SDK 並保留舊 SDK 並存

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安裝 @google/genai（不移除舊 SDK）**

```bash
npm install @google/genai@^1.48.0
```

- [ ] **Step 2: 確認 package.json 兩個 SDK 都在**

預期 `dependencies` 區塊同時包含：

```json
"@google/genai": "^1.48.0",
"@google/generative-ai": "^0.24.1",
```

- [ ] **Step 3: 確認 type-check 通過**

```bash
npm run type-check
```

預期：通過（沒有任何新 import，純粹只是裝套件）

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 並存安裝 @google/genai 為 Gemini SDK 遷移做準備"
```

---

## Task 2: 抽出純函數 buildGenerationConfig / buildSafetySettings 並寫 TDD 測試

**Files:**
- Create: `src/services/llm/adapters/geminiHelpers.ts`
- Test: `src/services/llm/adapters/geminiHelpers.test.ts`

- [ ] **Step 1: 寫失敗的測試**

建立 `src/services/llm/adapters/geminiHelpers.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildGenerationConfig, buildSafetySettings } from './geminiHelpers'

describe('buildGenerationConfig', () => {
  it('應包含 temperature 與 maxOutputTokens', () => {
    const config = buildGenerationConfig({ temperature: 0.7, maxOutputTokens: 2048 })
    expect(config.temperature).toBe(0.7)
    expect(config.maxOutputTokens).toBe(2048)
  })

  it('topP 與 topK 為 undefined 時不應出現在結果裡', () => {
    const config = buildGenerationConfig({ temperature: 0.7, maxOutputTokens: 2048 })
    expect(config.topP).toBeUndefined()
    expect(config.topK).toBeUndefined()
  })

  it('topP 與 topK 有值時應加入', () => {
    const config = buildGenerationConfig({
      temperature: 0.95, maxOutputTokens: 2048, topP: 0.95, topK: 40
    })
    expect(config.topP).toBe(0.95)
    expect(config.topK).toBe(40)
  })

  it('responseMimeType 有值時應加入', () => {
    const config = buildGenerationConfig({
      temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json'
    })
    expect(config.responseMimeType).toBe('application/json')
  })
})

describe('buildSafetySettings', () => {
  it('safeMode=true 應使用 BLOCK_MEDIUM_AND_ABOVE', () => {
    const settings = buildSafetySettings(true)
    expect(settings).toContainEqual({
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    })
    expect(settings).toContainEqual({
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    })
  })

  it('safeMode=false 應使用 BLOCK_NONE（CIVIC_INTEGRITY 除外）', () => {
    const settings = buildSafetySettings(false)
    expect(settings).toContainEqual({
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_NONE'
    })
    expect(settings).toContainEqual({
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_NONE'
    })
  })

  it('CIVIC_INTEGRITY 不論模式皆為 BLOCK_ONLY_HIGH', () => {
    const safeSettings = buildSafetySettings(true)
    const unsafeSettings = buildSafetySettings(false)
    const expected = {
      category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
      threshold: 'BLOCK_ONLY_HIGH'
    }
    expect(safeSettings).toContainEqual(expected)
    expect(unsafeSettings).toContainEqual(expected)
  })

  it('應包含全部 5 個 HarmCategory', () => {
    const settings = buildSafetySettings(true)
    expect(settings).toHaveLength(5)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm run test:run -- geminiHelpers
```

預期：FAIL，理由 `Cannot find module './geminiHelpers'`

- [ ] **Step 3: 寫實作**

建立 `src/services/llm/adapters/geminiHelpers.ts`：

```ts
/**
 * Gemini SDK 共用純函數工具
 * 抽出來方便 TDD 與單元測試
 */

export interface GenerationConfigInput {
  temperature: number
  maxOutputTokens: number
  topP?: number
  topK?: number
  responseMimeType?: string
}

export interface GenerationConfig {
  temperature: number
  maxOutputTokens: number
  topP?: number
  topK?: number
  responseMimeType?: string
}

export function buildGenerationConfig(input: GenerationConfigInput): GenerationConfig {
  const config: GenerationConfig = {
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens
  }
  if (input.topP !== undefined) config.topP = input.topP
  if (input.topK !== undefined) config.topK = input.topK
  if (input.responseMimeType !== undefined) config.responseMimeType = input.responseMimeType
  return config
}

export interface SafetySetting {
  category: string
  threshold: string
}

export function buildSafetySettings(safeMode: boolean): SafetySetting[] {
  const baseThreshold = safeMode ? 'BLOCK_MEDIUM_AND_ABOVE' : 'BLOCK_NONE'
  return [
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: baseThreshold },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: baseThreshold },
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: baseThreshold },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: baseThreshold },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' }
  ]
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm run test:run -- geminiHelpers
```

預期：PASS（8 tests）

- [ ] **Step 5: Commit**

```bash
git add src/services/llm/adapters/geminiHelpers.ts src/services/llm/adapters/geminiHelpers.test.ts
git commit -m "feat: 抽出 Gemini config builders 為純函數 + TDD 單元測試"
```

---

## Task 3: 重寫 validateApiKey 使用新 SDK

**Files:**
- Modify: `src/services/llm/adapters/gemini.ts:5,211-246`

- [ ] **Step 1: 在 gemini.ts 頂部新增 @google/genai import（並存舊 import）**

在現有 `import { GoogleGenerativeAI, ... } from '@google/generative-ai'` 之後新增：

```ts
import { GoogleGenAI } from '@google/genai'
```

- [ ] **Step 2: 替換 validateApiKey 函數內容**

把 `gemini.ts` 整個 `validateApiKey` method（約 lines 211-246）替換為：

```ts
async validateApiKey(apiKey: string): Promise<ValidateApiKeyResult> {
  try {
    const safeApiKey = typeof apiKey === 'string' ? apiKey : String(apiKey ?? '')
    if (!safeApiKey || !safeApiKey.trim()) {
      return { valid: false, error: 'API Key 不能為空' }
    }

    const ai = new GoogleGenAI({ apiKey: safeApiKey })

    // 使用 countTokens 來驗證 API Key（免費，不消耗額度）
    const result = await ai.models.countTokens({
      model: getModelName('gemini', 'lite'),
      contents: 'test'
    })

    if (result && typeof result.totalTokens === 'number') {
      return { valid: true }
    }

    return { valid: false, error: '無法取得回應' }
  } catch (error: any) {
    console.error('API Key 驗證失敗:', error)

    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('invalid')) {
      return { valid: false, error: 'API Key 無效' }
    } else if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      return { valid: false, error: 'API 額度已用盡，請稍後再試或至 Google AI Studio 查看配額' }
    } else if (error.message?.includes('permission') || error.message?.includes('PERMISSION_DENIED')) {
      return { valid: false, error: 'API Key 權限不足' }
    } else {
      return { valid: false, error: `驗證失敗：${error.message || '未知錯誤'}` }
    }
  }
}
```

- [ ] **Step 3: type-check 通過**

```bash
npm run type-check
```

預期：PASS

- [ ] **Step 4: 手動測試 — API Key 驗證**

```bash
npm run dev
```

操作：
1. 打開 app → Settings → 編輯 API Key
2. 輸入正確的 Gemini API Key → 點驗證
3. 預期：✅ 顯示驗證成功
4. 輸入明顯錯誤的字串（如 `invalid-key-test`）→ 點驗證
5. 預期：❌ 顯示「API Key 無效」或類似錯誤訊息

- [ ] **Step 5: Commit**

```bash
git add src/services/llm/adapters/gemini.ts
git commit -m "refactor: validateApiKey 改用 @google/genai 新 SDK"
```

---

## Task 4: 重寫 generate() 使用新 SDK

**Files:**
- Modify: `src/services/llm/adapters/gemini.ts:255-312`（generate 函數體）
- Modify: `src/services/llm/adapters/gemini.ts` 開頭新增 helpers import

- [ ] **Step 1: 新增 helpers import**

在 `gemini.ts` import 區塊新增：

```ts
import { buildGenerationConfig, buildSafetySettings } from './geminiHelpers'
```

- [ ] **Step 2: 替換 generate 函數實作**

把整個 `generate(messages, options)` 函數體（約 lines 255-312）替換為：

```ts
async generate(
  messages: LLMMessage[],
  options?: GenerateOptions
): Promise<GenerateResponse> {
  const apiKey = options?.apiKey || await this.getApiKey()
  const {
    modelType = 'main',
    systemInstruction,
    temperature = 0.7,
    maxOutputTokens = 2048,
    topP,
    topK,
    safeMode = true,
    responseMimeType
  } = options || {}

  const ai = new GoogleGenAI({ apiKey })
  const modelName = getModelName('gemini', modelType)

  // 分離 history 和最後的 prompt
  const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
  const lastUserMessage = lastUserIndex >= 0 ? messages[lastUserIndex] : null
  const userPromptContent = lastUserMessage?.content || ''
  const historyMessages = lastUserIndex > 0 ? messages.slice(0, lastUserIndex) : []

  // 轉換歷史訊息為 Gemini 格式（支援多模態）
  const history: any[] = historyMessages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: convertToGeminiParts(msg.content)
  }))

  // workaround：先加 user prompt，再加假的 model 回應（繞過過度審查，原 gemini.ts:275-283 邏輯）
  history.push({ role: 'user', parts: convertToGeminiParts(userPromptContent) })
  history.push({
    role: 'model',
    parts: [{ text: '好的，我知道了，我已經依據你的說明產生內容，如下：' }]
  })

  const chat = ai.chats.create({
    model: modelName,
    history,
    config: {
      ...buildGenerationConfig({ temperature, maxOutputTokens, topP, topK, responseMimeType }),
      ...(systemInstruction && { systemInstruction }),
      safetySettings: buildSafetySettings(safeMode)
    }
  })

  const response = await enqueueGeminiRequest(
    () => chat.sendMessage({ message: '' }),
    getGeminiModelName(modelType === 'lite' ? 'lite' : 'main'),
    options?.queueDescription || '內容生成'
  )

  const blocked = checkResponseBlocked(response)
  if (blocked) {
    return {
      text: '',
      raw: response,
      blocked: true,
      blockReason: blocked.reason,
      finishReason: response?.candidates?.[0]?.finishReason
    }
  }

  // ⚠️ 注意：新 SDK 的 text 是 property（不是 method）
  const rawText = response.text
  const text = typeof rawText === 'string' ? rawText : String(rawText ?? '')
  return {
    text: getActuallyContent(text),
    raw: response,
    blocked: false,
    finishReason: response?.candidates?.[0]?.finishReason
  }
}
```

- [ ] **Step 3: type-check 通過**

```bash
npm run type-check
```

如果失敗：很可能是 `chat.sendMessage` 的回傳型別差異或 `response.text` 取值方式問題。檢查 `@google/genai` types，調整後重跑。

- [ ] **Step 4: 手動測試 — 動態牆 AI 發文**

```bash
npm run dev
```

操作：
1. 進入動態牆
2. 觸發 AI 自動發文（或手動點「請好友發文」按鈕）
3. 預期：成功生成貼文，無 console 錯誤

- [ ] **Step 5: 手動測試 — 短期記憶生成**

操作：
1. 與某好友聊滿 15 則訊息（會觸發記憶生成）
2. 進入好友詳情頁查看「短期記憶」區
3. 預期：有新的記憶條目被加入

- [ ] **Step 6: Commit**

```bash
git add src/services/llm/adapters/gemini.ts
git commit -m "refactor: generate() 改用 @google/genai 新 SDK 的 chats.create API"
```

---

## Task 5: 重寫 getCharacterResponse() 使用新 SDK

**Files:**
- Modify: `src/services/llm/adapters/gemini.ts:318-630`

⚠️ **此 task 是整個遷移最關鍵的部分**（約 300 行邏輯）。SDK 呼叫雖然改了，但**所有非 SDK 邏輯必須逐字保留**：
- 三層降級重試（完整→短歷史→無歷史）
- 群聊 `[name]:` 格式解析
- 短 ID / 長 ID 轉換
- 好感度解析
- MAX_TOKENS 處理
- 空回應防護

- [ ] **Step 1: 替換 getCharacterResponse 整個函數體**

把 `gemini.ts` 中 `async getCharacterResponse(params)` 整個方法（約 lines 318-630）替換為：

```ts
async getCharacterResponse(params: GetCharacterResponseParams): Promise<CharacterResponse> {
  const { character, user, room, messages, userMessage, userImages, context } = params

  try {
    const apiKey = await this.getApiKey()

    const isGroupChat = room?.type === 'group'
    const useShortIds = isGroupChat && context?.otherCharactersInRoom && context.otherCharactersInRoom.length > 0
    const isAdult = isAdultConversation(user.age, character.age)

    const systemPrompt = generateSystemPrompt({
      character, user, room, ...context, useShortIds, isAdultMode: isAdult
    })

    const ai = new GoogleGenAI({ apiKey })
    const modelName = getModelName('gemini', 'main')
    const baseConfig = {
      ...buildGenerationConfig({
        temperature: 0.95,
        maxOutputTokens: character.maxOutputTokens || 2048,
        topP: 0.95,
        topK: 40
      }),
      systemInstruction: systemPrompt,
      safetySettings: buildSafetySettings(!isAdult)
    }

    // 處理對話歷史（保留原 useShortIds 邏輯）
    const processedMessages = useShortIds && context?.otherCharactersInRoom
      ? messages.map(msg => ({
          ...msg,
          content: convertToShortIds(msg.content, context.otherCharactersInRoom!)
        }))
      : messages

    let _userMsg = isGroupChat && userMessage.length > 0
      ? "[" + user.nickname + "]: " + userMessage
      : userMessage

    if (useShortIds && context?.otherCharactersInRoom) {
      _userMsg = convertToShortIds(_userMsg, context.otherCharactersInRoom)
    }

    let history: any[] = processedMessages.slice(-20).map(msg => {
      const isUser = msg.senderId === 'user'
      let content = msg.content
      if (isGroupChat) {
        content = `[${msg.senderName}]: ${msg.content}`
      }
      return {
        role: isUser ? 'user' : 'model',
        parts: [{ text: content }]
      }
    })

    const ensureHistoryStartsWithUser = (hist: any[]) => {
      if (hist.length > 0 && hist[0]?.role !== 'user') {
        const firstUserIndex = hist.findIndex(msg => msg.role === 'user')
        if (firstUserIndex > 0) return hist.slice(firstUserIndex)
        return []
      }
      return hist
    }

    history = ensureHistoryStartsWithUser(history)

    const buildUserMessageParts = (text: string): any[] => {
      const parts: any[] = []
      if (userImages && userImages.length > 0) {
        for (const img of userImages) {
          const { mimeType, data } = imageAttachmentToLLMFormat(img)
          parts.push({ inlineData: { mimeType, data } })
        }
      }
      if (text) parts.push({ text })
      // Gemini API 要求每個 Content 至少有一個 part
      if (parts.length === 0) parts.push({ text: '（對話繼續）' })
      return parts
    }

    const sendAndCheck = async (chatHistory: any[], userMsg: string): Promise<{ text: string; response: any }> => {
      const historyWithUserMsg = [...chatHistory]
      historyWithUserMsg.push({ role: 'user', parts: buildUserMessageParts(userMsg) })
      historyWithUserMsg.push({ role: 'model', parts: [{ text: `[${character.name}]:` }] })

      const chat = ai.chats.create({
        model: modelName,
        history: historyWithUserMsg,
        config: baseConfig
      })

      const response = await enqueueGeminiRequest(
        () => chat.sendMessage({ message: '' }),
        getGeminiModelName('main'),
        `對話：${character.name}`
      )

      const blocked = checkResponseBlocked(response)
      if (blocked) {
        throw new ContentBlockedError(blocked.reason, blocked.message)
      }

      // ⚠️ 新 SDK：text 是 property（不是 method）
      const rawText = response.text
      const responseText = typeof rawText === 'string' ? rawText : String(rawText ?? '')
      return { text: responseText, response }
    }

    // 三層降級重試（保留原邏輯）
    let text: string
    let response: any
    try {
      const result = await sendAndCheck(history, _userMsg)
      text = result.text
      response = result.response
    } catch (firstError: any) {
      if (isBlockedError(firstError) && history.length > 0) {
        console.warn('⚠️ 內容被封鎖（完整歷史），嘗試縮短對話歷史重試...')
        try {
          let shorterHistory = history.slice(-5)
          shorterHistory = ensureHistoryStartsWithUser(shorterHistory)
          const result = await sendAndCheck(shorterHistory, _userMsg)
          text = result.text
          response = result.response
          console.log('✅ 縮短歷史後重試成功（5 則）')
        } catch (secondError: any) {
          if (isBlockedError(secondError)) {
            console.warn('⚠️ 內容仍被封鎖（短歷史），嘗試無歷史模式...')
            try {
              const result = await sendAndCheck([], _userMsg)
              text = result.text
              response = result.response
              console.log('✅ 無歷史模式重試成功')
            } catch (thirdError: any) {
              console.error('❌ 三層降級重試均失敗')
              throw thirdError
            }
          } else {
            throw secondError
          }
        }
      } else {
        throw firstError
      }
    }

    if (typeof text !== 'string') text = String(text ?? '')

    // 處理群聊格式（保留原邏輯）
    if (isGroupChat) {
      const characterName = character.name
      const segments: string[] = []
      const tagPattern = /\[([^\]]+)\]:[ ]?/g
      let lastIndex = 0
      let currentSpeaker: string | null = null
      let match: RegExpExecArray | null

      const firstTagMatch = text.match(/^\[([^\]]+)\]:[ ]?/)
      if (!firstTagMatch) currentSpeaker = characterName

      while ((match = tagPattern.exec(text)) !== null) {
        if (lastIndex < match.index && currentSpeaker === characterName) {
          segments.push(text.slice(lastIndex, match.index))
        }
        currentSpeaker = match[1] ?? null
        lastIndex = match.index + match[0].length
      }
      if (lastIndex < text.length && currentSpeaker === characterName) {
        segments.push(text.slice(lastIndex))
      }
      text = segments.join('').trim()
    } else {
      text = text.replace(/^\[.*?\]:[ ]?/gm, '')
    }

    if (useShortIds && context?.otherCharactersInRoom) {
      text = convertToLongIds(text, context.otherCharactersInRoom)
    }

    const finishReasonCheck = response?.candidates?.[0]?.finishReason
    if (finishReasonCheck === 'MAX_TOKENS') {
      console.warn('⚠️ AI 回應因達到 token 上限而被截斷')
      throw new Error('MAX_TOKENS_REACHED')
    }

    // 解析好感度（保留原邏輯）
    const safeText = typeof text === 'string' ? text : String(text ?? '')
    const lines = safeText.trim().split('\n')
    const rawLastLine = lines.length > 0 ? lines[lines.length - 1] : ''
    const lastLine = typeof rawLastLine === 'string' ? rawLastLine : String(rawLastLine ?? '')

    const trimmedLastLine = lastLine.trim()
    const affectionPrefixMatch = trimmedLastLine.match(/^好感度[:](?:\s*)(-?\d+)$/) // 注意：相容半形/全形冒號
    const affectionStr = (affectionPrefixMatch && affectionPrefixMatch[1])
      ? affectionPrefixMatch[1]
      : trimmedLastLine
    const parsedAffection = parseInt(affectionStr, 10)

    const checkEmptyResponseAndThrow = (textToCheck: string) => {
      if (textToCheck && textToCheck.length > 0) return

      const blockReason = response?.promptFeedback?.blockReason
      const finishReason = response?.candidates?.[0]?.finishReason

      console.warn('⚠️ AI 回應內容為空，檢查封鎖原因:', { blockReason, finishReason })

      if (blockReason === 'SAFETY' || blockReason === 'PROHIBITED_CONTENT' ||
          finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
        throw new Error('BLOCKED_BY_SAFETY')
      }
      if (finishReason === 'MAX_TOKENS') throw new Error('MAX_TOKENS_REACHED')
      if (blockReason || finishReason) throw new Error(`BLOCKED: ${blockReason || finishReason}`)
      throw new Error('EMPTY_RESPONSE')
    }

    const isAffectionLine = /^-?\d+$/.test(trimmedLastLine) || affectionPrefixMatch !== null
    if (!isNaN(parsedAffection) && isAffectionLine) {
      let cleanText = lines.slice(0, -1).join('\n').trim()
      if (!cleanText) {
        console.warn('⚠️ AI 只回傳了好感度，無實際對話內容')
        return { text: '', newAffection: parsedAffection, silentUpdate: true }
      }
      cleanText = cleanExcessiveQuotes(cleanText)
      return { text: cleanText, newAffection: parsedAffection }
    }

    let finalText = text.trim()
    checkEmptyResponseAndThrow(finalText)
    finalText = cleanExcessiveQuotes(finalText)

    return { text: finalText, newAffection: undefined }
  } catch (error: any) {
    console.error('Gemini API 錯誤:', error)
    throw new Error(formatErrorMessage(error))
  }
}
```

⚠️ **重要**：上面好感度的 regex `/^好感度[:](?:\s*)(-?\d+)$/` 跟原檔案 `:563` 的 `/^好感度[：:]\s*(-?\d+)$/` **必須對齊**。請執行時直接複製原檔的 regex（含全形冒號 `：` 與半形冒號 `:`），上面寫法是 markdown 平台會吃掉某些字符，務必檢查。

- [ ] **Step 2: 對齊好感度 regex**

執行者請開原檔 `gemini.ts:563`，把那行 `affectionPrefixMatch` 的 regex 完整複製貼到新版同位置，確保半形/全形冒號都包含。

- [ ] **Step 3: type-check 通過**

```bash
npm run type-check
```

- [ ] **Step 4: 手動測試 — 單聊（未成年模式）**

```bash
npm run dev
```

操作：
1. 建一個 17 歲的好友
2. 跟他聊一段對話（5+ 則）
3. 預期：正常回應、好感度有變化、訊息流暢、無 console 錯誤

- [ ] **Step 5: 手動測試 — 單聊（成年模式）**

操作：
1. 確認自己 profile 年齡 ≥ 18
2. 建一個 25 歲的好友
3. 聊一段
4. 預期：正常回應，安全設定為 BLOCK_NONE 模式

- [ ] **Step 6: 手動測試 — 群聊**

操作：
1. 建群組，加入 3 位好友
2. 發訊息明確 @ 某位
3. 預期：被 @ 的角色優先回應，對話自然，無無限循環，沒有「[名字]:」殘留在訊息開頭

- [ ] **Step 7: 手動測試 — 圖片附件**

操作：
1. 在單聊中傳一張圖（jpg / png 任一）
2. 預期：好友能回應/描述圖片內容

- [ ] **Step 8: 手動測試 — 好感度解析**

操作：
1. 跟某好友聊一段，觀察好感度面板
2. 預期：好感度數字會根據對話氛圍變化（不要永遠保持 0）

- [ ] **Step 9: Commit**

```bash
git add src/services/llm/adapters/gemini.ts
git commit -m "refactor: getCharacterResponse() 改用 @google/genai 新 SDK"
```

---

## Task 6: 清理舊 imports 與已棄用工具函數

**Files:**
- Modify: `src/services/llm/adapters/gemini.ts`（多處）
- Modify: `src/services/llm/index.ts:45-52`

新 SDK 沒有獨立的「Model」物件，所以 `createGeminiModel` 失去意義。使用 Grep 已確認 `prepareGeminiChat` / `sendGeminiRequest` / `sendGeminiRequestText` 只在 `gemini.ts` 內部使用，可安全移除。

- [ ] **Step 1: 確認外部沒有其他地方使用這些函數**

用 Grep 工具搜尋 `src/`：

模式：`createGeminiModel|prepareGeminiChat|sendGeminiRequest|sendGeminiRequestText`

預期：只在 `gemini.ts`（定義處）與 `index.ts`（re-export 處）出現。如果在其他檔案出現，請停下來回報。

- [ ] **Step 2: 從 gemini.ts 刪除以下內容**

刪除：
- `createGeminiModel` 函數（原 lines 86-134）
- `SAFE_MODE_SAFETY_SETTINGS` 常數（原 lines 34-55）— 已被 `buildSafetySettings(true)` 取代
- `UNRESTRICTED_SAFETY_SETTINGS` 常數（原 lines 60-81）— 已被 `buildSafetySettings(false)` 取代
- `prepareGeminiChat` 函數（原 lines 655-669）
- `sendGeminiRequest` 函數（原 lines 678-681）
- `sendGeminiRequestText` 函數（原 lines 690-696）
- 對應的 `// ============` 區塊註解（如「獨立工具函數」標題）

**保留**：
- `convertToGeminiParts`（內部還在用）
- `checkResponseBlocked`（內部還在用）
- `geminiAdapter` export instance

- [ ] **Step 3: 移除 @google/generative-ai 的 imports**

把 `gemini.ts` 開頭的：

```ts
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, type GenerativeModel, type Content, type EnhancedGenerateContentResponse } from '@google/generative-ai'
import type { Part } from '@google/generative-ai'
```

完全刪除。`Part` 與 `Content` 型別在新 SDK 也有，但我們在內部直接用 `any[]`（避免綁死特定 SDK 型別），所以不需要再 import。

- [ ] **Step 4: 修正 index.ts 的 export**

把 `src/services/llm/index.ts:45-52` 從：

```ts
export {
  geminiAdapter,
  GeminiAdapter,
  createGeminiModel,
  prepareGeminiChat,
  sendGeminiRequest,
  sendGeminiRequestText
} from './adapters/gemini'
```

改成：

```ts
export {
  geminiAdapter,
  GeminiAdapter
} from './adapters/gemini'
```

- [ ] **Step 5: type-check 通過**

```bash
npm run type-check
```

預期：PASS。如有錯誤，可能是仍有殘留的舊 SDK 型別引用。

- [ ] **Step 6: 跑全部單元測試**

```bash
npm run test:run
```

預期：全部 PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/llm/adapters/gemini.ts src/services/llm/index.ts
git commit -m "refactor: 移除 @google/generative-ai 殘留 imports 與已不再需要的工具函數"
```

---

## Task 7: 移除舊 SDK 依賴

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 移除舊 SDK**

```bash
npm uninstall @google/generative-ai
```

- [ ] **Step 2: 確認 package.json 已乾淨**

預期 `dependencies` 不再有 `@google/generative-ai`，只保留 `@google/genai`

- [ ] **Step 3: 完整 build**

```bash
npm run build
```

預期：build 成功，無 import 錯誤、無型別錯誤

- [ ] **Step 4: 在 dev 模式做最終煙霧測試**

```bash
npm run dev
```

操作：跟某個好友聊兩句，確認對話、好感度、訊息儲存都正常。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 移除已淘汰的 @google/generative-ai SDK"
```

---

## Task 8: 更新 CHANGELOG 並 push

**Files:**
- Modify: `public/CHANGELOG.md`

- [ ] **Step 1: 在 CHANGELOG 最上方加 v1.7.20**

把開頭從：

```markdown
# 更新履歷

## [1.7.19] - 2026-04-17
```

改成（**注意：日期請改成執行當天的日期**）：

```markdown
# 更新履歷

## [1.7.20] - 2026-MM-DD

### 🔧 改善

- **底層 SDK 升級（Phase 1）**
  - Gemini SDK 從 `@google/generative-ai`（已棄用）升級至 `@google/genai`（官方新版）
  - 對話、群聊、記憶、動態牆等所有功能行為皆與升級前一致
  - 模型暫時保留 Gemini 2.5 Flash 系列，下一階段（Phase 2）將切換至 Gemini 3 Flash 系列

---

## [1.7.19] - 2026-04-17
```

- [ ] **Step 2: Commit**

```bash
git add public/CHANGELOG.md
git commit -m "docs: v1.7.20 — Gemini SDK 遷移完成（Phase 1）"
```

- [ ] **Step 3: Push 到遠端 main**

```bash
git push origin main
```

---

## Manual Test Checklist（最終驗收，所有 task 完成後跑一遍）

- [ ] API Key 驗證（正確 key / 錯誤 key 各試一次）
- [ ] 單聊：未成年好友（17 歲）+ 一般話題
- [ ] 單聊：成年好友（25+）+ 試一句稍微邊緣的話題（不違法但測 BLOCK_NONE 是否生效）
- [ ] 單聊：圖片附件（jpg + png 各試一次）
- [ ] 群聊：3 人群組 + @ 提及 → 被 @ 的優先回
- [ ] 群聊：不 @ 任何人，看哪些角色自動回（不應無限循環）
- [ ] 短期記憶生成（聊滿 15 則自動觸發）
- [ ] 動態牆：手動觸發 AI 發文
- [ ] 內容封鎖降級重試：故意丟比較邊緣的內容，看 console 是否有「縮短歷史後重試成功」訊息
- [ ] MAX_TOKENS 處理：把好友 maxOutputTokens 調到 50，請它寫長篇回應 → 預期顯示「達到 token 上限」訊息
- [ ] 好感度解析：聊一段觀察好感度數字變化（不應永遠 0）
- [ ] 群聊 [name]: 格式：確認其他角色名字不會殘留在當前角色的回覆裡
- [ ] 重整 app（按 F5）後，聊天紀錄與好友資料完整保留

---

## Self-Review

**1. Spec coverage:**
- ✅ SDK 遷移：Task 1-7
- ✅ 移除舊 SDK：Task 7
- ✅ 文件/版本更新：Task 8
- ✅ TDD 不適用部分有手動測試清單（Task 6 之後）
- ✅ 對外 LLMAdapter 介面行為不變 → caller 不需動

**2. Placeholder scan:**
- 「2026-MM-DD」在 Task 8 — **故意保留**，由執行者於當天填入
- 「請執行時直接複製原檔的 regex」在 Task 5 Step 2 — **故意保留**，因為 markdown 渲染可能吃掉全形冒號

**3. Type consistency:**
- `buildGenerationConfig` / `buildSafetySettings` 在 Task 2 定義，Task 4-5 使用，名稱一致 ✅
- `ai.chats.create({ model, history, config })` 在 Task 4-5 一致 ✅
- `chat.sendMessage({ message: '' })` 在 Task 4-5 一致 ✅
- `response.text`（property，**不是** method）在 Task 4-5 一致並有警示 ✅
- `GoogleGenAI` 類別名稱在 Task 3-5 一致 ✅
