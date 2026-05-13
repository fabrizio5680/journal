import { httpsCallable } from 'firebase/functions'

import type { ProviderConnection } from '../types'

import {
  GOOGLE_DRIVE_SCOPE,
  type GoogleDriveStoredConnection,
  type GoogleDriveTokenState,
} from './googleDriveTypes'

import { functions } from '@/lib/firebase'

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const TOKEN_SKEW_MS = 60_000
const REFRESH_WAIT_MS = 5_000
const REFRESH_LOCK_MS = 6_000
const LOCAL_DISCONNECT_KEY_PREFIX = 'google_drive_disconnected_'

const tokenCache = new Map<string, GoogleDriveTokenState>()
const refreshInFlight = new Map<string, Promise<AccessToken | null>>()
const sessions = new Map<string, DriveTokenSessionImpl>()

function connectionKey(userId: string) {
  return `google_drive_connection_${userId}`
}

function localDisconnectKey(userId: string) {
  return `${LOCAL_DISCONNECT_KEY_PREFIX}${userId}`
}

function refreshLockKey(userId: string) {
  return `drive_token_refresh_lock_${userId}`
}

let scriptPromise: Promise<void> | null = null

export interface AccessToken {
  token: string
  expiresAt: number
  scopes: string[]
}

export type TokenStatus = 'connected' | 'refreshing' | 'reconnect' | 'disconnected'

export interface DriveTokenSession {
  getToken(): Promise<AccessToken>
  status(): TokenStatus
  onStatusChange(listener: (status: TokenStatus) => void): () => void
  invalidate(reason: 'expired-401' | 'forbidden-403' | 'manual'): void
  destroy(): void
}

type TokenBroadcastMessage =
  | { type: 'refresh-start'; senderId: string }
  | { type: 'refresh-done'; senderId: string; token: AccessToken }
  | { type: 'refresh-fail'; senderId: string; reason: string }
  | {
      type: 'invalidate'
      senderId: string
      reason: 'expired-401' | 'forbidden-403' | 'manual'
    }

export class TokenUnavailableError extends Error {
  constructor(message = 'Google Drive needs to be reconnected.') {
    super(message)
    this.name = 'TokenUnavailableError'
  }
}

function tokenStateToAccessToken(state: GoogleDriveTokenState): AccessToken {
  return {
    token: state.accessToken,
    expiresAt: state.expiresAt,
    scopes: state.scope.split(/\s+/).filter(Boolean),
  }
}

function accessTokenToTokenState(accessToken: AccessToken): GoogleDriveTokenState {
  return {
    accessToken: accessToken.token,
    expiresAt: accessToken.expiresAt,
    scope: accessToken.scopes.join(' '),
  }
}

function isUsableToken(token: GoogleDriveTokenState | undefined): token is GoogleDriveTokenState {
  return !!token && token.expiresAt - TOKEN_SKEW_MS > Date.now()
}

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

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random()}`
}

export class DriveTokenSessionImpl implements DriveTokenSession {
  private channel: BroadcastChannel | null = null
  private readonly sessionId = createSessionId()
  private statusValue: TokenStatus = 'disconnected'
  private scopeValidated = false
  private listeners = new Set<(status: TokenStatus) => void>()
  private waiters = new Set<{
    resolve: (token: AccessToken) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }>()

  constructor(private readonly userId: string) {
    const cached = tokenCache.get(userId)
    this.statusValue = isUsableToken(cached) ? 'connected' : 'disconnected'

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`drive-token-${userId}`)
      this.channel.addEventListener('message', this.handleBroadcast)
    }
  }

  async getToken(): Promise<AccessToken> {
    const cached = tokenCache.get(this.userId)
    if (isUsableToken(cached)) {
      const token = tokenStateToAccessToken(cached)
      await this.validateScopeIfNeeded(token)
      this.setStatus('connected')
      return token
    }

    if (this.statusValue === 'reconnect') {
      throw new TokenUnavailableError()
    }

    if (this.statusValue === 'refreshing' && !refreshInFlight.has(this.userId)) {
      const peerToken = await this.waitForPeerRefresh()
      if (peerToken) return peerToken
    }

    const inFlight = refreshInFlight.get(this.userId)
    if (inFlight) {
      const token = await inFlight
      if (!token) throw new TokenUnavailableError()
      return token
    }

    if (!this.tryAcquireRefreshLock()) {
      this.setStatus('refreshing')
      const peerToken = await this.waitForPeerRefresh()
      if (peerToken) return peerToken
    }

    return this.refreshToken()
  }

  status(): TokenStatus {
    return this.statusValue
  }

  onStatusChange(listener: (status: TokenStatus) => void): () => void {
    this.listeners.add(listener)
    listener(this.statusValue)
    return () => {
      this.listeners.delete(listener)
    }
  }

  invalidate(reason: 'expired-401' | 'forbidden-403' | 'manual'): void {
    tokenCache.delete(this.userId)
    this.scopeValidated = false
    if (reason === 'forbidden-403' || reason === 'manual') {
      markGoogleDriveReconnectRequired(this.userId)
      this.setStatus('reconnect')
    } else {
      this.setStatus('disconnected')
    }
    this.broadcast({ type: 'invalidate', senderId: this.sessionId, reason })
  }

  destroy(): void {
    this.channel?.removeEventListener('message', this.handleBroadcast)
    this.channel?.close()
    this.channel = null
    this.rejectWaiters(new TokenUnavailableError('Drive token session closed.'))
    this.listeners.clear()
    if (sessions.get(this.userId) === this) sessions.delete(this.userId)
  }

  private async refreshToken(): Promise<AccessToken> {
    this.setStatus('refreshing')
    this.broadcast({ type: 'refresh-start', senderId: this.sessionId })

    const refreshPromise = (async (): Promise<AccessToken | null> => {
      try {
        const getAccessToken = httpsCallable<Record<string, never>, GoogleDriveTokenState>(
          functions,
          'getGoogleDriveAccessToken',
        )
        const result = await getAccessToken({})
        const state = result.data
        if (!state.accessToken || state.expiresAt - TOKEN_SKEW_MS <= Date.now()) {
          this.handleRefreshFailure('expired-token')
          return null
        }

        const token = tokenStateToAccessToken(state)
        await this.validateScopeIfNeeded(token)
        tokenCache.set(this.userId, state)
        this.setStatus('connected')
        this.broadcast({ type: 'refresh-done', senderId: this.sessionId, token })
        return token
      } catch (error) {
        this.handleRefreshFailure(error instanceof Error ? error.message : 'refresh-failed')
        return null
      } finally {
        this.releaseRefreshLock()
        refreshInFlight.delete(this.userId)
      }
    })()

    refreshInFlight.set(this.userId, refreshPromise)
    const token = await refreshPromise
    if (!token) throw new TokenUnavailableError()
    return token
  }

  private handleRefreshFailure(reason: string) {
    tokenCache.delete(this.userId)
    this.scopeValidated = false
    markGoogleDriveReconnectRequired(this.userId)
    this.setStatus('reconnect')
    this.broadcast({ type: 'refresh-fail', senderId: this.sessionId, reason })
    this.rejectWaiters(new TokenUnavailableError())
  }

  private readonly handleBroadcast = (event: MessageEvent<TokenBroadcastMessage>) => {
    const message = event.data
    if (!message || typeof message !== 'object') return
    if ('senderId' in message && message.senderId === this.sessionId) return

    if (message.type === 'refresh-start') {
      this.setStatus('refreshing')
      void this.waitForPeerRefresh()
      return
    }

    if (message.type === 'refresh-done') {
      tokenCache.set(this.userId, accessTokenToTokenState(message.token))
      this.scopeValidated = true
      this.setStatus('connected')
      this.resolveWaiters(message.token)
      return
    }

    if (message.type === 'refresh-fail') {
      tokenCache.delete(this.userId)
      this.scopeValidated = false
      this.setStatus('reconnect')
      this.rejectWaiters(new TokenUnavailableError())
      return
    }

    if (message.type === 'invalidate') {
      tokenCache.delete(this.userId)
      this.scopeValidated = false
      this.setStatus(message.reason === 'expired-401' ? 'disconnected' : 'reconnect')
    }
  }

  private async waitForPeerRefresh(): Promise<AccessToken | null> {
    const inFlight = refreshInFlight.get(this.userId)
    if (inFlight) return inFlight
    try {
      return await new Promise<AccessToken>((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          timeout: setTimeout(() => {
            this.waiters.delete(waiter)
            reject(new TokenUnavailableError('Timed out waiting for Drive token refresh.'))
          }, REFRESH_WAIT_MS),
        }
        this.waiters.add(waiter)
      })
    } catch {
      if (this.statusValue === 'refreshing') this.setStatus('disconnected')
      return null
    }
  }

  private async validateScopeIfNeeded(token: AccessToken): Promise<void> {
    if (this.scopeValidated) return
    const response = await fetch(`${DRIVE_API}/about?fields=user`, {
      headers: { Authorization: `Bearer ${token.token}` },
    })
    if (response.status === 403) {
      this.invalidate('forbidden-403')
      throw new TokenUnavailableError()
    }
    if (response.status === 401) {
      this.invalidate('expired-401')
      throw new TokenUnavailableError('Google Drive token expired.')
    }
    if (!response.ok) {
      throw new Error(`Google Drive scope validation failed: ${response.statusText}`)
    }
    this.scopeValidated = true
  }

  private resolveWaiters(token: AccessToken) {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timeout)
      waiter.resolve(token)
    }
    this.waiters.clear()
  }

  private rejectWaiters(error: Error) {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timeout)
      waiter.reject(error)
    }
    this.waiters.clear()
  }

  private setStatus(status: TokenStatus) {
    if (this.statusValue === status) return
    this.statusValue = status
    for (const listener of this.listeners) listener(status)
  }

  private broadcast(message: TokenBroadcastMessage) {
    this.channel?.postMessage(message)
  }

  private tryAcquireRefreshLock(): boolean {
    if (typeof localStorage === 'undefined') return true
    const key = refreshLockKey(this.userId)
    const now = Date.now()
    const current = readJson<{ owner: string; expiresAt: number }>(key)
    if (current && current.expiresAt > now && current.owner !== this.sessionId) return false
    writeJson(key, { owner: this.sessionId, expiresAt: now + REFRESH_LOCK_MS })
    const claimed = readJson<{ owner: string; expiresAt: number }>(key)
    return claimed?.owner === this.sessionId
  }

  private releaseRefreshLock() {
    if (typeof localStorage === 'undefined') return
    const key = refreshLockKey(this.userId)
    const current = readJson<{ owner: string; expiresAt: number }>(key)
    if (current?.owner === this.sessionId) localStorage.removeItem(key)
  }
}

export function openDriveTokenSession(userId: string): DriveTokenSession {
  const existing = sessions.get(userId)
  if (existing) return existing
  const session = new DriveTokenSessionImpl(userId)
  sessions.set(userId, session)
  return session
}

export function getStoredGoogleDriveConnection(userId: string): GoogleDriveStoredConnection | null {
  return readJson<GoogleDriveStoredConnection>(connectionKey(userId))
}

export function setStoredGoogleDriveConnection(
  userId: string,
  connection: GoogleDriveStoredConnection,
) {
  sessions.get(userId)?.destroy()
  writeJson(connectionKey(userId), connection)
  localStorage.removeItem(localDisconnectKey(userId))
}

export function markGoogleDriveReconnectRequired(userId: string) {
  const connection = getStoredGoogleDriveConnection(userId)
  if (!connection) return
  writeJson(connectionKey(userId), { ...connection, reconnectRequired: true })
}

export function clearGoogleDriveAuthState(userId: string) {
  tokenCache.delete(userId)
  sessions.get(userId)?.destroy()
  localStorage.removeItem(connectionKey(userId))
  localStorage.removeItem(refreshLockKey(userId))
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
  return isUsableToken(tokenCache.get(userId))
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
  try {
    const token = await openDriveTokenSession(userId).getToken()
    return token.token
  } catch (error) {
    if (error instanceof TokenUnavailableError) return null
    throw error
  }
}

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>

export async function driveApiFetch<T>(
  userId: string,
  url: string,
  init: FetchInit = {},
): Promise<T> {
  const session = openDriveTokenSession(userId)
  const { GoogleDriveError } = await import('./googleDriveTypes')

  async function runFetch(retry401: boolean): Promise<Response> {
    let accessToken: AccessToken
    try {
      accessToken = await session.getToken()
    } catch {
      markGoogleDriveReconnectRequired(userId)
      throw new GoogleDriveError('reconnect', 'Google Drive needs to be reconnected.')
    }

    const response = await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${accessToken.token}`,
      },
    })

    if (response.status === 401 && retry401) {
      session.invalidate('expired-401')
      return runFetch(false)
    }

    if (response.status === 403) {
      session.invalidate('forbidden-403')
    }

    return response
  }

  const response = await runFetch(true)

  if (!response.ok) {
    const status = response.status
    let reason = ''
    let message = response.statusText
    try {
      const body = (await response.json()) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> }
      }
      reason = body.error?.errors?.[0]?.reason ?? ''
      message = body.error?.message ?? message
    } catch {
      // keep status text when Drive does not return JSON
    }
    if (status === 401) {
      markGoogleDriveReconnectRequired(userId)
      throw new GoogleDriveError('reconnect', message, status)
    }
    if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded') {
      throw new GoogleDriveError('storage-full', message, status)
    }
    if (status === 410) {
      throw new GoogleDriveError('retryable', message, status)
    }
    if (status === 429 || status >= 500) {
      throw new GoogleDriveError('retryable', message, status)
    }
    throw new GoogleDriveError('unknown', message, status)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function revokeGoogleDriveAccess(userId: string): Promise<void> {
  disconnectGoogleDriveOnDevice(userId)
}
