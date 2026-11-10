import { describe, it, expect } from 'vitest'
import { orderFallbackProviders } from './fallback'

describe('orderFallbackProviders', () => {
  it('照使用者設定的順序排', () => {
    expect(orderFallbackProviders(['grok', 'claude', 'gemini'], ['gemini', 'claude', 'grok']))
      .toEqual(['grok', 'claude', 'gemini'])
  })

  it('略過沒有 API Key 的服務商', () => {
    expect(orderFallbackProviders(['grok', 'openai', 'gemini'], ['gemini', 'grok']))
      .toEqual(['grok', 'gemini'])
  })

  it('使用者還沒排過的服務商接在最後', () => {
    expect(orderFallbackProviders(['claude'], ['gemini', 'claude', 'grok']))
      .toEqual(['claude', 'gemini', 'grok'])
  })

  it('沒有設定順序時維持可用服務商原本的順序', () => {
    expect(orderFallbackProviders([], ['gemini', 'openai'])).toEqual(['gemini', 'openai'])
  })
})
