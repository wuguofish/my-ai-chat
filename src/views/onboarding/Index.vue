<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import Step1ApiKey from './Step1ApiKey.vue'
import Step2Profile from './Step2Profile.vue'
import Step3Character from './Step3Character.vue'

const router = useRouter()
const userStore = useUserStore()

const currentStep = ref(1)

const handleStep1Complete = () => {
  currentStep.value = 2
}

const handleStep2Complete = () => {
  currentStep.value = 3
}

const handleStep3Complete = () => {
  // 完成引導，進入主畫面
  router.push('/main')
}
</script>

<template>
  <div class="onboarding">
    <div class="onboarding-container">
      <!-- 歡迎畫面 -->
      <div v-if="currentStep === 0" class="welcome-screen">
        <h1>歡迎使用愛聊天</h1>
        <p>與你的 AI 角色們開始對話</p>
        <button class="btn-primary" @click="currentStep = 1">
          開始設定
        </button>
      </div>

      <!-- 步驟 1: API Key -->
      <Step1ApiKey
        v-if="currentStep === 1"
        @next="handleStep1Complete"
      />

      <!-- 步驟 2: 個人資料 -->
      <Step2Profile
        v-if="currentStep === 2"
        @next="handleStep2Complete"
        @back="currentStep = 1"
      />

      <!-- 步驟 3: 建立角色 -->
      <Step3Character
        v-if="currentStep === 3"
        @complete="handleStep3Complete"
        @back="currentStep = 2"
      />

      <!-- 步驟指示器 -->
      <div v-if="currentStep > 0" class="step-indicator">
        <div
          v-for="step in 3"
          :key="step"
          class="step-dot"
          :class="{ active: currentStep === step, completed: currentStep > step }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.onboarding-container {
  width: 90%;
  max-width: 500px;
  min-height: 400px;
  background: white;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
}

.welcome-screen {
  text-align: center;
  padding: 40px 0;
}

.welcome-screen h1 {
  font-size: 32px;
  margin-bottom: 16px;
  color: #333;
}

.welcome-screen p {
  font-size: 18px;
  color: #666;
  margin-bottom: 40px;
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

.step-indicator {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 32px;
}

.step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ddd;
  transition: all 0.3s;
}

.step-dot.active {
  background: #667eea;
  transform: scale(1.2);
}

.step-dot.completed {
  background: #52c41a;
}
</style>
