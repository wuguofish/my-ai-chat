<script setup lang="ts">
const emit = defineEmits<{
  complete: []
  back: []
}>()

const handleComplete = () => {
  emit('complete')
}
</script>

<template>
  <div class="step-content">
    <div class="step-header">
      <h2>步驟 3/3</h2>
      <h3>準備完成！</h3>
      <p>你已經完成基本設定</p>
    </div>

    <div class="content-box">
      <div class="icon">👥</div>
      <h4>新增 AI 好友</h4>
      <p>進入主畫面後，你可以在「好友管理」中新增你的 AI 聊天夥伴。</p>

      <div class="features">
        <div class="feature-item">
          <span class="feature-icon">✏️</span>
          <span>自訂好友性格與說話風格</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon">💬</span>
          <span>建立單聊或群聊</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon">❤️</span>
          <span>發展好友關係</span>
        </div>
      </div>
    </div>

    <div class="button-group">
      <button class="btn-secondary" @click="emit('back')">
        上一步
      </button>
      <button class="btn-primary" @click="handleComplete">
        開始使用
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

.content-box {
  background: #f8f9ff;
  border-radius: 12px;
  padding: 32px 24px;
  text-align: center;
  margin-bottom: 32px;
}

.icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.content-box h4 {
  font-size: 20px;
  color: #333;
  margin-bottom: 12px;
}

.content-box > p {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
  margin-bottom: 24px;
}

.features {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
  max-width: 300px;
  margin: 0 auto;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: white;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
}

.feature-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.button-group {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.btn-primary,
.btn-secondary {
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
  border: none;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #f0f0f0;
  color: #666;
}

.btn-secondary:hover {
  background: #e0e0e0;
}
</style>
