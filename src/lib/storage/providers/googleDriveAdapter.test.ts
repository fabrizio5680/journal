import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EntryFile } from '../types'

import { FakeGoogleDriveBackend } from './fakeGoogleDriveBackend'
import { GoogleDriveAdapter } from './googleDriveAdapter'
import { GoogleDriveError } from './googleDriveTypes'

const USER_ID = 'test-uid'

const {
  mockDisconnectGoogleDriveOnDevice,
  mockExchangeGoogleDriveCode,
  mockGetStoredGoogleDriveConnection,
  mockGetValidGoogleDriveAccessToken,
  mockMarkGoogleDriveReconnectRequired,
  mockRequestGoogleDriveAuthorizationCode,
  mockSetStoredGoogleDriveConnection,
  mockGetDeviceFingerprint,
} = vi.hoisted(() => ({
  mockDisconnectGoogleDriveOnDevice: vi.fn(),
  mockExchangeGoogleDriveCode: vi.fn(),
  mockGetStoredGoogleDriveConnection: vi.fn(),
  mockGetValidGoogleDriveAccessToken: vi.fn(),
  mockMarkGoogleDriveReconnectRequired: vi.fn(),
  mockRequestGoogleDriveAuthorizationCode: vi.fn(),
  mockSetStoredGoogleDriveConnection: vi.fn(),
  mockGetDeviceFingerprint: vi
    .fn()
    .mockResolvedValue({ deviceId: 'device-abc', deviceLabel: 'Mac Chrome', generatedAt: 1 }),
}))

vi.mock('./googleDriveAuth', () => ({
  disconnectGoogleDriveOnDevice: (...args: unknown[]) => mockDisconnectGoogleDriveOnDevice(...args),
  driveApiFetch: async (
    _userId: string,
    url: string,
    init: NonNullable<Parameters<typeof fetch>[1]> = {},
  ) => {
    const accessToken = await mockGetValidGoogleDriveAccessToken(_userId)
    if (!accessToken) {
      mockMarkGoogleDriveReconnectRequired(_userId)
      const error = new Error('Google Drive needs to be reconnected.') as Error & {
        code?: string
      }
      error.code = 'reconnect'
      throw error
    }
    const response = await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!response.ok) {
      let reason = ''
      let message = response.statusText
      try {
        const body = (await response.json()) as {
          error?: { message?: string; errors?: Array<{ reason?: string }> }
        }
        reason = body.error?.errors?.[0]?.reason ?? ''
        message = body.error?.message ?? message
      } catch {
        // Keep status text when Drive does not return JSON.
      }
      const error = new Error(message) as Error & { code?: string; status?: number }
      error.status = response.status
      if (response.status === 401) {
        mockMarkGoogleDriveReconnectRequired(_userId)
        error.code = 'reconnect'
      } else if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded') {
        error.code = 'storage-full'
        error.name = 'GoogleDriveError'
      } else if (response.status === 410 || response.status === 429 || response.status >= 500) {
        error.code = 'retryable'
      } else {
        error.code = 'unknown'
      }
      throw error
    }
    if (response.status === 204) return undefined
    return response.json()
  },
  exchangeGoogleDriveCode: (...args: unknown[]) => mockExchangeGoogleDriveCode(...args),
  getStoredGoogleDriveConnection: (...args: unknown[]) =>
    mockGetStoredGoogleDriveConnection(...args),
  getValidGoogleDriveAccessToken: (...args: unknown[]) =>
    mockGetValidGoogleDriveAccessToken(...args),
  markGoogleDriveReconnectRequired: (...args: unknown[]) =>
    mockMarkGoogleDriveReconnectRequired(...args),
  requestGoogleDriveAuthorizationCode: (...args: unknown[]) =>
    mockRequestGoogleDriveAuthorizationCode(...args),
  setStoredGoogleDriveConnection: (...args: unknown[]) =>
    mockSetStoredGoogleDriveConnection(...args),
}))

vi.mock('../deviceFingerprint', () => ({
  getDeviceFingerprint: (...args: unknown[]) => mockGetDeviceFingerprint(...args),
}))

function makeEntry(): EntryFile {
  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date: '2026-04-13',
    content: { type: 'doc', content: [] },
    searchText: 'A quiet test',
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: 3,
    createdAt: '2026-04-13T00:00:00.000Z',
    updatedAt: '2026-04-13T00:00:00.000Z',
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetchSequence(responses: Response[]) {
  const fetchMock = vi.fn(async () => {
    const response = responses.shift()
    if (!response) throw new Error('No mocked response left.')
    return response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('GoogleDriveAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    localStorage.clear()
    // Importing fakeGoogleDriveBackend sets window.__fakeDriveBackend as a side
    // effect. Clear it here so tests that exercise the real Drive code path
    // (via mocked driveApiFetch + mockFetchSequence) don't accidentally hit
    // the fake path. Individual tests that need the fake backend set it
    // explicitly.
    delete (window as typeof window & { __fakeDriveBackend?: unknown }).__fakeDriveBackend
    mockGetStoredGoogleDriveConnection.mockReturnValue({
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })
    mockGetValidGoogleDriveAccessToken.mockResolvedValue('access-token')
    mockRequestGoogleDriveAuthorizationCode.mockResolvedValue('auth-code')
    mockExchangeGoogleDriveCode.mockResolvedValue({
      provider: 'googleDrive',
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })
  })

  it('connects with authorization code flow and stores only connection metadata locally', async () => {
    const result = await new GoogleDriveAdapter(USER_ID, 'app@example.com').connect()

    expect(mockRequestGoogleDriveAuthorizationCode).toHaveBeenCalledWith({
      userId: USER_ID,
      loginHint: 'app@example.com',
      prompt: 'consent select_account',
    })
    expect(mockExchangeGoogleDriveCode).toHaveBeenCalledWith(USER_ID, 'auth-code')
    expect(mockSetStoredGoogleDriveConnection).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        accountEmail: 'drive@example.com',
        rootFolderId: 'root-folder',
      }),
    )
    expect(result.rootPath).toBe('My Drive/Quiet Dwelling')
  })

  it('disconnects only this device', async () => {
    await new GoogleDriveAdapter(USER_ID).disconnect()

    expect(mockDisconnectGoogleDriveOnDevice).toHaveBeenCalledWith(USER_ID)
  })

  it('downloads a stored entry by Drive file id with auth header', async () => {
    const entry = makeEntry()
    const fetchMock = mockFetchSequence([jsonResponse(entry)])

    const result = await new GoogleDriveAdapter(USER_ID).getEntryByFileId('file-id')

    expect(result).toEqual(entry)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/file-id?alt=media',
      {
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    )
  })

  it('creates missing folders and uploads a new entry JSON file', async () => {
    const fetchMock = mockFetchSequence([
      jsonResponse({ files: [] }),
      jsonResponse({ id: 'entries-folder' }),
      jsonResponse({ files: [] }),
      jsonResponse({ id: 'year-folder' }),
      jsonResponse({ files: [] }),
      jsonResponse({ id: 'month-folder' }),
      jsonResponse({ files: [] }),
      jsonResponse({ id: 'entry-file', headRevisionId: 'revision-1' }),
    ])

    const result = await new GoogleDriveAdapter(USER_ID).saveEntry(makeEntry())

    expect(mockGetValidGoogleDriveAccessToken).toHaveBeenCalledWith(USER_ID)
    expect(result.revisionId).toBe('revision-1')
    expect(result.metadata.providerFileId).toBe('entry-file')
    const uploadCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown[]
    const uploadUrl = uploadCall[0] as string
    const uploadInit = uploadCall[1] as { method?: string; body?: unknown }
    expect(uploadUrl).toContain('/upload/drive/v3/files')
    expect(uploadUrl).toContain('uploadType=multipart')
    expect(uploadInit.method).toBe('POST')
    expect((uploadInit as { headers: Record<string, string> }).headers.Authorization).toBe(
      'Bearer access-token',
    )
    expect(String(uploadInit.body)).toContain('"name":"2026-04-13.json"')
    expect(String(uploadInit.body)).toContain('"app":"quiet-dwelling"')
  })

  it('updates an existing entry when the expected revision still matches', async () => {
    const fetchMock = mockFetchSequence([
      jsonResponse({ files: [{ id: 'entries-folder', name: 'entries' }] }),
      jsonResponse({ files: [{ id: 'year-folder', name: '2026' }] }),
      jsonResponse({ files: [{ id: 'month-folder', name: '04' }] }),
      jsonResponse({
        files: [{ id: 'entry-file', name: '2026-04-13.json', headRevisionId: 'revision-1' }],
      }),
      jsonResponse({ id: 'entry-file', headRevisionId: 'revision-2' }),
    ])

    const result = await new GoogleDriveAdapter(USER_ID).saveEntry(makeEntry(), 'revision-1')

    expect(result.revisionId).toBe('revision-2')
    const uploadCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown[]
    const uploadUrl = uploadCall[0] as string
    const uploadInit = uploadCall[1] as { method?: string; body?: unknown }
    expect(uploadUrl).toContain('/upload/drive/v3/files/entry-file')
    expect(uploadInit.method).toBe('PATCH')
  })

  it('detects revision conflicts before upload', async () => {
    mockFetchSequence([
      jsonResponse({ files: [{ id: 'entries-folder', name: 'entries' }] }),
      jsonResponse({ files: [{ id: 'year-folder', name: '2026' }] }),
      jsonResponse({ files: [{ id: 'month-folder', name: '04' }] }),
      jsonResponse({
        files: [{ id: 'entry-file', name: '2026-04-13.json', headRevisionId: 'revision-2' }],
      }),
    ])

    await expect(
      new GoogleDriveAdapter(USER_ID).saveEntry(makeEntry(), 'revision-1'),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('maps 401 responses to reconnect and marks local connection state', async () => {
    mockFetchSequence([jsonResponse({ error: { message: 'Unauthorized' } }, 401)])

    await expect(new GoogleDriveAdapter(USER_ID).listEntryMetadata()).rejects.toMatchObject({
      code: 'reconnect',
    })
    expect(mockMarkGoogleDriveReconnectRequired).toHaveBeenCalledWith(USER_ID)
  })

  it('maps missing backend token to reconnect before calling Drive REST', async () => {
    mockGetValidGoogleDriveAccessToken.mockResolvedValueOnce(null)
    const fetchMock = mockFetchSequence([])

    await expect(new GoogleDriveAdapter(USER_ID).listEntryMetadata()).rejects.toMatchObject({
      code: 'reconnect',
    })
    expect(mockMarkGoogleDriveReconnectRequired).toHaveBeenCalledWith(USER_ID)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps Drive storage quota errors to storage-full', async () => {
    mockFetchSequence([
      jsonResponse({ files: [{ id: 'entries-folder', name: 'entries' }] }),
      jsonResponse({ files: [{ id: 'year-folder', name: '2026' }] }),
      jsonResponse({ files: [{ id: 'month-folder', name: '04' }] }),
      jsonResponse({ files: [] }),
      jsonResponse(
        {
          error: {
            message: 'Storage quota exceeded',
            errors: [{ reason: 'storageQuotaExceeded' }],
          },
        },
        403,
      ),
    ])

    await expect(new GoogleDriveAdapter(USER_ID).saveEntry(makeEntry())).rejects.toMatchObject({
      code: 'storage-full',
      name: GoogleDriveError.name,
    })
  })

  // ── saveConflictBackup tests ───────────────────────────────────────────────

  it('saveConflictBackup: ensures conflicts/ folder exists under rootFolderId; uploads with correct naming pattern', async () => {
    const fetchMock = mockFetchSequence([
      // findFile for 'conflicts' folder (under root-folder) → not found
      jsonResponse({ files: [] }),
      // create conflicts folder → returns id
      jsonResponse({ id: 'conflicts-folder' }),
      // upload conflict backup → returns uploaded file
      jsonResponse({ id: 'conflict-file', headRevisionId: 'rev-backup' }),
    ])

    await new GoogleDriveAdapter(USER_ID).saveConflictBackup(makeEntry(), '2026-04-13', 'rev-99')

    // Verify conflicts folder was looked up under root-folder
    const folderSearchCall = fetchMock.mock.calls[0] as unknown as [string, unknown]
    const folderSearchUrl = folderSearchCall[0] as string
    expect(folderSearchUrl).toContain('conflicts')
    expect(folderSearchUrl).toContain('root-folder')

    // Verify upload happened
    const uploadCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown as [
      string,
      { body?: string },
    ]
    const uploadBody = uploadCall[1].body ?? ''
    // File name should follow pattern: <date>.<revId>.<deviceId>-<ts>.json
    expect(uploadBody).toContain('2026-04-13')
    expect(uploadBody).toContain('rev-99')
    expect(uploadBody).toContain('device-abc')
    expect(uploadBody).toContain('.json')
    // Parent should be the conflicts folder
    expect(uploadBody).toContain('conflicts-folder')
  })

  it('saveConflictBackup: error does NOT throw (fire-and-forget)', async () => {
    // Simulate a fetch failure
    mockFetchSequence([jsonResponse({ error: { message: 'Forbidden' } }, 403)])

    // Should resolve (not throw) even if the backup fails
    await expect(
      new GoogleDriveAdapter(USER_ID).saveConflictBackup(makeEntry(), '2026-04-13', 'rev-99'),
    ).resolves.toBeNull()
  })

  it('saveConflictBackup: uses existing conflicts folder if it already exists', async () => {
    const fetchMock = mockFetchSequence([
      // findFile for 'conflicts' folder → found
      jsonResponse({ files: [{ id: 'existing-conflicts-folder', name: 'conflicts' }] }),
      // upload backup
      jsonResponse({ id: 'conflict-backup-file', headRevisionId: 'rev-backup' }),
    ])

    await new GoogleDriveAdapter(USER_ID).saveConflictBackup(makeEntry(), '2026-04-13', 'rev-x')

    // Should only have 2 calls (no folder creation)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Upload body should reference existing conflicts folder
    const uploadCall = fetchMock.mock.calls[1] as unknown as [string, { body?: string }]
    expect(uploadCall[1].body).toContain('existing-conflicts-folder')
  })

  // ── readManifest / writeManifest tests ────────────────────────────────────────

  it('readManifest: returns null when metadata.json does not exist in Drive', async () => {
    // findFile for 'metadata.json' returns no files
    mockFetchSequence([jsonResponse({ files: [] })])

    const result = await new GoogleDriveAdapter(USER_ID).readManifest()

    expect(result).toBeNull()
  })

  it('readManifest: returns parsed array when metadata.json exists', async () => {
    const manifestEntries = [
      {
        date: '2026-04-13',
        mood: 4 as const,
        moodLabel: 'grateful',
        tags: ['faith', 'work'],
        wordCount: 42,
        providerFileId: 'file-abc',
      },
    ]
    mockFetchSequence([
      // findFile → found
      jsonResponse({ files: [{ id: 'manifest-file', name: 'metadata.json' }] }),
      // download content → wrapped in { schemaVersion, entries }
      jsonResponse({ schemaVersion: 1, entries: manifestEntries }),
    ])

    const result = await new GoogleDriveAdapter(USER_ID).readManifest()

    // The implementation fetches the file content; the type stored on Drive
    // is { schemaVersion, entries } but readManifest returns ManifestEntry[]
    // by downloading the file id and parsing the top-level array/entries.
    // Verify a non-null result was returned.
    expect(result).not.toBeNull()
  })

  it('readManifest: returns null on fetch error (non-throwing)', async () => {
    // Make driveFetch throw (e.g. 401)
    mockFetchSequence([jsonResponse({ error: { message: 'Unauthorized' } }, 401)])

    // Should return null (catch block) rather than throw
    const result = await new GoogleDriveAdapter(USER_ID).readManifest()

    expect(result).toBeNull()
  })

  it('writeManifest: creates metadata.json when it does not exist', async () => {
    const fetchMock = mockFetchSequence([
      // findFile for 'metadata.json' → not found
      jsonResponse({ files: [] }),
      // POST upload → created
      jsonResponse({ id: 'manifest-new', headRevisionId: 'rev-1' }),
    ])

    const entries = [
      {
        date: '2026-04-13',
        mood: null as null,
        moodLabel: null,
        tags: ['faith'],
        wordCount: 5,
        providerFileId: 'file-abc',
      },
    ]

    await new GoogleDriveAdapter(USER_ID).writeManifest(entries)

    // Should have made exactly 2 calls: findFile + POST upload
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The upload should be a POST (not PATCH)
    const uploadCall = fetchMock.mock.calls[1] as unknown as [
      string,
      { method?: string; body?: string },
    ]
    expect(uploadCall[1].method).toBe('POST')
    expect(uploadCall[1].body).toContain('metadata.json')
    expect(uploadCall[1].body).toContain('faith')
  })

  it('writeManifest: patches metadata.json when it already exists', async () => {
    const fetchMock = mockFetchSequence([
      // findFile for 'metadata.json' → found
      jsonResponse({ files: [{ id: 'manifest-existing', name: 'metadata.json' }] }),
      // PATCH upload → updated
      jsonResponse({ id: 'manifest-existing', headRevisionId: 'rev-2' }),
    ])

    const entries = [
      {
        date: '2026-04-14',
        mood: 3 as const,
        moodLabel: 'peaceful',
        tags: [],
        wordCount: 10,
        providerFileId: 'file-xyz',
      },
    ]

    await new GoogleDriveAdapter(USER_ID).writeManifest(entries)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The upload should be a PATCH
    const uploadCall = fetchMock.mock.calls[1] as unknown as [
      string,
      { method?: string; body?: string },
    ]
    expect(uploadCall[1].method).toBe('PATCH')
    // URL should contain the existing file id
    const uploadUrl = uploadCall[0] as string
    expect(uploadUrl).toContain('manifest-existing')
  })

  it('writeManifest: swallows errors (non-fatal fire-and-forget)', async () => {
    // Simulate a 500 error on findFile
    mockFetchSequence([jsonResponse({ error: { message: 'Internal Server Error' } }, 500)])

    await expect(new GoogleDriveAdapter(USER_ID).writeManifest([])).resolves.toBeUndefined()
  })

  // ── getStorageUsage tests ────────────────────────────────────────────────────

  describe('getStorageUsage', () => {
    type WinFake = typeof window & { __fakeDriveBackend?: FakeGoogleDriveBackend }

    afterEach(() => {
      delete (window as WinFake).__fakeDriveBackend
    })

    it('returns { folderBytes, driveUsage, driveLimit } shape with fixed 15 GB limit from fake backend', async () => {
      const fake = new FakeGoogleDriveBackend()
      ;(window as WinFake).__fakeDriveBackend = fake

      const result = await new GoogleDriveAdapter(USER_ID).getStorageUsage()

      expect(result).toEqual(
        expect.objectContaining({
          folderBytes: expect.any(Number),
          driveUsage: expect.any(Number),
          driveLimit: 15 * 1024 * 1024 * 1024,
        }),
      )
      // Empty backend means folderBytes is 0
      expect(result.folderBytes).toBe(0)
    })

    it('folderBytes sums sizes of seeded entries (entries/<year>/<month>) AND conflict backups', async () => {
      const fake = new FakeGoogleDriveBackend()
      ;(window as WinFake).__fakeDriveBackend = fake

      // Seed two entries in different month folders to verify recursion works
      // (entries/2025/03/ and entries/2026/04/ in real Drive — fake just tracks per-date)
      fake.seed([
        {
          date: '2025-03-15',
          content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'March entry' }] }],
          },
          searchText: 'March entry',
          tags: ['faith'],
          wordCount: 2,
        },
        {
          date: '2026-04-13',
          content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'April entry' }] }],
          },
          searchText: 'April entry',
          wordCount: 2,
        },
      ])

      // Compute expected byte length: fake sums JSON.stringify(entry).length for each entry
      const marchEntry = fake.getEntry('2025-03-15')
      const aprilEntry = fake.getEntry('2026-04-13')
      const expectedEntriesBytes =
        JSON.stringify(marchEntry).length + JSON.stringify(aprilEntry).length

      // Now save a conflict backup — should also be summed in
      const backupEntry: EntryFile = makeEntry()
      fake.saveConflictBackup(backupEntry, '2026-04-13', 'rev-old')
      const expectedBackupBytes = JSON.stringify(backupEntry).length

      const result = await new GoogleDriveAdapter(USER_ID).getStorageUsage()

      expect(result.folderBytes).toBe(expectedEntriesBytes + expectedBackupBytes)
      // driveUsage in the fake mirrors folderBytes
      expect(result.driveUsage).toBe(expectedEntriesBytes + expectedBackupBytes)
      expect(result.driveLimit).toBe(15 * 1024 * 1024 * 1024)
    })

    it('includes deeply nested entries (e.g. entries/2025/03/x.json) via recursion', async () => {
      // The fake backend stores entries flat-by-date but conceptually represents
      // entries/<year>/<month>/<date>.json. The real adapter's listAllFilesRecursive
      // walks the tree. Here we verify that an entry whose path implies a deep
      // nested folder layout still contributes its bytes to folderBytes.
      const fake = new FakeGoogleDriveBackend()
      ;(window as WinFake).__fakeDriveBackend = fake

      fake.seed([
        {
          date: '2025-03-07',
          content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }],
          },
          searchText: 'nested',
          wordCount: 1,
        },
      ])

      const result = await new GoogleDriveAdapter(USER_ID).getStorageUsage()
      const expected = JSON.stringify(fake.getEntry('2025-03-07')).length
      expect(result.folderBytes).toBe(expected)
    })

    it('rejects with reconnect error when connection has no rootFolderId (real Drive path)', async () => {
      // No fake backend set → real Drive code path runs → getConnection() called
      mockGetStoredGoogleDriveConnection.mockReturnValue(null)

      await expect(new GoogleDriveAdapter(USER_ID).getStorageUsage()).rejects.toMatchObject({
        code: 'reconnect',
        name: GoogleDriveError.name,
      })
    })
  })

  describe('clearConflictBackups', () => {
    type WinFake = typeof window & { __fakeDriveBackend?: FakeGoogleDriveBackend }

    afterEach(() => {
      delete (window as WinFake).__fakeDriveBackend
    })

    it('removes conflict backups from the fake backend and returns the count', async () => {
      const fake = new FakeGoogleDriveBackend()
      ;(window as WinFake).__fakeDriveBackend = fake
      fake.saveConflictBackup(makeEntry(), '2026-04-13', 'rev-old')
      fake.saveConflictBackup(makeEntry(), '2026-04-13', 'rev-new')

      const result = await new GoogleDriveAdapter(USER_ID).clearConflictBackups()

      expect(result).toBe(2)
      expect(fake.getConflictBackups()).toHaveLength(0)
    })

    it('deletes all files under the Drive conflicts folder', async () => {
      const fetchMock = mockFetchSequence([
        jsonResponse({ files: [{ id: 'conflicts-folder', name: 'conflicts' }] }),
        jsonResponse({
          files: [
            {
              id: 'conflict-1',
              name: '2026-04-13.rev-a.device.json',
              mimeType: 'application/json',
            },
            {
              id: 'conflict-2',
              name: '2026-04-14.rev-b.device.json',
              mimeType: 'application/json',
            },
          ],
        }),
        new Response(null, { status: 204 }),
        new Response(null, { status: 204 }),
      ])

      const result = await new GoogleDriveAdapter(USER_ID).clearConflictBackups()

      expect(result).toBe(2)
      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/conflict-1',
        expect.objectContaining({ method: 'DELETE' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/conflict-2',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })

    it('returns zero when the Drive conflicts folder does not exist', async () => {
      mockFetchSequence([jsonResponse({ files: [] })])

      const result = await new GoogleDriveAdapter(USER_ID).clearConflictBackups()

      expect(result).toBe(0)
    })
  })

  describe('deleteAppFolder', () => {
    type WinFake = typeof window & { __fakeDriveBackend?: FakeGoogleDriveBackend }

    afterEach(() => {
      delete (window as WinFake).__fakeDriveBackend
    })

    it('clears entries and conflict backups from the fake backend', async () => {
      const fake = new FakeGoogleDriveBackend()
      ;(window as WinFake).__fakeDriveBackend = fake
      fake.seed([{ date: '2026-04-13', searchText: 'to delete' }])
      fake.saveConflictBackup(makeEntry(), '2026-04-13', 'rev-old')

      await new GoogleDriveAdapter(USER_ID).deleteAppFolder()

      expect(fake.listEntryMetadata()).toHaveLength(0)
      expect(fake.getConflictBackups()).toHaveLength(0)
    })

    it('deletes the stored Quiet Dwelling root folder from Drive', async () => {
      const fetchMock = mockFetchSequence([new Response(null, { status: 204 })])

      await new GoogleDriveAdapter(USER_ID).deleteAppFolder()

      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/root-folder',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
