import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// 取得當前檔案的目錄路徑
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 檔案路徑
const versionPath = join(__dirname, '../public/version.json')
const changelogPath = join(__dirname, '../public/CHANGELOG.md')

try {
  // 從 CHANGELOG.md 讀取最新版本號
  const changelogContent = readFileSync(changelogPath, 'utf-8')

  // 匹配 ## [版本號] 格式（例如：## [1.3.2] - 2025-12-04）
  const versionMatch = changelogContent.match(/##\s*\[([^\]]+)\]/)

  if (!versionMatch) {
    throw new Error('無法從 CHANGELOG.md 找到版本號，請確認格式為：## [版本號]')
  }

  const latestVersion = versionMatch[1]

  // 讀取現有的 version.json
  const versionData = JSON.parse(readFileSync(versionPath, 'utf-8'))

  // 更新版本號和時間
  versionData.version = latestVersion
  versionData.updateTime = new Date().toISOString()

  // 寫回檔案（格式化 JSON，縮排 2 空格）
  writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n', 'utf-8')

  console.log('✅ 版本資訊已更新')
  console.log('📦 版本號:', versionData.version)
  console.log('🕐 更新時間:', versionData.updateTime)
} catch (error) {
  console.error('❌ 更新版本資訊失敗:', error.message)
  process.exit(1)
}
