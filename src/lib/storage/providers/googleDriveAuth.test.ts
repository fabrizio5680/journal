import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearGoogleDriveAuthState,
  disconnectGoogleDriveOnDevice,
  exchangeGoogleDriveCode,
  getStoredGoogleDriveConnection,
  getValidGoogleDriveAccessToken,
  hasUsableGoogleDriveToken,
  hydrateGoogleDriveConnectionFromMetadata,
  isGoogleDriveLocallyDisconnected,
  markGoogleDriveReconnectRequired,
  requestGoogleDriveAccessToken,
  requestGoogleDriveAuthorizationCode,
  revokeGoogleDriveAccess,
  setStoredGoogleDriveConnection,
} from './googleDriveAuth'
import { GOOGLE_DRIVE_SCOPE } from './googleDriveTypes'

const USER_ID = 'test-uid'

type TestCodeClientConfig = {
  client_id: string
  scope: string
  ux_mode: string
  include_granted_scopes?: boolean
  prompt?: string
  login_hint?: string
  callback: (response: { code?: string; error?: string; error_description?: string }) => void
  error_callback?: (error: { message?: string; type: string }) => void
}

const { mockHttpsCallable } = vi.hoisted(() => ({
  mockHttpsCallable: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}))

vi.mock('@/lib/firebase', () => ({
  functions: { app: 'functions' },
}))

function connectionKey(userId = USER_ID) {
  return `google_drive_connection_${userId}`
}

function localDisconnectKey(userId = USER_ID) {
  return `google_drive_disconnected_${userId}`
}

function installCodeClient(response: {
  code?: string
  error?: string
  error_description?: string
}) {
  const requestCode = vi.fn()
  const initCodeClient = vi.fn((config: TestCodeClientConfig) => {
    requestCode.mockImplementation(() => config.callback(response))
    return { requestCode }
  })
  window.google = {
    accounts: {
      oauth2: {
        initCodeClient,
        initTokenClient: vi.fn(),
        hasGrantedAllScopes: vi.fn(),
        revoke: vi.fn(),
      },
    },
  }
  return { initCodeClient, requestCode }
}

describe('googleDriveAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id')
    localStorage.clear()
    document.head.innerHTML = ''
    delete window.google
    clearGoogleDriveAuthState(USER_ID)
    mockHttpsCallable.mockReset()
  })

  it('persists, hydrates, marks reconnect, and clears non-secret connection state', () => {
    setStoredGoogleDriveConnection(USER_ID, {
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })

    expect(getStoredGoogleDriveConnection(USER_ID)).toMatchObject({
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
    })
    expect(isGoogleDriveLocallyDisconnected(USER_ID)).toBe(false)

    markGoogleDriveReconnectRequired(USER_ID)
    expect(getStoredGoogleDriveConnection(USER_ID)).toMatchObject({
      reconnectRequired: true,
    })

    hydrateGoogleDriveConnectionFromMetadata(USER_ID, {
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-14T00:00:00.000Z',
    })
    expect(getStoredGoogleDriveConnection(USER_ID)).toMatchObject({
      connectedAt: '2026-04-14T00:00:00.000Z',
    })
    expect(getStoredGoogleDriveConnection(USER_ID)?.reconnectRequired).toBeUndefined()

    clearGoogleDriveAuthState(USER_ID)
    expect(getStoredGoogleDriveConnection(USER_ID)).toBeNull()
  })

  it('marks disconnect as device-local so shared metadata can remain connected', async () => {
    setStoredGoogleDriveConnection(USER_ID, {
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })

    await revokeGoogleDriveAccess(USER_ID)

    expect(getStoredGoogleDriveConnection(USER_ID)).toBeNull()
    expect(localStorage.getItem(localDisconnectKey())).toBe('true')
    expect(isGoogleDriveLocallyDisconnected(USER_ID)).toBe(true)

    hydrateGoogleDriveConnectionFromMetadata(USER_ID, {
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-14T00:00:00.000Z',
    })
    expect(getStoredGoogleDriveConnection(USER_ID)).toBeNull()

    setStoredGoogleDriveConnection(USER_ID, {
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-14T00:00:00.000Z',
    })
    expect(isGoogleDriveLocallyDisconnected(USER_ID)).toBe(false)
  })

  it('requests a Google authorization code through GIS code flow', async () => {
    const { initCodeClient, requestCode } = installCodeClient({ code: 'auth-code' })

    const code = await requestGoogleDriveAuthorizationCode({
      userId: USER_ID,
      loginHint: 'drive@example.com',
      prompt: 'consent',
    })

    expect(code).toBe('auth-code')
    expect(initCodeClient).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-id',
        scope: GOOGLE_DRIVE_SCOPE,
        ux_mode: 'popup',
        include_granted_scopes: true,
        login_hint: 'drive@example.com',
        prompt: 'consent',
      }),
    )
    expect(requestCode).toHaveBeenCalledWith()
  })

  it('exchanges authorization code through backend and stores returned connection metadata', async () => {
    const exchange = vi.fn().mockResolvedValue({
      data: {
        provider: 'googleDrive',
        accountEmail: 'drive@example.com',
        rootFolderId: 'root-folder',
        connectedAt: '2026-04-13T00:00:00.000Z',
      },
    })
    mockHttpsCallable.mockReturnValue(exchange)

    const connection = await exchangeGoogleDriveCode(USER_ID, 'auth-code')

    expect(mockHttpsCallable).toHaveBeenCalledWith({ app: 'functions' }, 'exchangeGoogleDriveCode')
    expect(exchange).toHaveBeenCalledWith({ code: 'auth-code' })
    expect(connection.accountEmail).toBe('drive@example.com')
    expect(localStorage.getItem(connectionKey())).toContain('root-folder')
  })

  it('gets and caches short-lived access tokens from backend broker', async () => {
    const getAccessToken = vi.fn().mockResolvedValue({
      data: {
        accessToken: 'server-token',
        expiresAt: Date.now() + 120_000,
        scope: GOOGLE_DRIVE_SCOPE,
      },
    })
    mockHttpsCallable.mockReturnValue(getAccessToken)

    await expect(getValidGoogleDriveAccessToken(USER_ID)).resolves.toBe('server-token')
    expect(hasUsableGoogleDriveToken(USER_ID)).toBe(true)

    await expect(getValidGoogleDriveAccessToken(USER_ID)).resolves.toBe('server-token')
    expect(mockHttpsCallable).toHaveBeenCalledTimes(1)
    expect(getAccessToken).toHaveBeenCalledWith({})
  })

  it('returns null when backend returns an expired token', async () => {
    mockHttpsCallable.mockReturnValue(
      vi.fn().mockResolvedValue({
        data: {
          accessToken: 'expired-token',
          expiresAt: Date.now() + 30_000,
          scope: GOOGLE_DRIVE_SCOPE,
        },
      }),
    )

    await expect(getValidGoogleDriveAccessToken(USER_ID)).resolves.toBeNull()
    expect(hasUsableGoogleDriveToken(USER_ID)).toBe(false)
  })

  it('connect helper uses code flow then backend access token, not local long-lived token storage', async () => {
    installCodeClient({ code: 'auth-code' })
    const exchange = vi.fn().mockResolvedValueOnce({
      data: {
        provider: 'googleDrive',
        accountEmail: 'drive@example.com',
        rootFolderId: 'root-folder',
        connectedAt: '2026-04-13T00:00:00.000Z',
      },
    })
    const getAccessToken = vi.fn().mockResolvedValueOnce({
      data: {
        accessToken: 'server-token',
        expiresAt: Date.now() + 120_000,
        scope: GOOGLE_DRIVE_SCOPE,
      },
    })
    mockHttpsCallable.mockImplementation((_functions, name) =>
      name === 'exchangeGoogleDriveCode' ? exchange : getAccessToken,
    )

    const token = await requestGoogleDriveAccessToken({ userId: USER_ID })

    expect(token.accessToken).toBe('server-token')
    expect(exchange).toHaveBeenCalledWith({ code: 'auth-code' })
    expect(getAccessToken).toHaveBeenCalledWith({})
    expect(localStorage.getItem(connectionKey())).toContain('root-folder')
  })

  it('exposes explicit local disconnect helper', () => {
    setStoredGoogleDriveConnection(USER_ID, {
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })

    disconnectGoogleDriveOnDevice(USER_ID)

    expect(getStoredGoogleDriveConnection(USER_ID)).toBeNull()
    expect(isGoogleDriveLocallyDisconnected(USER_ID)).toBe(true)
  })
})
