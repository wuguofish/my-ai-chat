/**
 * 版本管理工具
 */

// 當前版本號（每次更新時記得更新這個值）
export const CURRENT_VERSION = '1.3.0'

/**
 * 版本資訊介面
 */
export interface VersionInfo {
  version: string
  date: string
  features: string[]
}

// 快取的 CHANGELOG 資料
let cachedChangelog: VersionInfo[] | null = null

/**
 * 從伺服器取得 CHANGELOG.md 並解析
 */
export async function fetchChangelog(): Promise<VersionInfo[]> {
  // 如果已經快取，直接返回
  if (cachedChangelog) {
    return cachedChangelog
  }

  try {
    const timestamp = new Date().getTime()
    const response = await fetch(`/CHANGELOG.md?t=${timestamp}`, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache'
      }
    })

    if (!response.ok) {
      console.warn('無法取得 CHANGELOG，使用空陣列')
      return []
    }

    const markdown = await response.text()
    cachedChangelog = parseChangelog(markdown)
    return cachedChangelog
  } catch (error) {
    console.error('讀取 CHANGELOG 失敗:', error)
    return []
  }
}

/**
 * 解析 CHANGELOG.md 格式
 */
function parseChangelog(markdown: string): VersionInfo[] {
  const versions: VersionInfo[] = []
  const lines = markdown.split('\n')

  let currentVersion: VersionInfo | null = null

  for (const line of lines) {
    // 匹配版本標題：## [1.2.0] - 2025-01-17
    const versionMatch = line.match(/##\s+\[([^\]]+)\]\s+-\s+(.+)/)
    if (versionMatch && versionMatch[1] && versionMatch[2]) {
      // 如果有前一個版本，儲存它
      if (currentVersion) {
        versions.push(currentVersion)
      }

      // 開始新版本
      currentVersion = {
        version: versionMatch[1],
        date: versionMatch[2].trim(),
        features: []
      }
      continue
    }

    // 匹配功能項目（開頭是 - 或 *）
    const featureMatch = line.match(/^\s*[-*]\s+(.+)/)
    if (featureMatch && featureMatch[1] && currentVersion) {
      const feature = featureMatch[1].trim()
      // 移除 Markdown 加粗語法 **text**
      const cleanFeature = feature.replace(/\*\*(.+?)\*\*/g, '$1')
      currentVersion.features.push(cleanFeature)
    }
  }

  // 加入最後一個版本
  if (currentVersion) {
    versions.push(currentVersion)
  }

  return versions
}

/**
 * 從伺服器取得最新版本號
 * @returns 伺服器上的版本號，若失敗則返回本地版本號
 */
export async function fetchServerVersion(): Promise<string> {
  try {
    // 加上時間戳避免快取
    const timestamp = new Date().getTime()
    const response = await fetch(`/version.json?t=${timestamp}`, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache'
      }
    })

    if (!response.ok) {
      console.warn('無法取得伺服器版本，使用本地版本')
      return CURRENT_VERSION
    }

    const data = await response.json()
    return data.version || CURRENT_VERSION
  } catch (error) {
    console.warn('取得伺服器版本失敗:', error)
    return CURRENT_VERSION
  }
}

/**
 * 檢查是否有新版本（比較本地和伺服器版本）
 * @returns 如果是新版本返回 true，否則返回 false
 */
export async function checkVersion(): Promise<boolean> {
  const storedVersion = localStorage.getItem('app_version')
  const serverVersion = await fetchServerVersion()

  // 如果本地沒有儲存版本，或儲存的版本與伺服器版本不同
  if (!storedVersion || storedVersion !== serverVersion) {
    return true
  }

  return false
}

/**
 * 同步版本檢查（舊版相容，但建議使用 async 版本）
 * @deprecated 請使用 async checkVersion()
 */
export function checkVersionSync(): boolean {
  const storedVersion = localStorage.getItem('app_version')

  if (!storedVersion || storedVersion !== CURRENT_VERSION) {
    return true
  }

  return false
}

/**
 * 更新儲存的版本號（使用伺服器版本）
 */
export async function updateStoredVersion(): Promise<void> {
  const serverVersion = await fetchServerVersion()
  localStorage.setItem('app_version', serverVersion)
}

/**
 * 取得特定版本的更新說明（從 CHANGELOG 取得）
 */
export async function getVersionInfo(version: string): Promise<VersionInfo | undefined> {
  const changelog = await fetchChangelog()
  return changelog.find(v => v.version === version)
}

/**
 * 清除應用快取並重新載入
 */
export async function clearCacheAndReload(): Promise<void> {
  try {
    // 清除 Service Worker 快取
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const registration of registrations) {
        await registration.unregister()
      }
    }

    // 清除快取 API
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      )
    }

    // 重新載入頁面（強制從伺服器取得）
    window.location.reload()
  } catch (error) {
    console.error('清除快取失敗:', error)
    // 即使清除快取失敗，還是嘗試重新載入
    window.location.reload()
  }
}
