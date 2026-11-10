import { describe, it, expect } from 'vitest'
import { ThinkingLevel } from '@google/genai'
import { buildGenerationConfig, buildSafetySettings, THINKING_HEADROOM_TOKENS } from './geminiHelpers'

describe('buildGenerationConfig', () => {
  it('maxOutputTokens 應在要求的長度之外多留思考用的空間', () => {
    const config = buildGenerationConfig({ modelType: 'main', maxOutputTokens: 256 })
    expect(config.maxOutputTokens).toBe(256 + THINKING_HEADROOM_TOKENS)
  })

  it('主模型用 LOW、輕量模型用 MINIMAL 的思考等級', () => {
    expect(buildGenerationConfig({ modelType: 'main', maxOutputTokens: 2048 }).thinkingConfig.thinkingLevel)
      .toBe(ThinkingLevel.LOW)
    expect(buildGenerationConfig({ modelType: 'lite', maxOutputTokens: 2048 }).thinkingConfig.thinkingLevel)
      .toBe(ThinkingLevel.MINIMAL)
  })

  it('不送取樣參數', () => {
    const config = buildGenerationConfig({ modelType: 'main', maxOutputTokens: 2048 })
    expect(config).not.toHaveProperty('temperature')
    expect(config).not.toHaveProperty('topP')
    expect(config).not.toHaveProperty('topK')
  })

  it('responseMimeType 有值時應加入', () => {
    const config = buildGenerationConfig({
      modelType: 'lite', maxOutputTokens: 2048, responseMimeType: 'application/json'
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
