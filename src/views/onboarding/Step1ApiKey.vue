<script setup lang="ts">
import { ref, computed } from 'vue'
import { getAdapter, getImplementedProviders, LLM_CONFIG, type LLMProvider } from '@/services/llm'

const emit = defineEmits<{
  next: []
}>()

// 已實作的服務商
const implementedProviders = getImplementedProviders()

// 所有服務商（用於顯示，包含即將推出的）
const allProviders: LLMProvider[] = ['gemini', 'claude', 'openai', 'grok']

// 選擇的服務商（預設 Gemini）
const selectedProvider = ref<LLMProvider>('gemini')

// API Key 輸入
const apiKey = ref('')
const error = ref('')
const isValidating = ref(false)

// 取得服務商設定
const getProviderConfig = (provider: LLMProvider) => {
  return LLM_CONFIG[provider]
}

// 檢查服務商是否已實作
const isProviderImplemented = (provider: LLMProvider) => {
  return implementedProviders.includes(provider)
}

// 目前選擇的服務商設定
const currentConfig = computed(() => getProviderConfig(selectedProvider.value))

// 選擇服務商
const handleSelectProvider = (provider: LLMProvider) => {
  if (!isProviderImplemented(provider)) return
  selectedProvider.value = provider
  apiKey.value = ''
  error.value = ''
}

// 下一步
const handleNext = async () => {
  if (!apiKey.value.trim()) {
    error.value = '請輸入 API Key'
    return
  }

  // 使用 adapter 驗證 API Key
  try {
    isValidating.value = true
    error.value = ''

    const adapter = getAdapter(selectedProvider.value)
    const result = await adapter.validateApiKey(apiKey.value.trim())

    if (!result.valid) {
      error.value = result.error || 'API Key 無效，請確認後重試'
      return
    }

    // 驗證成功，暫存資料（稍後在步驟 2 會一起儲存）
    sessionStorage.setItem('temp-api-key', apiKey.value.trim())
    sessionStorage.setItem('temp-provider', selectedProvider.value)
    emit('next')
  } catch (err) {
    console.error('API Key 驗證錯誤:', err)
    error.value = '驗證失敗，請稍後再試'
  } finally {
    isValidating.value = false
  }
}

// 開啟 API Key 說明頁面
const openApiKeyHelp = () => {
  window.open(currentConfig.value.consoleUrl, '_blank')
}
</script>

<template>
  <div class="step-content">
    <div class="step-header">
      <h2>步驟 1/3</h2>
      <h3>選擇 AI 服務</h3>
      <p>選擇你想使用的 AI 服務商</p>
    </div>

    <!-- 服務商選擇器 -->
    <div class="provider-selector">
      <button
        v-for="provider in allProviders"
        :key="provider"
        class="provider-option"
        :class="{
          selected: selectedProvider === provider,
          disabled: !isProviderImplemented(provider)
        }"
        @click="handleSelectProvider(provider)"
        :disabled="!isProviderImplemented(provider)"
      >
        <span
          class="provider-icon"
          :style="{ color: getProviderConfig(provider).iconColor }"
        >
          {{ getProviderConfig(provider).icon }}
        </span>
        <span class="provider-name">{{ getProviderConfig(provider).name }}</span>
        <span v-if="!isProviderImplemented(provider)" class="coming-soon">即將推出</span>
      </button>
    </div>

    <!-- API Key 輸入 -->
    <div class="form-group">
      <label :for="`api-key-${selectedProvider}`">
        {{ currentConfig.name }} API Key *
      </label>
      <input
        :id="`api-key-${selectedProvider}`"
        v-model="apiKey"
        type="text"
        :placeholder="`輸入你的 ${currentConfig.name} API Key`"
        class="input-field"
        @keyup.enter="handleNext"
        :disabled="isValidating"
      >
      <div v-if="error" class="error-message">{{ error }}</div>
    </div>

    <div class="info-box">
      <p>你的 API Key 只會儲存在瀏覽器中，不會上傳到任何伺服器</p>
    </div>

    <div class="help-link">
      <a @click="openApiKeyHelp">如何取得 {{ currentConfig.name }} API Key？</a>
    </div>

    <div class="button-group">
      <button class="btn-primary" @click="handleNext" :disabled="isValidating">
        {{ isValidating ? '驗證中...' : '下一步' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.step-content {
  padding: 20px 0;
}

.step-header {
  text-align: center;
  margin-bottom: 32px;
}

.step-header h2 {
  font-size: 14px;
  color: #999;
  margin-bottom: 8px;
}

.step-header h3 {
  font-size: 24px;
  color: #333;
  margin-bottom: 8px;
}

.step-header p {
  font-size: 14px;
  color: #666;
}

/* 服務商選擇器 */
.provider-selector {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.provider-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background: var(--color-bg-secondary, #f5f5f5);
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
}

.provider-option:hover:not(.disabled) {
  border-color: #667eea;
  background: #f0f5ff;
}

.provider-option.selected {
  border-color: #667eea;
  background: #f0f5ff;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
}

.provider-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.provider-icon {
  font-size: 28px;
  font-weight: bold;
  line-height: 1;
}

.provider-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.coming-soon {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  color: #999;
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
}

/* 表單 */
.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.input-field {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.3s;
}

.input-field:focus {
  outline: none;
  border-color: #667eea;
}

.input-field:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.error-message {
  margin-top: 8px;
  color: #ff4d4f;
  font-size: 13px;
}

.info-box {
  background: #f0f5ff;
  border-left: 4px solid #667eea;
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 4px;
}

.info-box p {
  font-size: 13px;
  color: #666;
  margin: 0;
}

.help-link {
  text-align: center;
  margin-bottom: 24px;
}

.help-link a {
  color: #667eea;
  text-decoration: none;
  font-size: 14px;
  cursor: pointer;
}

.help-link a:hover {
  text-decoration: underline;
}

.button-group {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.btn-primary {
  background: #667eea;
  color: white;
  border: none;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary:hover:not(:disabled) {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}
</style>
