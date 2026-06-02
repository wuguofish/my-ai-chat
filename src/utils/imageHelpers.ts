/**
 * 圖片處理工具
 * 用於聊天訊息的圖片壓縮、驗證和轉換
 */

import { v4 as uuidv4 } from 'uuid'
import { LIMITS, IMAGE_CONSTANTS } from './constants'
import type { ImageAttachment } from '@/types'

/**
 * 檢查是否為支援的圖片類型
 */
export function isValidImageType(file: File): boolean {
  return IMAGE_CONSTANTS.SUPPORTED_TYPES.includes(file.type as typeof IMAGE_CONSTANTS.SUPPORTED_TYPES[number])
}

/**
 * 從貼上事件中取得圖片檔案
 */
export function getImageFromPaste(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items
  if (!items) return null

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file && isValidImageType(file)) {
        return file
      }
    }
  }
  return null
}

/**
 * 計算 Base64 字串的大小（位元組）
 */
export function getBase64Size(base64: string): number {
  // 移除 data:image/xxx;base64, 前綴
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64
  if (!base64Data) return 0

  // Base64 編碼的大小約為原始大小的 4/3
  const padding = (base64Data.match(/=+$/) || [''])[0].length
  return Math.floor((base64Data.length * 3) / 4) - padding
}

/**
 * 從 Base64 字串中提取純資料（不含 data: 前綴）
 */
export function extractBase64Data(dataUrl: string): string {
  if (dataUrl.includes(',')) {
    return dataUrl.split(',')[1] || ''
  }
  return dataUrl
}

/**
 * 從 Base64 字串中提取 MIME 類型
 */
export function extractMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/)
  return match?.[1] || IMAGE_CONSTANTS.DEFAULT_MIME_TYPE
}

/**
 * 載入圖片檔案為 HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('圖片載入失敗'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('檔案讀取失敗'))
    reader.readAsDataURL(file)
  })
}

/**
 * 計算壓縮後的尺寸（保持比例）
 */
function calculateResizedDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height }
  }

  const ratio = Math.min(maxWidth / width, maxHeight / height)
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio)
  }
}

/**
 * 使用 Canvas 壓縮圖片
 */
async function compressWithCanvas(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  quality: number,
  mimeType: string
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('無法建立 Canvas context')
  }

  // 使用高品質縮放
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

  // 輸出為指定格式（GIF 不支援 quality 參數，轉為 PNG）
  const outputType = mimeType === 'image/gif' ? 'image/png' : mimeType
  return canvas.toDataURL(outputType, quality)
}

/**
 * 壓縮圖片
 * 自動調整尺寸和品質，確保輸出大小在限制內
 */
export async function compressImage(file: File): Promise<ImageAttachment> {
  // 驗證圖片類型
  if (!isValidImageType(file)) {
    throw new Error(`不支援的圖片格式：${file.type}`)
  }

  const maxSizeBytes = LIMITS.MAX_IMAGE_SIZE_KB * 1024
  const img = await loadImage(file)

  // 計算目標尺寸
  const { width, height } = calculateResizedDimensions(
    img.width,
    img.height,
    LIMITS.MAX_IMAGE_WIDTH,
    LIMITS.MAX_IMAGE_HEIGHT
  )

  // 決定輸出格式（保持原格式，GIF 轉為 PNG）
  const mimeType = file.type === 'image/gif' ? 'image/png' : file.type

  // 漸進式品質壓縮
  let result: string = ''
  let finalSize = 0

  for (const quality of IMAGE_CONSTANTS.QUALITY_STEPS) {
    result = await compressWithCanvas(img, width, height, quality, mimeType)
    finalSize = getBase64Size(result)

    if (finalSize <= maxSizeBytes) {
      break
    }
  }

  // 如果仍然太大，進一步縮小尺寸
  if (finalSize > maxSizeBytes) {
    const scaleFactor = Math.sqrt(maxSizeBytes / finalSize)
    const newWidth = Math.round(width * scaleFactor)
    const newHeight = Math.round(height * scaleFactor)

    const lowestQuality = IMAGE_CONSTANTS.QUALITY_STEPS[IMAGE_CONSTANTS.QUALITY_STEPS.length - 1] ?? 0.5
    result = await compressWithCanvas(
      img,
      newWidth,
      newHeight,
      lowestQuality,
      mimeType
    )
  }

  // 提取最終尺寸
  const finalImg = new Image()
  await new Promise<void>((resolve) => {
    finalImg.onload = () => resolve()
    finalImg.src = result
  })

  return {
    id: uuidv4(),
    data: result,
    mimeType: extractMimeType(result),
    width: finalImg.width,
    height: finalImg.height
  }
}

/**
 * 批次壓縮多張圖片
 */
export async function compressImages(files: File[]): Promise<ImageAttachment[]> {
  const limitedFiles = files.slice(0, LIMITS.MAX_IMAGES_PER_MESSAGE)
  const results = await Promise.all(limitedFiles.map(compressImage))
  return results
}

/**
 * 將 ImageAttachment 轉換為 LLM 可用的格式
 * 回傳不含 data: 前綴的 Base64 字串
 */
export function imageAttachmentToLLMFormat(attachment: ImageAttachment): {
  mimeType: string
  data: string
} {
  return {
    mimeType: attachment.mimeType,
    data: extractBase64Data(attachment.data)
  }
}
