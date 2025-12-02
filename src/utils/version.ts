/**
 * 版本管理工具
 */

// 當前版本號（每次更新時記得更新這個值）
export const CURRENT_VERSION = '1.0.0'

// 版本歷史
export const VERSION_HISTORY = [
  {
    version: '1.0.0',
    date: '2024-01-15',
    features: [
      '初始版本發布',
      '基礎聊天功能',
      '角色管理系統',
      '好感度與關係系統',
      '記憶系統',
      'Google Drive 同步功能'
    ]
  }
]

/**
 * 檢查是否有新版本
 * @returns 如果是新版本返回 true，否則返回 false
 */
export function checkVersion(): boolean {
  const storedVersion = localStorage.getItem('app_version')

  if (!storedVersion || storedVersion !== CURRENT_VERSION) {
    return true
  }

  return false
}

/**
 * 更新儲存的版本號
 */
export function updateStoredVersion(): void {
  localStorage.setItem('app_version', CURRENT_VERSION)
}

/**
 * 取得版本更新說明
 */
export function getVersionInfo(version: string) {
  return VERSION_HISTORY.find(v => v.version === version)
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
