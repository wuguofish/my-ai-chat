/**
 * PNG 隱寫術工具
 * 將 JSON 資料嵌入 PNG 圖片的 tEXt chunk 中
 */

/**
 * 將 JSON 資料嵌入 PNG 圖片
 * @param imageDataUrl 圖片的 Data URL (base64)
 * @param data 要嵌入的 JSON 資料
 * @param keyword 資料的關鍵字標識（預設：'CharacterCard'）
 * @returns 包含嵌入資料的新 PNG Data URL
 */
export async function embedDataInPNG(
  imageDataUrl: string,
  data: object,
  keyword: string = 'CharacterCard'
): Promise<string> {
  // 將 Data URL 轉換為 ArrayBuffer
  const base64Data = imageDataUrl.split(',')[1]
  if (!base64Data) {
    throw new Error('無效的 Data URL 格式')
  }
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // 檢查是否為有效的 PNG
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
    throw new Error('不是有效的 PNG 圖片')
  }

  // 序列化 JSON 資料
  const jsonString = JSON.stringify(data)
  console.log('[PNG Debug] 嵌入資料，JSON 長度:', jsonString.length, 'characters')

  // 創建 tEXt chunk
  const textChunk = createTextChunk(keyword, jsonString)
  console.log('[PNG Debug] tEXt chunk 大小:', textChunk.length, 'bytes')

  // 找到 IEND chunk 的位置（PNG 的結束標記）
  let iendIndex = -1
  for (let i = 0; i < bytes.length - 7; i++) {
    if (
      bytes[i + 4] === 0x49 && // 'I'
      bytes[i + 5] === 0x45 && // 'E'
      bytes[i + 6] === 0x4E && // 'N'
      bytes[i + 7] === 0x44    // 'D'
    ) {
      iendIndex = i
      break
    }
  }

  if (iendIndex === -1) {
    throw new Error('找不到 PNG 的 IEND chunk')
  }

  console.log('[PNG Debug] IEND 位置:', iendIndex, '原始檔案大小:', bytes.length)

  // 在 IEND 之前插入 tEXt chunk
  const newBytes = new Uint8Array(bytes.length + textChunk.length)
  newBytes.set(bytes.slice(0, iendIndex))
  newBytes.set(textChunk, iendIndex)
  newBytes.set(bytes.slice(iendIndex), iendIndex + textChunk.length)

  console.log('[PNG Debug] 新檔案大小:', newBytes.length, 'bytes')

  // 轉換回 Data URL
  const blob = new Blob([newBytes], { type: 'image/png' })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      console.log('[PNG Debug] 資料嵌入完成！')
      resolve(reader.result as string)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 從 PNG 圖片中提取嵌入的 JSON 資料
 * @param imageDataUrl 圖片的 Data URL (base64)
 * @param keyword 資料的關鍵字標識（預設：'CharacterCard'）
 * @returns 提取的 JSON 物件，如果找不到則返回 null
 */
export async function extractDataFromPNG<T = object>(
  imageDataUrl: string,
  keyword: string = 'CharacterCard'
): Promise<T | null> {
  // 將 Data URL 轉換為 ArrayBuffer
  const base64Data = imageDataUrl.split(',')[1]
  if (!base64Data) {
    throw new Error('無效的 Data URL 格式')
  }
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // 檢查是否為有效的 PNG
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
    throw new Error('不是有效的 PNG 圖片')
  }

  // 尋找 tEXt chunk
  let index = 8 // 跳過 PNG 簽名
  const foundChunks: string[] = [] // Debug: 記錄找到的 chunk 類型

  console.log('[PNG Debug] 開始尋找 tEXt chunk，檔案大小:', bytes.length, 'bytes')

  while (index < bytes.length) {
    // 讀取 chunk 長度
    const b0 = bytes[index] ?? 0
    const b1 = bytes[index + 1] ?? 0
    const b2 = bytes[index + 2] ?? 0
    const b3 = bytes[index + 3] ?? 0
    const length = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3

    // 讀取 chunk 類型
    const t0 = bytes[index + 4] ?? 0
    const t1 = bytes[index + 5] ?? 0
    const t2 = bytes[index + 6] ?? 0
    const t3 = bytes[index + 7] ?? 0
    const type = String.fromCharCode(t0, t1, t2, t3)

    foundChunks.push(type)

    // 如果是 IEND，表示已經到檔案結尾
    if (type === 'IEND') {
      console.log('[PNG Debug] 到達 IEND，找到的 chunks:', foundChunks.join(', '))
      break
    }

    // 如果是 tEXt chunk
    if (type === 'tEXt') {
      console.log('[PNG Debug] 找到 tEXt chunk，長度:', length)
      const dataStart = index + 8
      const dataEnd = dataStart + length
      const chunkData = bytes.slice(dataStart, dataEnd)

      // 找到 null 分隔符（關鍵字和資料之間）
      let nullIndex = -1
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullIndex = i
          break
        }
      }

      if (nullIndex !== -1) {
        // 讀取關鍵字
        const chunkKeyword = new TextDecoder().decode(chunkData.slice(0, nullIndex))
        console.log('[PNG Debug] tEXt chunk keyword:', chunkKeyword)

        // 如果關鍵字匹配
        if (chunkKeyword === keyword) {
          console.log('[PNG Debug] 關鍵字匹配！開始解析 JSON')
          // 讀取資料
          const jsonString = new TextDecoder().decode(chunkData.slice(nullIndex + 1))
          console.log('[PNG Debug] JSON 長度:', jsonString.length, 'characters')
          try {
            const result = JSON.parse(jsonString) as T
            console.log('[PNG Debug] JSON 解析成功！')
            return result
          } catch (error) {
            console.error('[PNG Debug] 解析 JSON 失敗:', error)
            return null
          }
        }
      }
    }

    // 移動到下一個 chunk (長度 + 類型 + 資料 + CRC)
    index += 4 + 4 + length + 4
  }

  console.log('[PNG Debug] 未找到匹配的 tEXt chunk，找到的 chunks:', foundChunks.join(', '))
  return null
}

/**
 * 創建 PNG tEXt chunk
 */
function createTextChunk(keyword: string, text: string): Uint8Array {
  // 關鍵字 + null 分隔符 + 文字
  const keywordBytes = new TextEncoder().encode(keyword)
  const textBytes = new TextEncoder().encode(text)
  const dataLength = keywordBytes.length + 1 + textBytes.length

  // chunk 結構: 長度(4) + 類型(4) + 資料(n) + CRC(4)
  const chunk = new Uint8Array(4 + 4 + dataLength + 4)
  let offset = 0

  // 寫入長度
  chunk[offset++] = (dataLength >> 24) & 0xFF
  chunk[offset++] = (dataLength >> 16) & 0xFF
  chunk[offset++] = (dataLength >> 8) & 0xFF
  chunk[offset++] = dataLength & 0xFF

  // 寫入類型 "tEXt"
  chunk[offset++] = 0x74 // 't'
  chunk[offset++] = 0x45 // 'E'
  chunk[offset++] = 0x58 // 'X'
  chunk[offset++] = 0x74 // 't'

  // 寫入關鍵字
  chunk.set(keywordBytes, offset)
  offset += keywordBytes.length

  // 寫入 null 分隔符
  chunk[offset++] = 0

  // 寫入文字
  chunk.set(textBytes, offset)
  offset += textBytes.length

  // 計算並寫入 CRC
  const crc = calculateCRC(chunk.slice(4, offset))
  chunk[offset++] = (crc >> 24) & 0xFF
  chunk[offset++] = (crc >> 16) & 0xFF
  chunk[offset++] = (crc >> 8) & 0xFF
  chunk[offset++] = crc & 0xFF

  return chunk
}

/**
 * 計算 CRC32 校驗碼
 */
function calculateCRC(data: Uint8Array): number {
  const crcTable = makeCRCTable()
  let crc = 0xFFFFFFFF

  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0
    const tableValue = crcTable[(crc ^ byte) & 0xFF] ?? 0
    crc = (crc >>> 8) ^ tableValue
  }

  return (crc ^ 0xFFFFFFFF) >>> 0
}

/**
 * 生成 CRC 查找表
 */
function makeCRCTable(): Uint32Array {
  const table = new Uint32Array(256)

  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c
  }

  return table
}

/**
 * 檢查圖片是否包含角色卡資料
 */
export async function hasCharacterData(imageDataUrl: string): Promise<boolean> {
  try {
    const data = await extractDataFromPNG(imageDataUrl, 'CharacterCard')
    return data !== null
  } catch {
    return false
  }
}
