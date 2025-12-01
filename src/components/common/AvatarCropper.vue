<script setup lang="ts">
import { ref } from 'vue'
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

const emit = defineEmits<{
  confirm: [croppedImage: string]
  cancel: []
}>()

const props = defineProps<{
  image: string
}>()

const cropperRef = ref<InstanceType<typeof Cropper>>()

const handleConfirm = () => {
  const { canvas } = cropperRef.value!.getResult()
  if (canvas) {
    // 壓縮到 200x200 並轉成 JPEG
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = 200
    tempCanvas.height = 200
    const ctx = tempCanvas.getContext('2d')

    if (ctx) {
      ctx.drawImage(canvas, 0, 0, 200, 200)
      const croppedImage = tempCanvas.toDataURL('image/jpeg', 0.7)
      emit('confirm', croppedImage)
    }
  }
}

const handleCancel = () => {
  emit('cancel')
}
</script>

<template>
  <div class="avatar-cropper-overlay">
    <div class="cropper-modal">
      <div class="cropper-header">
        <h3>裁剪頭像</h3>
        <button class="close-btn" @click="handleCancel">✕</button>
      </div>

      <div class="cropper-body">
        <Cropper
          ref="cropperRef"
          class="cropper"
          :src="props.image"
          :stencil-props="{
            aspectRatio: 1
          }"
        />
      </div>

      <div class="cropper-footer">
        <button class="btn-secondary" @click="handleCancel">
          取消
        </button>
        <button class="btn-primary" @click="handleConfirm">
          確認
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.avatar-cropper-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.cropper-modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.cropper-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e0e0e0;
}

.cropper-header h3 {
  font-size: 18px;
  color: #333;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.3s;
}

.close-btn:hover {
  background: #f0f0f0;
  color: #666;
}

.cropper-body {
  padding: 24px;
  flex: 1;
  overflow: hidden;
}

.cropper {
  height: 400px;
  max-height: 60vh;
  background: #f5f5f5;
}

.cropper-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e0e0e0;
}

.btn-primary,
.btn-secondary {
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 14px;
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
}

.btn-secondary {
  background: #f0f0f0;
  color: #666;
}

.btn-secondary:hover {
  background: #e0e0e0;
}
</style>
