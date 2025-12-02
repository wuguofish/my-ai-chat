/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
  // 其他環境變數...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Google APIs
interface Window {
  gapi: any
  google: any
}
