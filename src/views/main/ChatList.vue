<script setup lang="ts">
import { computed } from 'vue'
import { useCharacterStore } from '@/stores/characters'
import { useChatRoomsStore } from '@/stores/chatRooms'

const characterStore = useCharacterStore()
const chatRoomStore = useChatRoomsStore()

const characterCount = computed(() => characterStore.characters.length)
const chatRoomCount = computed(() => chatRoomStore.chatRooms.length)
</script>

<template>
  <div class="chat-list">
    <div class="header">
      <h2>聊天</h2>
    </div>

    <div class="empty-state">
      <div class="empty-icon">💭</div>
      <h3>聊天功能開發中</h3>
      <p>目前你有 {{ characterCount }} 位好友</p>
      <p>{{ chatRoomCount }} 個聊天室</p>
      <div class="info-box">
        <h4>即將推出：</h4>
        <ul>
          <li>單人聊天室</li>
          <li>群聊功能（最多15位好友）</li>
          <li>對話記錄管理</li>
          <li>記憶系統</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-list {
  min-height: 100vh;
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: white;
  padding: 20px;
  border-bottom: 2px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header h2 {
  font-size: 28px;
  color: #333;
  margin: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  max-width: 1200px;
  margin: 0 auto;
}

.empty-icon {
  font-size: 80px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 24px;
  color: #333;
  margin-bottom: 12px;
}

.empty-state p {
  font-size: 16px;
  color: #666;
  margin-bottom: 8px;
}

.info-box {
  margin-top: 32px;
  padding: 24px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  text-align: left;
  max-width: 400px;
}

.info-box h4 {
  font-size: 18px;
  color: #333;
  margin: 0 0 16px 0;
}

.info-box ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.info-box li {
  padding: 8px 0;
  color: #666;
  font-size: 14px;
}

.info-box li::before {
  content: '✓ ';
  color: #667eea;
  font-weight: bold;
  margin-right: 8px;
}
</style>
