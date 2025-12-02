/**
 * Google OAuth 服務
 * 處理 Google 登入和授權
 */

import { googleDriveService } from './googleDrive'

// Google OAuth 設定
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const SCOPES = 'https://www.googleapis.com/auth/drive.file'

export interface GoogleAuthResponse {
  access_token: string
  expires_in: number
  scope: string
  token_type: string
  error?: string  // 錯誤訊息（當授權失敗時）
}

class GoogleAuthService {
  private tokenClient: any = null
  private accessToken: string | null = null
  private tokenExpiry: number | null = null

  /**
   * 初始化 Google Identity Services
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 載入 Google Identity Services
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.onload = () => {
        try {
          this.tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (response: GoogleAuthResponse) => {
              if (response.error) {
                console.error('OAuth 錯誤:', response.error)
                return
              }
              this.handleAuthResponse(response)
            }
          })
          console.log('Google Auth 服務初始化完成')
          resolve()
        } catch (error) {
          reject(error)
        }
      }
      script.onerror = reject
      document.head.appendChild(script)
    })
  }

  /**
   * 處理授權回應
   */
  private handleAuthResponse(response: GoogleAuthResponse): void {
    this.accessToken = response.access_token
    this.tokenExpiry = Date.now() + response.expires_in * 1000

    // 設定到 Google Drive Service
    googleDriveService.setAccessToken(response.access_token)

    // 儲存到 localStorage
    localStorage.setItem('google_access_token', response.access_token)
    localStorage.setItem('google_token_expiry', this.tokenExpiry.toString())

    console.log('Google 授權成功')
  }

  /**
   * 請求授權
   */
  async requestAuth(): Promise<void> {
    if (!this.tokenClient) {
      await this.initialize()
    }

    return new Promise((resolve, reject) => {
      try {
        // 檢查是否已有有效的 token
        if (this.isTokenValid()) {
          console.log('使用現有的有效 token')
          googleDriveService.setAccessToken(this.accessToken!)
          resolve()
          return
        }

        // 設定 callback
        const originalCallback = this.tokenClient.callback
        this.tokenClient.callback = (response: GoogleAuthResponse) => {
          originalCallback(response)
          if (response.error) {
            reject(new Error(response.error))
          } else {
            resolve()
          }
        }

        // 請求授權
        this.tokenClient.requestAccessToken({ prompt: '' })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 檢查 token 是否有效
   */
  isTokenValid(): boolean {
    if (!this.accessToken || !this.tokenExpiry) {
      // 嘗試從 localStorage 恢復
      const storedToken = localStorage.getItem('google_access_token')
      const storedExpiry = localStorage.getItem('google_token_expiry')

      if (storedToken && storedExpiry) {
        this.accessToken = storedToken
        this.tokenExpiry = parseInt(storedExpiry, 10)
      } else {
        return false
      }
    }

    // 檢查是否過期（提前 5 分鐘判定為過期）
    return Date.now() < this.tokenExpiry - 5 * 60 * 1000
  }

  /**
   * 登出
   */
  signOut(): void {
    this.accessToken = null
    this.tokenExpiry = null
    googleDriveService.clearToken()
    localStorage.removeItem('google_access_token')
    localStorage.removeItem('google_token_expiry')
    console.log('已登出 Google 帳號')
  }

  /**
   * 取得當前 access token
   */
  getAccessToken(): string | null {
    if (this.isTokenValid()) {
      return this.accessToken
    }
    return null
  }
}

export const googleAuthService = new GoogleAuthService()
