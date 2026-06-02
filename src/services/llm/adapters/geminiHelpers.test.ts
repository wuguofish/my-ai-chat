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
