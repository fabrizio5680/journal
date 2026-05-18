import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFetch,
  mockGet,
  mockGetFirestore,
  mockDeleteUser,
  mockEntriesGet,
  mockPrivateDoc,
  mockPrivateDelete,
  mockPrivateGet,
  mockRunTransaction,
  mockTransactionSet,
  mockUserDoc,
  mockUserDocDelete,
  mockUserDocSet,
} = vi.hoisted(() => {
  const mockGet = vi.fn()
  const mockPrivateGet = vi.fn()
  const mockPrivateDelete = vi.fn()
  const mockPrivateDoc = { get: mockGet, delete: mockPrivateDelete }
  const mockEntriesGet = vi.fn()
  const mockUserDocSet = vi.fn()
  const mockUserDocDelete = vi.fn()
  const mockUserDoc = {
    set: mockUserDocSet,
    delete: mockUserDocDelete,
    collection: vi.fn((name: string) => {
      if (name === 'entries') return { get: mockEntriesGet }
      return {
        doc: vi.fn(() => mockPrivateDoc),
        get: mockPrivateGet,
      }
    }),
  }
  const mockTransactionSet = vi.fn()
  const mockRunTransaction = vi.fn(async (fn: (tx: { set: typeof mockTransactionSet }) => void) =>
    fn({ set: mockTransactionSet }),
  )
  const mockDeleteUser = vi.fn()
  const mockDb = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => mockUserDoc),
      where: vi.fn(),
    })),
    runTransaction: mockRunTransaction,
  }

  return {
    mockFetch: vi.fn(),
    mockGet,
    mockGetFirestore: vi.fn(() => mockDb),
    mockDeleteUser,
    mockEntriesGet,
    mockPrivateDoc,
    mockPrivateDelete,
    mockPrivateGet,
    mockRunTransaction,
    mockTransactionSet,
    mockUserDoc,
    mockUserDocDelete,
    mockUserDocSet,
  }
})

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockGetFirestore(),
  FieldValue: {
    arrayRemove: (...values: unknown[]) => ({ arrayRemove: values }),
    serverTimestamp: () => ({ serverTimestamp: true }),
  },
}))

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ deleteUser: mockDeleteUser }),
}))

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEach: vi.fn() }),
}))

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => process.env[name] }),
  defineString: (name: string) => ({ value: () => process.env[name] }),
}))

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string

    constructor(code: string, message: string) {
      super(message)
      this.name = 'HttpsError'
      this.code = code
    }
  }

  return {
    HttpsError,
    onCall: (_options: unknown, handler: unknown) => handler,
  }
})

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_options: unknown, handler: unknown) => handler,
}))

vi.stubGlobal('fetch', mockFetch)

import {
  buildReminderMessage,
  handleDeleteAccount,
  handleExchangeGoogleDriveCode,
  handleGetGoogleDriveAccessToken,
  isWithinReminderWindow,
  logSafeUserId,
} from './index'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status >= 400 ? 'Error' : 'OK',
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('isWithinReminderWindow', () => {
  it('returns true when current time matches reminder time exactly', () => {
    expect(isWithinReminderWindow('08:00', '08:00')).toBe(true)
  })

  it('returns true at 59 minutes past reminder', () => {
    expect(isWithinReminderWindow('08:59', '08:00')).toBe(true)
  })

  it('returns false at exactly 60 minutes past reminder', () => {
    expect(isWithinReminderWindow('09:00', '08:00')).toBe(false)
  })

  it('returns true when function fires at :05 and reminder is :00 (regression: old >= 5 window would skip this)', () => {
    expect(isWithinReminderWindow('08:05', '08:00')).toBe(true)
  })

  it('returns false when current time is before reminder', () => {
    expect(isWithinReminderWindow('07:59', '08:00')).toBe(false)
  })

  it('returns false for invalid reminder time', () => {
    expect(isWithinReminderWindow('08:00', 'bad')).toBe(false)
  })

  it('returns false for invalid current time', () => {
    expect(isWithinReminderWindow('bad', '08:00')).toBe(false)
  })
})

describe('buildReminderMessage', () => {
  const BASE = 'https://journal-manna.web.app'

  it('sets token on the message', () => {
    const msg = buildReminderMessage('tok-123', BASE)
    expect(msg.token).toBe('tok-123')
  })

  it('has no notification key (data-only prevents double notification on Android Chrome PWA)', () => {
    const msg = buildReminderMessage('tok-123', BASE)
    expect(msg).not.toHaveProperty('notification')
    expect(msg).not.toHaveProperty('webpush')
  })

  it('includes title and body in data payload', () => {
    const msg = buildReminderMessage('tok-123', BASE)
    expect(msg.data.title).toBeTruthy()
    expect(msg.data.body).toBeTruthy()
  })

  it('includes icon and link derived from baseUrl', () => {
    const msg = buildReminderMessage('tok-123', BASE)
    expect(msg.data.icon).toContain(BASE)
    expect(msg.data.link).toContain(BASE)
  })
})

describe('logSafeUserId', () => {
  it('returns a stable short hash instead of the raw Firebase UID', () => {
    const uid = 'firebase-user-123'
    const safeId = logSafeUserId(uid)

    expect(safeId).toHaveLength(12)
    expect(safeId).not.toContain(uid)
    expect(logSafeUserId(uid)).toBe(safeId)
  })
})

describe('Google Drive token broker callables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GOOGLE_CLIENT_ID = 'client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    mockGet.mockResolvedValue({ get: vi.fn() })
    mockPrivateGet.mockResolvedValue({ docs: [] })
    mockEntriesGet.mockResolvedValue({ docs: [] })
    mockPrivateDelete.mockResolvedValue(undefined)
    mockUserDocDelete.mockResolvedValue(undefined)
    mockDeleteUser.mockResolvedValue(undefined)
    mockUserDocSet.mockResolvedValue(undefined)
    mockFetch.mockReset()
  })

  it('requires auth for code exchange and access-token minting', async () => {
    await expect(handleExchangeGoogleDriveCode({ data: { code: 'code' } })).rejects.toMatchObject({
      code: 'unauthenticated',
    })
    await expect(async () => handleGetGoogleDriveAccessToken({})).rejects.toMatchObject({
      code: 'unauthenticated',
    })
  })

  it('validates authorization code input', async () => {
    await expect(
      handleExchangeGoogleDriveCode({ auth: { uid: 'uid-1' }, data: { code: '' } }),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('exchanges auth code, stores refresh token privately, and writes public metadata only', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ user: { emailAddress: 'drive@example.com' } }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'root-folder' }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'entries-folder' }))

    const result = await handleExchangeGoogleDriveCode({
      auth: { uid: 'uid-1' },
      data: { code: 'auth-code' },
    })

    expect(result).toMatchObject({
      provider: 'googleDrive',
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
    })
    expect(mockRunTransaction).toHaveBeenCalled()
    expect(mockTransactionSet).toHaveBeenCalledWith(
      mockPrivateDoc,
      expect.objectContaining({
        provider: 'googleDrive',
        refreshToken: 'refresh-token',
        accountEmail: 'drive@example.com',
        rootFolderId: 'root-folder',
      }),
      { merge: true },
    )
    expect(mockTransactionSet).toHaveBeenCalledWith(
      mockUserDoc,
      expect.objectContaining({
        activeStorageProvider: 'googleDrive',
        storageAccountEmail: 'drive@example.com',
        storageRootFolderId: 'root-folder',
        storageTokenStatus: 'valid',
      }),
      { merge: true },
    )
    const publicMetadataCall = mockTransactionSet.mock.calls.find(([ref]) => ref === mockUserDoc)
    expect(publicMetadataCall?.[1]).not.toHaveProperty('refreshToken')
    expect(publicMetadataCall?.[1]).not.toHaveProperty('accessToken')
  })

  it('reuses an existing private refresh token when Google omits a new one', async () => {
    mockGet.mockResolvedValue({ get: (field: string) => (field === 'refreshToken' ? 'old' : null) })
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'access-token',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ user: { emailAddress: 'drive@example.com' } }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'root-folder' }] }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'entries-folder' }] }))

    await handleExchangeGoogleDriveCode({ auth: { uid: 'uid-1' }, data: { code: 'auth-code' } })

    expect(mockTransactionSet).toHaveBeenCalledWith(
      mockPrivateDoc,
      expect.objectContaining({ refreshToken: 'old' }),
      { merge: true },
    )
  })

  it('mints short-lived access tokens from stored refresh token', async () => {
    mockGet.mockResolvedValue({
      get: (field: string) => (field === 'refreshToken' ? 'refresh-token' : null),
    })
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        access_token: 'fresh-token',
        expires_in: 1800,
        scope: 'https://www.googleapis.com/auth/drive.file',
      }),
    )

    const result = await handleGetGoogleDriveAccessToken({ auth: { uid: 'uid-1' } })

    expect(result.accessToken).toBe('fresh-token')
    expect(result.expiresAt).toBeGreaterThan(Date.now())
    expect(mockUserDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ storageTokenStatus: 'valid' }),
      { merge: true },
    )
  })

  it('marks reconnect when no refresh token is stored', async () => {
    mockGet.mockResolvedValue({ get: vi.fn(() => undefined) })

    await expect(handleGetGoogleDriveAccessToken({ auth: { uid: 'uid-1' } })).rejects.toMatchObject(
      { code: 'failed-precondition' },
    )
    expect(mockUserDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ storageTokenStatus: 'reconnect' }),
      { merge: true },
    )
  })

  it('marks reconnect when refresh token fails at Google', async () => {
    mockGet.mockResolvedValue({
      get: (field: string) => (field === 'refreshToken' ? 'refresh-token' : null),
    })
    mockFetch.mockResolvedValueOnce(jsonResponse({ error_description: 'invalid_grant' }, 400))

    await expect(handleGetGoogleDriveAccessToken({ auth: { uid: 'uid-1' } })).rejects.toMatchObject(
      { code: 'internal' },
    )
    expect(mockUserDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ storageTokenStatus: 'reconnect' }),
      { merge: true },
    )
  })

  it('deletes account data, revokes the Drive refresh token, and removes the auth user', async () => {
    const legacyDocDelete = vi.fn()
    const privateDocDelete = vi.fn()
    mockGet.mockResolvedValue({
      get: (field: string) => (field === 'refreshToken' ? 'refresh-token' : null),
    })
    mockEntriesGet.mockResolvedValue({ docs: [{ ref: { delete: legacyDocDelete } }] })
    mockPrivateGet.mockResolvedValue({ docs: [{ ref: { delete: privateDocDelete } }] })
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await handleDeleteAccount({ auth: { uid: 'uid-1' } })

    expect(result).toMatchObject({ success: true, refreshTokenRevoked: true })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/revoke',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(legacyDocDelete).toHaveBeenCalled()
    expect(privateDocDelete).toHaveBeenCalled()
    expect(mockPrivateDelete).toHaveBeenCalled()
    expect(mockUserDocDelete).toHaveBeenCalled()
    expect(mockDeleteUser).toHaveBeenCalledWith('uid-1')
  })
})
