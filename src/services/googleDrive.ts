/**
 * Google Drive API 服務
 * 處理檔案的建立、讀取、更新操作
 */

export interface DriveFile {
  id: string
  name: string
  modifiedTime: string
}

/**
 * Token 無效錯誤類型
 */
export class TokenInvalidError extends Error {
  constructor(message: string = 'Access token is invalid or expired') {
    super(message)
    this.name = 'TokenInvalidError'
  }
}

class GoogleDriveService {
  private accessToken: string | null = null
  private isInitialized = false
  private readonly FOLDER_NAME = 'AI聊天應用'
  private readonly FILE_NAME = 'ai-chat-backup.json'

  /**
   * 初始化服務
   */
  async initialize(): Promise<void> {
    try {
      if (!window.gapi) {
        await this.loadGapiClient()
      }

      await new Promise<void>((resolve, reject) => {
        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.load('drive', 'v3')
            this.isInitialized = true
            console.log('Google Drive API 服務初始化完成')
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      })
    } catch (error) {
      console.error('Google Drive API 服務初始化失敗:', error)
      throw error
    }
  }

  /**
   * 載入 GAPI 客戶端
   */
  private loadGapiClient(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.gapi) {
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://apis.google.com/js/api.js'
      script.onload = () => resolve()
      script.onerror = reject
      document.head.appendChild(script)
    })
  }

  /**
   * 設定存取權token
   */
  setAccessToken(token: string): void {
    this.accessToken = token
    console.log('設定 Google Drive access token:', token ? '已設定' : '未設定')
    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token })
    }
  }

  /**
   * 檢查並處理 API 回應狀態
   */
  private checkResponseStatus(response: Response): void {
    if (response.status === 401) {
      throw new TokenInvalidError('Access token 已過期或無效，請重新授權')
    }
  }

  /**
   * 取得或建立應用資料夾
   */
  private async getOrCreateAppFolder(): Promise<string | null> {
    try {
      // 搜尋是否已存在資料夾
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${this.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder'&fields=files(id,name)`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      )

      // 檢查 token 是否有效
      this.checkResponseStatus(searchResponse)

      const searchResult = await searchResponse.json()

      if (searchResult.files && searchResult.files.length > 0) {
        console.log('找到現有的應用資料夾:', searchResult.files[0].id)
        return searchResult.files[0].id
      }

      // 建立新資料夾
      console.log('建立新的應用資料夾...')
      const folderMetadata = {
        name: this.FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
      }

      const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(folderMetadata)
      })

      // 檢查 token 是否有效
      this.checkResponseStatus(createResponse)

      const folderResult = await createResponse.json()
      console.log('應用資料夾建立成功:', folderResult.id)
      return folderResult.id
    } catch (error) {
      console.error('取得資料夾失敗:', error)
      // 如果是 token 無效錯誤，直接往上拋
      if (error instanceof TokenInvalidError) {
        throw error
      }
      return null
    }
  }

  /**
   * 取得現有的備份檔案
   */
  private async getExistingBackupFile(): Promise<DriveFile | null> {
    try {
      const folderId = await this.getOrCreateAppFolder()

      let query = `name='${this.FILE_NAME}' and mimeType='application/json'`
      if (folderId) {
        query = `parents in '${folderId}' and ${query}`
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      )

      // 檢查 token 是否有效
      this.checkResponseStatus(response)

      if (!response.ok) {
        throw new Error(`檔案搜尋失敗: ${response.statusText}`)
      }

      const result = await response.json()
      return result.files && result.files.length > 0 ? result.files[0] : null
    } catch (error) {
      console.error('搜尋備份檔案時發生錯誤:', error)
      // 如果是 token 無效錯誤，直接往上拋
      if (error instanceof TokenInvalidError) {
        throw error
      }
      return null
    }
  }

  /**
   * 上傳備份到 Google Drive
   */
  async uploadBackup(data: any): Promise<void> {
    try {
      console.log('開始上傳備份到 Google Drive')

      if (!this.accessToken) {
        throw new Error('未設定 Google Drive 存取權限')
      }

      if (!this.isInitialized) {
        await this.initialize()
      }

      // 檢查是否已有備份檔案
      const existingFile = await this.getExistingBackupFile()

      if (existingFile) {
        // 更新現有檔案
        console.log('更新現有備份檔案:', existingFile.id)
        await this.updateFile(existingFile.id, data)
      } else {
        // 建立新檔案
        console.log('建立新備份檔案')
        await this.createFile(data)
      }

      console.log('備份上傳成功')
    } catch (error) {
      console.error('上傳備份失敗:', error)
      throw error
    }
  }

  /**
   * 從 Google Drive 下載備份
   */
  async downloadBackup(): Promise<any> {
    try {
      console.log('開始從 Google Drive 下載備份')

      if (!this.accessToken) {
        throw new Error('未設定 Google Drive 存取權限')
      }

      if (!this.isInitialized) {
        await this.initialize()
      }

      const existingFile = await this.getExistingBackupFile()

      if (!existingFile) {
        throw new Error('找不到備份檔案')
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      )

      // 檢查 token 是否有效
      this.checkResponseStatus(response)

      if (!response.ok) {
        throw new Error(`檔案下載失敗: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('備份下載成功')
      return data
    } catch (error) {
      console.error('下載備份失敗:', error)
      throw error
    }
  }

  /**
   * 建立新檔案
   */
  private async createFile(content: any): Promise<any> {
    const folderId = await this.getOrCreateAppFolder()

    const fileMetadata = {
      name: this.FILE_NAME,
      parents: folderId ? [folderId] : undefined
    }

    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }))
    form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }))

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: form
      }
    )

    // 檢查 token 是否有效
    this.checkResponseStatus(response)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('API 錯誤詳細:', errorText)
      throw new Error(`檔案建立失敗: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  }

  /**
   * 更新現有檔案
   */
  private async updateFile(fileId: string, content: any): Promise<any> {
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(content, null, 2)
      }
    )

    // 檢查 token 是否有效
    this.checkResponseStatus(response)

    if (!response.ok) {
      throw new Error(`檔案更新失敗: ${response.statusText}`)
    }

    return await response.json()
  }

  /**
   * 清除 access token
   */
  clearToken(): void {
    this.accessToken = null
    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken(null)
    }
  }
}

export const googleDriveService = new GoogleDriveService()
