/**
 * 角色卡匯出/匯入功能
 * 將角色資料嵌入 PNG 圖片中
 */

import type { Character } from '@/types'
import { embedDataInPNG, extractDataFromPNG } from './pngSteganography'
import { CURRENT_VERSION } from './version'

/**
 * 匯出角色卡為 PNG 圖片
 * @param character 角色資料
 * @param affection 好感度（可選，用於決定稀有度）
 * @param authorName 作者名稱（可選，用於署名）
 * @param existingMetadata 現有的 metadata（匯入時保留的）
 * @param hidePrivateSettings 是否隱藏詳細設定（預設 false）
 * @returns PNG 圖片的 Data URL
 */
export async function exportCharacterCard(
  character: Character,
  affection: number = 0,
  authorName?: string,
  existingMetadata?: {
    author?: string
    contributors?: string[]
    exportVersion?: string
  },
  hidePrivateSettings: boolean = false
): Promise<string> {
  // 準備作者資訊
  let author: string | undefined
  let contributors: string[] = []

  if (existingMetadata?.author) {
    // 已有原作者，保留
    author = existingMetadata.author
    contributors = existingMetadata.contributors || []

    // 如果當前使用者不是原作者，且不在貢獻者名單中，加入貢獻者
    if (authorName && authorName !== author && !contributors.includes(authorName)) {
      contributors = [...contributors, authorName]
    }
  } else {
    // 首次匯出，設定原作者
    author = authorName
    contributors = []
  }

  // 準備要匯出的角色資料（移除好感度和記憶相關欄位）
  const exportData = {
    name: character.name,
    avatar: character.avatar,
    age: character.age,
    gender: character.gender,
    profession: character.profession,
    // 如果隱藏設定，這些欄位設為空字串或省略
    personality: hidePrivateSettings ? '' : character.personality,
    speakingStyle: hidePrivateSettings ? '' : character.speakingStyle,
    background: hidePrivateSettings ? '' : character.background,
    likes: hidePrivateSettings ? '' : character.likes,
    dislikes: hidePrivateSettings ? '' : character.dislikes,
    events: hidePrivateSettings ? [] : ((character as any).events || []),
    systemPrompt: character.systemPrompt,
    maxOutputTokens: character.maxOutputTokens,
    activeHours: character.activeHours,
    activePeriods: character.activePeriods,
    createdAt: character.createdAt,
    // 添加元資料
    _metadata: {
      exportVersion: CURRENT_VERSION, // 使用當前 app 版本
      exportTime: new Date().toISOString(),
      appName: '愛茶的 AI Chat',
      author, // 原始創作者
      contributors: contributors.length > 0 ? contributors : undefined, // 貢獻者列表（如果有的話）
      isPrivate: hidePrivateSettings // 標記是否為隱藏設定
    }
  }

  // 創建角色卡片（傳入好感度用於抽卡，以及作者資訊）
  const cardImage = await createCharacterCardImage(character, affection, author)

  // 將角色資料嵌入 PNG 圖片
  const pngWithData = await embedDataInPNG(cardImage, exportData, 'CharacterCard')

  return pngWithData
}

/**
 * 從 PNG 圖片匯入角色卡
 * @param imageDataUrl PNG 圖片的 Data URL
 * @returns 角色資料（不包含 ID，需要由呼叫者生成新 ID）
 */
export async function importCharacterCard(imageDataUrl: string): Promise<Partial<Character> | null> {
  try {
    // 從 PNG 提取角色資料
    const data = await extractDataFromPNG<{
      name: string
      avatar: string
      age?: string
      gender?: Character['gender']
      profession?: string
      personality: string
      speakingStyle: string
      background?: string
      likes?: string
      dislikes?: string
      events?: string[]
      systemPrompt?: string
      maxOutputTokens?: number
      activeHours?: Character['activeHours']
      activePeriods?: Character['activePeriods']
      createdAt?: string
      _metadata?: {
        exportVersion: string
        exportTime: string
        appName: string
        author?: string
        contributors?: string[]
        isPrivate?: boolean
      }
    }>(imageDataUrl, 'CharacterCard')

    if (!data) {
      return null
    }

    // Debug: 顯示解析出的資料
    console.log('[Character Import Debug] 解析出的資料 keys:', Object.keys(data))
    console.log('[Character Import Debug] name:', data.name)
    console.log('[Character Import Debug] personality:', data.personality ? '有' : '無')
    console.log('[Character Import Debug] speakingStyle:', data.speakingStyle ? '有' : '無')
    console.log('[Character Import Debug] isPrivate:', data._metadata?.isPrivate)

    // 驗證必要欄位
    // name 是必須的，personality 只有在非隱藏設定時才是必須的
    if (!data.name) {
      console.error('[Character Import Debug] 缺少必要欄位（name）！')
      throw new Error('角色卡資料不完整：缺少角色名稱')
    }

    // 如果不是隱藏設定，personality 是必須的
    if (!data._metadata?.isPrivate && !data.personality) {
      console.error('[Character Import Debug] 缺少必要欄位（personality）！')
      throw new Error('角色卡資料不完整：缺少性格描述')
    }

    // 返回角色資料（使用原始頭像，而非角色卡圖片）
    // 所有欄位都允許為空，匯入時保留原值或使用空值
    return {
      name: data.name,
      avatar: data.avatar || '', // 使用 JSON 中儲存的原始頭像，或留空
      age: data.age || undefined,
      gender: data.gender || undefined,
      profession: data.profession || undefined,
      personality: data.personality,
      speakingStyle: data.speakingStyle || '', // 允許為空
      background: data.background || '',
      likes: data.likes || undefined,
      dislikes: data.dislikes || undefined,
      events: data.events || [],
      systemPrompt: data.systemPrompt || undefined,
      maxOutputTokens: data.maxOutputTokens || undefined,
      activeHours: data.activeHours || undefined,
      activePeriods: data.activePeriods || undefined,
      createdAt: data.createdAt || undefined,
      // 標記是否為隱藏設定的名片
      isPrivate: data._metadata?.isPrivate || false,
      // 保留原始 metadata（作者資訊）
      importedMetadata: data._metadata ? {
        author: data._metadata.author,
        contributors: data._metadata.contributors,
        exportVersion: data._metadata.exportVersion,
        exportTime: data._metadata.exportTime,
        appName: data._metadata.appName
      } : undefined
    }
  } catch (error) {
    console.error('匯入角色卡失敗:', error)
    return null
  }
}

/**
 * 下載角色卡為 PNG 檔案
 * @param character 角色資料
 * @param affection 好感度（用於決定稀有度）
 * @param authorName 作者名稱（可選，用於署名）
 * @param existingMetadata 現有的 metadata（如果角色是匯入的，保留原作者資訊）
 * @param hidePrivateSettings 是否隱藏詳細設定（預設 false）
 */
export async function downloadCharacterCard(
  character: Character,
  affection: number = 0,
  authorName?: string,
  existingMetadata?: {
    author?: string
    contributors?: string[]
    exportVersion?: string
  },
  hidePrivateSettings: boolean = false
): Promise<void> {
  try {
    // 匯出角色卡（傳入好感度、作者名稱、現有 metadata 和隱藏設定選項）
    const pngDataUrl = await exportCharacterCard(character, affection, authorName, existingMetadata, hidePrivateSettings)

    // 創建下載連結
    const link = document.createElement('a')
    link.href = pngDataUrl
    link.download = `${character.name}_角色卡.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } catch (error) {
    console.error('下載角色卡失敗:', error)
    throw error
  }
}

/**
 * 從檔案讀取角色卡
 * @param file PNG 檔案
 * @returns 角色資料
 */
export async function readCharacterCardFromFile(file: File): Promise<Partial<Character> | null> {
  // 檢查檔案類型
  if (!file.type.startsWith('image/')) {
    throw new Error('請選擇圖片檔案')
  }

  // 讀取檔案為 Data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  // 匯入角色卡
  return importCharacterCard(dataUrl)
}

/**
 * 創建預設頭像（當角色沒有頭像時使用）
 * @param name 角色名稱
 * @returns PNG Data URL
 */
async function createDefaultAvatar(name: string): Promise<string> {
  // 創建 canvas
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 200
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('無法創建 canvas context')
  }

  // 繪製背景（使用名稱的第一個字生成顏色）
  const hue = name.charCodeAt(0) % 360
  ctx.fillStyle = `hsl(${hue}, 70%, 60%)`
  ctx.fillRect(0, 0, 200, 200)

  // 繪製文字（名稱的第一個字）
  ctx.fillStyle = 'white'
  ctx.font = 'bold 80px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name.charAt(0), 100, 100)

  // 轉換為 PNG Data URL
  return canvas.toDataURL('image/png')
}

/**
 * 稀有度類型
 */
type RarityType = 'R' | 'SR' | 'SSR' | 'UR'

/**
 * 根據好感度抽取稀有度
 * @param affection 好感度
 * @returns 稀有度
 */
function drawRarity(affection: number = 0): RarityType {
  // 根據好感度調整機率
  // stranger (0-10): R 80%, SR 15%, SSR 4%, UR 1%
  // acquaintance (10-30): R 60%, SR 25%, SSR 12%, UR 3%
  // friend (30-80): R 40%, SR 35%, SSR 20%, UR 5%
  // close_friend (80-200): R 20%, SR 30%, SSR 35%, UR 15%
  // soulmate (200+): R 10%, SR 20%, SSR 40%, UR 30%

  let rWeights = { R: 80, SR: 15, SSR: 4, UR: 1 }

  if (affection >= 200) {
    rWeights = { R: 10, SR: 20, SSR: 40, UR: 30 }
  } else if (affection >= 80) {
    rWeights = { R: 20, SR: 30, SSR: 35, UR: 15 }
  } else if (affection >= 30) {
    rWeights = { R: 40, SR: 35, SSR: 20, UR: 5 }
  } else if (affection >= 10) {
    rWeights = { R: 60, SR: 25, SSR: 12, UR: 3 }
  }

  const random = Math.random() * 100
  let cumulative = 0

  for (const [rarity, weight] of Object.entries(rWeights)) {
    cumulative += weight
    if (random < cumulative) {
      return rarity as RarityType
    }
  }

  return 'R'
}

/**
 * 取得稀有度的顏色和樣式
 */
function getRarityStyle(rarity: RarityType): { color: string; gradient: string; glow: string } {
  switch (rarity) {
    case 'UR':
      return {
        color: '#ff66ff',
        gradient: 'linear-gradient(135deg, #ff6ec4 0%, #7873f5 50%, #4facfe 100%)',
        glow: '0 0 20px rgba(255, 102, 255, 0.8)'
      }
    case 'SSR':
      return {
        color: '#ffd700',
        gradient: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
        glow: '0 0 15px rgba(255, 215, 0, 0.6)'
      }
    case 'SR':
      return {
        color: '#9370db',
        gradient: 'linear-gradient(135deg, #a8c0ff 0%, #9370db 100%)',
        glow: '0 0 10px rgba(147, 112, 219, 0.5)'
      }
    case 'R':
    default:
      return {
        color: '#4facfe',
        gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        glow: '0 0 8px rgba(79, 172, 254, 0.4)'
      }
  }
}

/**
 * 創建角色卡片圖片（CharacterDetail 風格）
 * @param character 角色資料
 * @param affection 好感度（用於決定稀有度）
 * @param author 作者名稱（可選，用於顯示推薦人）
 * @returns PNG Data URL
 */
async function createCharacterCardImage(character: Character, affection: number = 0, author?: string): Promise<string> {
  // 抽取稀有度
  const rarity = drawRarity(affection)
  const rarityStyle = getRarityStyle(rarity)

  // 準備角色頭像
  let avatarDataUrl = character.avatar
  if (!avatarDataUrl) {
    avatarDataUrl = await createDefaultAvatar(character.name)
  }

  // 創建 canvas（縮短高度，更緊湊）
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 500
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('無法創建 canvas context')
  }

  // 繪製邊框區塊（紫色漸層背景）
  const borderGradient = ctx.createLinearGradient(0, 0, 400, 500)
  // 解析 gradient 字串
  if (rarity === 'UR') {
    borderGradient.addColorStop(0, '#ff6ec4')
    borderGradient.addColorStop(0.5, '#7873f5')
    borderGradient.addColorStop(1, '#4facfe')
  } else if (rarity === 'SSR') {
    borderGradient.addColorStop(0, '#f7971e')
    borderGradient.addColorStop(1, '#ffd200')
  } else if (rarity === 'SR') {
    borderGradient.addColorStop(0, '#a8c0ff')
    borderGradient.addColorStop(1, '#9370db')
  } else {
    borderGradient.addColorStop(0, '#4facfe')
    borderGradient.addColorStop(1, '#00f2fe')
  }
  ctx.fillStyle = borderGradient
  ctx.fillRect(0, 0, 400, 500)

  // 繪製角色卡片區域（根據稀有度的漸層背景，滿版）
  const cardGradient = ctx.createLinearGradient(0, 0, 400, 500)

  // 根據稀有度設定漸層顏色（與 header 紫色漸層相近，但加入稀有度色調）
  if (rarity === 'UR') {
    cardGradient.addColorStop(0, '#7873f5')  // 偏紫
    cardGradient.addColorStop(0.5, '#ff6ec4') // UR 粉紅
    cardGradient.addColorStop(1, '#9370db')   // 偏紫
  } else if (rarity === 'SSR') {
    cardGradient.addColorStop(0, '#764ba2')   // 深紫
    cardGradient.addColorStop(0.5, '#ffd700') // SSR 金色
    cardGradient.addColorStop(1, '#f7971e')   // 橘金
  } else if (rarity === 'SR') {
    cardGradient.addColorStop(0, '#667eea')   // header 起始色
    cardGradient.addColorStop(1, '#9370db')   // SR 紫色
  } else {
    // R 卡使用接近 header 的紫藍漸層
    cardGradient.addColorStop(0, '#667eea')
    cardGradient.addColorStop(1, '#4facfe')
  }

  ctx.fillStyle = cardGradient
  ctx.beginPath()
  ctx.roundRect(5, 5, 390, 490, 16)
  ctx.fill()

  // 載入並繪製 logo
  try {
    const logoImg = new Image()
    logoImg.crossOrigin = 'anonymous'
    await new Promise((resolve) => {
      logoImg.onload = resolve
      logoImg.onerror = () => resolve(null) // logo 載入失敗就跳過
      logoImg.src = '/my-ai-chat/logo.svg'
    })

    if (logoImg.complete && logoImg.width > 0) {
      ctx.drawImage(logoImg, 30, 30, 40, 40)
    }
  } catch (e) {
    // logo 載入失敗就跳過
  }

  // 繪製品牌文字
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 20px "jfOpenHuninn", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('愛茶的 AI Chat', 80, 55)

  // 繪製副標題
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.font = '12px "Iansui", sans-serif'
  ctx.fillText('和專屬於你的 AI 夥伴們泡茶聊天', 80, 70)

  // 繪製角色頭像（圓形，帶邊框，往上移且加大）
  const avatarImg = new Image()
  await new Promise((resolve, reject) => {
    avatarImg.onload = () => resolve(null)
    avatarImg.onerror = () => reject(new Error('頭像載入失敗'))
    avatarImg.src = avatarDataUrl
  })

  const avatarSize = 160  // 加大頭像
  const avatarX = 200
  const avatarY = 220  // 更置中

  // 頭像外圈光暈（根據稀有度）
  ctx.shadowColor = rarityStyle.color
  ctx.shadowBlur = 20
  ctx.beginPath()  
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 8, 0, Math.PI * 2)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fill()
  
  ctx.shadowBlur = 0

  // 繪製頭像
  ctx.save()
  ctx.beginPath()
  ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(
    avatarImg,
    avatarX - avatarSize / 2,
    avatarY - avatarSize / 2,
    avatarSize,
    avatarSize
  )
  ctx.restore()

  // 繪製角色名稱（加大字體，改用白色）
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 36px "jfOpenHuninn", sans-serif'
  ctx.textAlign = 'center'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
  ctx.shadowBlur = 8
  ctx.fillText(character.name, 200, 350)
  ctx.shadowBlur = 0

  // 繪製性別/年齡/職業標籤（分兩列）
  const genderText = character.gender === 'male' ? '男' : character.gender === 'female' ? '女' : '未設定'
  const ageText = character.age ? `${character.age}歲` : ''
  const professionText = character.profession || ''

  // 先設定字體以便測量文字寬度
  ctx.font = 'bold 16px "Iansui", sans-serif'

  // 第一列：性別 + 年齡
  const firstRowTags = [genderText, ageText].filter(t => t)
  if (firstRowTags.length > 0) {
    const firstRowWidths = firstRowTags.map(tag => {
      const textWidth = ctx.measureText(tag).width
      return Math.max(textWidth + 20, 60)
    })
    const firstRowTotalWidth = firstRowWidths.reduce((sum, w) => sum + w + 10, -10)
    let tagX = 200 - firstRowTotalWidth / 2

    firstRowTags.forEach((tag, index) => {
      const tagWidth = firstRowWidths[index] || 60

      // 繪製標籤背景（半透明白色）
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.beginPath()
      ctx.roundRect(tagX, 370, tagWidth, 32, 16)
      ctx.fill()

      // 繪製標籤文字（白色）
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.fillText(tag, tagX + tagWidth / 2, 390)

      tagX += tagWidth + 10
    })
  }

  // 第二列：職業
  if (professionText) {
    const professionWidth = Math.max(ctx.measureText(professionText).width + 20, 80)
    const professionX = 200 - professionWidth / 2

    // 繪製標籤背景（半透明白色）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.beginPath()
    ctx.roundRect(professionX, 410, professionWidth, 32, 16)
    ctx.fill()

    // 繪製標籤文字（白色）
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText(professionText, 200, 430)
  }

  // 繪製稀有度 Badge（右上角）
  const badgeX = 330
  const badgeY = 110

  // Badge 背景（白色）
  ctx.shadowColor = rarityStyle.color
  ctx.shadowBlur = 15
  ctx.beginPath()
  ctx.roundRect(badgeX - 40, badgeY - 15, 80, 40, 20)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.shadowBlur = 0

  // Badge 邊框（稀有度顏色）
  ctx.beginPath()
  ctx.roundRect(badgeX - 40, badgeY - 15, 80, 40, 20)
  ctx.strokeStyle = rarityStyle.color
  ctx.lineWidth = 3
  ctx.stroke()

  // Badge 文字（稀有度顏色）
  ctx.fillStyle = rarityStyle.color
  ctx.font = 'bold 24px Century, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(rarity, badgeX, badgeY + 4)

  // 繪製推薦人資訊（底部）
  if (author) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.font = '12px "Iansui", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const recommenderText = `推薦人：${author}`
    ctx.fillText(recommenderText, 50, 485)
  }

  // 轉換為 PNG Data URL
  return canvas.toDataURL('image/png')
}

/**
 * 驗證角色卡資料的完整性
 * @param data 角色資料
 * @returns 是否有效
 */
export function validateCharacterCard(data: Partial<Character>): boolean {
  return !!(data.name && data.personality && data.speakingStyle)
}
