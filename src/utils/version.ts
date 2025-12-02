/**
 * 版本管理工具
 */

// 當前版本號（每次更新時記得更新這個值）
export const CURRENT_VERSION = '1.2.0'

// 版本歷史
export const VERSION_HISTORY = [
  {
    version: '1.2.0',
    date: '2025-01-17',
    features: [
      '新增 API Key 檢測功能，可驗證 Key 是否有效且不消耗額度',
      '優化 API Key 輸入欄位，加入顯示/隱藏密碼功能',
      '改善 API Key 設定區塊 UI，採用 input group 設計',
      '新增 Google AI Studio 連結，方便查看額度與管理 API Key',
      '修復 iOS 長按複製/刪除訊息功能',
      '改善系統提示詞說明文字，避免使用者重複設定',
      '優化聊天室長期記憶顯示，改為唯讀模式並引導至記憶管理頁'
    ]
  },
  {
    version: '1.1.0',
    date: '2024-01-16',
    features: [
      '新增記憶管理面板，可查看與管理角色記憶',
      '新增手動生成記憶功能，可即時將對話轉換為記憶',
      '優化匯出/匯入功能，現在包含聊天訊息',
      '改善底部導航列的圖示顯示效果',
      '程式碼重構，提升可維護性'
    ]
  },
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
