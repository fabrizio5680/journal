import { httpsCallable } from 'firebase/functions'

import type { ProviderConnection } from '../types'

import {
  GOOGLE_DRIVE_SCOPE,
  type GoogleDriveStoredConnection,
  type GoogleDriveTokenState,
} from './googleDriveTypes'

import { functions } from '@/lib/firebase'

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const TOKEN_SKEW_MS = 60_000
const LOCAL_DISCONNECT_KEY_PREFIX = 'google_drive_disconnected_'

const tokenCache = new Map<string, GoogleDriveTokenState>()

function connectionKey(userId: string) {
  return `google_drive_connection_${userId}`
}

function localDisconnectKey(userId: string) {
  return `${LOCAL_DISCONNECT_KEY_PREFIX}${userId}`
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
  localStorage.removeItem(localDisconnectKey(userId))
}

export function markGoogleDriveReconnectRequired(userId: string) {
  const connection = getStoredGoogleDriveConnection(userId)
  if (!connection) return
  setStoredGoogleDriveConnection(userId, { ...connection, reconnectRequired: true })
}

export function clearGoogleDriveAuthState(userId: string) {
  tokenCache.delete(userId)
  localStorage.removeItem(connectionKey(userId))
}

export function disconnectGoogleDriveOnDevice(userId: string) {
  clearGoogleDriveAuthState(userId)
  localStorage.setItem(localDisconnectKey(userId), 'true')
}

export function isGoogleDriveLocallyDisconnected(userId: string): boolean {
  return localStorage.getItem(localDisconnectKey(userId)) === 'true'
}

export function hydrateGoogleDriveConnectionFromMetadata(
  userId: string,
  connection: GoogleDriveStoredConnection,
) {
  if (isGoogleDriveLocallyDisconnected(userId)) return
  const current = getStoredGoogleDriveConnection(userId)
  if (
    current?.rootFolderId === connection.rootFolderId &&
    current.accountEmail === connection.accountEmail &&
    !current.reconnectRequired
  ) {
    return
  }
  writeJson(connectionKey(userId), connection)
}

export function hasUsableGoogleDriveToken(userId: string): boolean {
  const token = tokenCache.get(userId)
  return !!token && token.expiresAt - TOKEN_SKEW_MS > Date.now()
}

export async function requestGoogleDriveAuthorizationCode(options: {
  userId: string
  prompt?: string
  loginHint?: string | null
}): Promise<string> {
  await loadGoogleIdentityScript()
  const google = window.google?.accounts.oauth2
  if (!google?.initCodeClient) throw new Error('Google OAuth is unavailable.')
  const initCodeClient = google.initCodeClient

  return new Promise((resolve, reject) => {
    const client = initCodeClient({
      client_id: getClientId(),
      scope: GOOGLE_DRIVE_SCOPE,
      ux_mode: 'popup',
      include_granted_scopes: true,
      prompt: options.prompt ?? 'consent select_account',
      login_hint: options.loginHint ?? undefined,
      callback: (response) => {
        if (response.error || !response.code) {
          reject(new Error(response.error_description ?? response.error ?? 'Google OAuth failed.'))
          return
        }
        resolve(response.code)
      },
      error_callback: (error) => {
        reject(new Error(error.message ?? error.type))
      },
    })

    client.requestCode()
  })
}

export async function requestGoogleDriveAccessToken(options: {
  userId: string
  prompt?: string
  loginHint?: string | null
}): Promise<GoogleDriveTokenState> {
  const code = await requestGoogleDriveAuthorizationCode(options)
  await exchangeGoogleDriveCode(options.userId, code)
  const accessToken = await getValidGoogleDriveAccessToken(options.userId)
  if (!accessToken) {
    throw new Error('Google Drive needs to be reconnected.')
  }
  return (
    tokenCache.get(options.userId) ?? {
      accessToken,
      expiresAt: Date.now(),
      scope: GOOGLE_DRIVE_SCOPE,
    }
  )
}

export async function exchangeGoogleDriveCode(
  userId: string,
  code: string,
): Promise<ProviderConnection> {
  const exchange = httpsCallable<{ code: string }, ProviderConnection>(
    functions,
    'exchangeGoogleDriveCode',
  )
  const result = await exchange({ code })
  const connection = result.data
  setStoredGoogleDriveConnection(userId, {
    accountEmail: connection.accountEmail,
    rootFolderId: connection.rootFolderId ?? '',
    connectedAt: connection.connectedAt,
  })
  return connection
}

export async function getValidGoogleDriveAccessToken(userId: string): Promise<string | null> {
  const token = tokenCache.get(userId)
  if (token && token.expiresAt - TOKEN_SKEW_MS > Date.now()) return token.accessToken

  const getAccessToken = httpsCallable<Record<string, never>, GoogleDriveTokenState>(
    functions,
    'getGoogleDriveAccessToken',
  )
  const result = await getAccessToken({})
  const state = result.data
  if (!state.accessToken || state.expiresAt - TOKEN_SKEW_MS <= Date.now()) {
    return null
  }

  tokenCache.set(userId, state)
  return state.accessToken
}

export async function revokeGoogleDriveAccess(userId: string): Promise<void> {
  disconnectGoogleDriveOnDevice(userId)
}
