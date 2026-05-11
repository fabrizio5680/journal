import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearGoogleDriveAuthState,
  getStoredGoogleDriveConnection,
  getValidGoogleDriveAccessToken,
  hasUsableGoogleDriveToken,
  markGoogleDriveReconnectRequired,
  requestGoogleDriveAccessToken,
  revokeGoogleDriveAccess,
  setStoredGoogleDriveConnection,
} from './googleDriveAuth'
import { GOOGLE_DRIVE_SCOPE } from './googleDriveTypes'

const USER_ID = 'test-uid'

type TestTokenClientConfig = {
  callback: (response: {
    access_token?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
  }) => void
}

function tokenKey(userId = USER_ID) {
  return `google_drive_token_${userId}`
}

function connectionKey(userId = USER_ID) {
  return `google_drive_connection_${userId}`
}

function seedToken(expiresAt: number) {
  localStorage.setItem(
    tokenKey(),
    JSON.stringify({
      accessToken: 'access-token',
      expiresAt,
      scope: GOOGLE_DRIVE_SCOPE,
    }),
  )
}

describe('googleDriveAuth local state', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id')
    localStorage.clear()
    document.head.innerHTML = ''
    delete window.google
  })

  it('persists, reads, marks reconnect, and clears connection state', () => {
    setStoredGoogleDriveConnection(USER_ID, {
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })

    expect(getStoredGoogleDriveConnection(USER_ID)).toMatchObject({
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
    })

    markGoogleDriveReconnectRequired(USER_ID)
    expect(getStoredGoogleDriveConnection(USER_ID)).toMatchObject({
      reconnectRequired: true,
    })

    clearGoogleDriveAuthState(USER_ID)
    expect(getStoredGoogleDriveConnection(USER_ID)).toBeNull()
    expect(localStorage.getItem(tokenKey())).toBeNull()
  })

  it('treats tokens inside the refresh skew as unusable', () => {
    seedToken(Date.now() + 30_000)
    expect(hasUsableGoogleDriveToken(USER_ID)).toBe(false)
    expect(getValidGoogleDriveAccessToken(USER_ID)).toBeNull()

    seedToken(Date.now() + 120_000)
    expect(hasUsableGoogleDriveToken(USER_ID)).toBe(true)
    expect(getValidGoogleDriveAccessToken(USER_ID)).toBe('access-token')
  })

  it('requests a token through Google Identity Services and stores it locally', async () => {
    const requestAccessToken = vi.fn()
    const initTokenClient = vi.fn((config: TestTokenClientConfig) => {
      requestAccessToken.mockImplementation(() => {
        config.callback({
          access_token: 'new-token',
          expires_in: 120,
          scope: GOOGLE_DRIVE_SCOPE,
        })
      })
      return { requestAccessToken }
    })

    window.google = {
      accounts: {
        oauth2: {
          initTokenClient,
          hasGrantedAllScopes: vi.fn(() => true),
          revoke: vi.fn(),
        },
      },
    }

    const token = await requestGoogleDriveAccessToken({
      userId: USER_ID,
      loginHint: 'drive@example.com',
      prompt: 'consent',
    })

    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-id',
        scope: GOOGLE_DRIVE_SCOPE,
        login_hint: 'drive@example.com',
        prompt: 'consent',
      }),
    )
    expect(requestAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        login_hint: 'drive@example.com',
        prompt: 'consent',
        scope: GOOGLE_DRIVE_SCOPE,
      }),
    )
    expect(token.accessToken).toBe('new-token')
    expect(localStorage.getItem(tokenKey())).toContain('new-token')
  })

  it('rejects token responses that do not include the Drive scope', async () => {
    const requestAccessToken = vi.fn()
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config: TestTokenClientConfig) => {
            requestAccessToken.mockImplementation(() => {
              config.callback({
                access_token: 'new-token',
                expires_in: 120,
                scope: GOOGLE_DRIVE_SCOPE,
              })
            })
            return { requestAccessToken }
          }),
          hasGrantedAllScopes: vi.fn(() => false),
          revoke: vi.fn(),
        },
      },
    }

    await expect(requestGoogleDriveAccessToken({ userId: USER_ID })).rejects.toThrow(
      /permission was not granted/i,
    )
    expect(localStorage.getItem(tokenKey())).toBeNull()
  })

  it('revokes a valid token before clearing local state', async () => {
    seedToken(Date.now() + 120_000)
    setStoredGoogleDriveConnection(USER_ID, {
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })
    const revoke = vi.fn(
      (_token: string, callback: (response: { successful?: boolean; error?: string }) => void) =>
        callback({ successful: true }),
    )
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn(),
          hasGrantedAllScopes: vi.fn(),
          revoke,
        },
      },
    }

    await revokeGoogleDriveAccess(USER_ID)

    expect(revoke).toHaveBeenCalledWith('access-token', expect.any(Function))
    expect(localStorage.getItem(tokenKey())).toBeNull()
    expect(localStorage.getItem(connectionKey())).toBeNull()
  })
})
