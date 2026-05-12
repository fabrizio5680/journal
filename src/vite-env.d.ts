/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_BIBLE_API_KEY: string
  readonly VITE_USE_EMULATOR?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initCodeClient?: (config: GoogleCodeClientConfig) => GoogleCodeClient
        initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient
        hasGrantedAllScopes: (
          tokenResponse: GoogleTokenResponse,
          firstScope: string,
          ...restScopes: string[]
        ) => boolean
        revoke: (
          accessToken: string,
          callback: (response: { successful?: boolean; error?: string }) => void,
        ) => void
      }
    }
  }
}

interface GoogleCodeClientConfig {
  client_id: string
  scope: string
  ux_mode: 'popup'
  callback: (response: GoogleCodeResponse) => void
  error_callback?: (error: { type: string; message?: string }) => void
  include_granted_scopes?: boolean
  prompt?: string
  login_hint?: string
}

interface GoogleCodeClient {
  requestCode: () => void
}

interface GoogleCodeResponse {
  code?: string
  scope?: string
  error?: string
  error_description?: string
}

interface GoogleTokenClientConfig {
  client_id: string
  scope: string
  callback: (response: GoogleTokenResponse) => void
  error_callback?: (error: { type: string; message?: string }) => void
  include_granted_scopes?: boolean
  prompt?: string
  login_hint?: string
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: {
    prompt?: string
    scope?: string
    login_hint?: string
    include_granted_scopes?: boolean
  }) => void
}

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}
