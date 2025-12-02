<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  next: []
}>()

const apiKey = ref('')
const error = ref('')

const handleNext = () => {
  if (!apiKey.value.trim()) {
    error.value = '請輸入 API Key'
    return
  }

  // 簡單驗證格式（Gemini API Key 通常以 AIza 開頭）
  if (!apiKey.value.startsWith('AIza')) {
    error.value = 'API Key 格式不正確，應該以 AIza 開頭'
    return
  }

  // 暫存 API Key（稍後在步驟 2 會一起儲存）
  sessionStorage.setItem('temp-api-key', apiKey.value)
  error.value = ''
  emit('next')
}

const openApiKeyHelp = () => {
  window.open('https://makersuite.google.com/app/apikey', '_blank')
}
</script>

<template>
  <div class="step-content">
    <div class="step-header">
      <h2>步驟 1/3</h2>
      <h3>設定 API Key</h3>
      <p>請輸入你的 Gemini API Key</p>
    </div>

    <div class="form-group">
      <label for="api-key">Gemini API Key *</label>
      <input
        id="api-key"
        v-model="apiKey"
        type="text"
        placeholder="AIza..."
        class="input-field"
        @keyup.enter="handleNext"
      >
      <div v-if="error" class="error-message">{{ error }}</div>
    </div>

    <div class="info-box">
      <p>💡 你的 API Key 只會儲存在瀏覽器中，不會上傳到任何伺服器</p>
    </div>

    <div class="help-link">
      <a @click="openApiKeyHelp">🔗 如何取得 API Key？</a>
    </div>

    <div class="button-group">
      <button class="btn-primary" @click="handleNext">
        下一步
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

.btn-primary:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
</style>
