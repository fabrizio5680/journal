import {
  GOOGLE_DRIVE_SCOPE,
  type GoogleDriveStoredConnection,
  type GoogleDriveTokenState,
} from './googleDriveTypes'

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const TOKEN_SKEW_MS = 60_000

function tokenKey(userId: string) {
  return `google_drive_token_${userId}`
}

function connectionKey(userId: string) {
  return `google_drive_connection_${userId}`
}

let scriptPromise: Promise<void> | null = null

function getClientId(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('Google Drive OAuth is not configured.')
  }
  return clientId
}

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Browser unavailable.'))
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Google OAuth failed to load.')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google OAuth failed to load.'))
    document.head.append(script)
  })

  return scriptPromise
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getStoredGoogleDriveConnection(userId: string): GoogleDriveStoredConnection | null {
  return readJson<GoogleDriveStoredConnection>(connectionKey(userId))
}

export function setStoredGoogleDriveConnection(
  userId: string,
  connection: GoogleDriveStoredConnection,
) {
  writeJson(connectionKey(userId), connection)
}

export function markGoogleDriveReconnectRequired(userId: string) {
  const connection = getStoredGoogleDriveConnection(userId)
  if (!connection) return
  setStoredGoogleDriveConnection(userId, { ...connection, reconnectRequired: true })
}

export function clearGoogleDriveAuthState(userId: string) {
  localStorage.removeItem(tokenKey(userId))
  localStorage.removeItem(connectionKey(userId))
}

export function hasUsableGoogleDriveToken(userId: string): boolean {
  const token = readJson<GoogleDriveTokenState>(tokenKey(userId))
  return !!token && token.expiresAt - TOKEN_SKEW_MS > Date.now()
}

export async function requestGoogleDriveAccessToken(options: {
  userId: string
  prompt?: string
  loginHint?: string | null
}): Promise<GoogleDriveTokenState> {
  await loadGoogleIdentityScript()
  const google = window.google?.accounts.oauth2
  if (!google) throw new Error('Google OAuth is unavailable.')

  return new Promise((resolve, reject) => {
    const client = google.initTokenClient({
      client_id: getClientId(),
      scope: GOOGLE_DRIVE_SCOPE,
      include_granted_scopes: true,
      prompt: options.prompt ?? 'select_account',
      login_hint: options.loginHint ?? undefined,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description ?? response.error ?? 'Google OAuth failed.'))
          return
        }
        if (!google.hasGrantedAllScopes(response, GOOGLE_DRIVE_SCOPE)) {
          reject(new Error('Google Drive permission was not granted.'))
          return
        }
        const state = {
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
          scope: response.scope ?? GOOGLE_DRIVE_SCOPE,
        }
        writeJson(tokenKey(options.userId), state)
        resolve(state)
      },
      error_callback: (error) => {
        reject(new Error(error.message ?? error.type))
      },
    })

    client.requestAccessToken({
      prompt: options.prompt ?? 'select_account',
      scope: GOOGLE_DRIVE_SCOPE,
      login_hint: options.loginHint ?? undefined,
      include_granted_scopes: true,
    })
  })
}

export function getValidGoogleDriveAccessToken(userId: string): string | null {
  const token = readJson<GoogleDriveTokenState>(tokenKey(userId))
  if (!token || token.expiresAt - TOKEN_SKEW_MS <= Date.now()) return null
  return token.accessToken
}

export async function revokeGoogleDriveAccess(userId: string): Promise<void> {
  const token = getValidGoogleDriveAccessToken(userId)
  if (!token || !window.google?.accounts.oauth2) {
    clearGoogleDriveAuthState(userId)
    return
  }

  await new Promise<void>((resolve) => {
    window.google?.accounts.oauth2.revoke(token, () => resolve())
  })
  clearGoogleDriveAuthState(userId)
}
