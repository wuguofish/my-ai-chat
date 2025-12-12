#!/usr/bin/env node
/**
 * 檢查好友名片 PNG 中嵌入的資料
 * 用法: node scripts/check-card-data.js <png檔案路徑>
 */

const fs = require('fs')
const path = require('path')

function extractDataFromPNG(filePath) {
  const bytes = fs.readFileSync(filePath)

  // 檢查 PNG 簽名
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
    throw new Error('不是有效的 PNG 圖片')
  }

  console.log('✅ 有效的 PNG 圖片，檔案大小:', bytes.length, 'bytes\n')

  // 尋找 tEXt chunk
  let index = 8 // 跳過 PNG 簽名
  const foundChunks = []

  while (index < bytes.length) {
    const length = (bytes[index] << 24) | (bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3]
    const type = String.fromCharCode(bytes[index + 4], bytes[index + 5], bytes[index + 6], bytes[index + 7])

    foundChunks.push(type)

    if (type === 'IEND') break

    if (type === 'tEXt') {
      const dataStart = index + 8
      const dataEnd = dataStart + length
      const chunkData = bytes.slice(dataStart, dataEnd)

      // 找到 null 分隔符
      let nullIndex = -1
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullIndex = i
          break
        }
      }

      if (nullIndex !== -1) {
        const keyword = chunkData.slice(0, nullIndex).toString('utf8')

        if (keyword === 'CharacterCard') {
          const jsonString = chunkData.slice(nullIndex + 1).toString('utf8')
          const data = JSON.parse(jsonString)
          return data
        }
      }
    }

    index += 4 + 4 + length + 4
  }

  console.log('找到的 chunks:', foundChunks.join(', '))
  return null
}

// 主程式
const filePath = process.argv[2]

if (!filePath) {
  console.log('用法: node scripts/check-card-data.js <png檔案路徑>')
  console.log('範例: node scripts/check-card-data.js ~/Downloads/趙書煜_角色卡.png')
  process.exit(1)
}

const absolutePath = path.resolve(filePath)

if (!fs.existsSync(absolutePath)) {
  console.error('❌ 檔案不存在:', absolutePath)
  process.exit(1)
}

console.log('📄 檢查檔案:', absolutePath)
console.log('=' .repeat(60))

try {
  const data = extractDataFromPNG(absolutePath)

  if (!data) {
    console.log('❌ 這張圖片不包含好友名片資料')
    process.exit(1)
  }

  console.log('✅ 找到好友名片資料！\n')
  console.log('📋 基本資料:')
  console.log('   名稱:', data.name)
  console.log('   年齡:', data.age || '未設定')
  console.log('   性別:', data.gender || '未設定')
  console.log('   職業:', data.profession || '未設定')

  console.log('\n📅 作息設定:')
  console.log('   activeHours:', data.activeHours ? JSON.stringify(data.activeHours) : '❌ 無')
  console.log('   activePeriods:', data.activePeriods ? `✅ 有 (${data.activePeriods.length} 個時段)` : '❌ 無')
  console.log('   schedule:', data.schedule ? '✅ 有 (新格式)' : '❌ 無')

  if (data.activePeriods && data.activePeriods.length > 0) {
    console.log('\n   activePeriods 詳細:')
    data.activePeriods.forEach((p, i) => {
      console.log(`     ${i + 1}. ${p.start}:00 - ${p.end}:00 → ${p.status}`)
    })
  }

  if (data.schedule) {
    console.log('\n   schedule 詳細 (新格式):')
    console.log('   【平日】')
    data.schedule.workdayPeriods?.forEach((p, i) => {
      console.log(`     ${i + 1}. ${p.start}:00 - ${p.end}:00 → ${p.status}`)
    })
    console.log('   【假日】')
    data.schedule.holidayPeriods?.forEach((p, i) => {
      console.log(`     ${i + 1}. ${p.start}:00 - ${p.end}:00 → ${p.status}`)
    })
  }

  console.log('\n📦 Metadata:')
  if (data._metadata) {
    console.log('   版本:', data._metadata.exportVersion)
    console.log('   匯出時間:', data._metadata.exportTime)
    console.log('   作者:', data._metadata.author || '未設定')
  } else {
    console.log('   ❌ 無 metadata')
  }

} catch (error) {
  console.error('❌ 錯誤:', error.message)
  process.exit(1)
}
