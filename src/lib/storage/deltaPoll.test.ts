import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pollDriveDeltas } from './deltaPoll'
import { GoogleDriveError } from './providers/googleDriveTypes'
import type { EntryFile, EntryMetadata } from './types'

const {
  mockGetSyncState,
  mockSetSyncState,
  mockListMetadata,
  mockCacheSaveEntry,
  mockUpdateMetadata,
  mockDriveApiFetch,
  mockGetStoredGoogleDriveConnection,
  mockAdapterGetEntryByFileId,
  mockNotifyChanged,
  mockBackfillGoogleDriveMetadata,
} = vi.hoisted(() => ({
  mockGetSyncState: vi.fn(),
  mockSetSyncState: vi.fn().mockResolvedValue(undefined),
  mockListMetadata: vi.fn(),
  mockCacheSaveEntry: vi.fn().mockResolvedValue(undefined),
  mockUpdateMetadata: vi.fn().mockResolvedValue(null),
  mockDriveApiFetch: vi.fn(),
  mockGetStoredGoogleDriveConnection: vi.fn(),
  mockAdapterGetEntryByFileId: vi.fn(),
  mockNotifyChanged: vi.fn(),
  mockBackfillGoogleDriveMetadata: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./localEntryCache', () => ({
  localEntryCache: {
    getSyncState: (...args: unknown[]) => mockGetSyncState(...args),
    setSyncState: (...args: unknown[]) => mockSetSyncState(...args),
    listMetadata: (...args: unknown[]) => mockListMetadata(...args),
    saveEntry: (...args: unknown[]) => mockCacheSaveEntry(...args),
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
  },
}))

vi.mock('./providers/googleDriveAuth', () => ({
  driveApiFetch: (...args: unknown[]) => mockDriveApiFetch(...args),
  getStoredGoogleDriveConnection: (...args: unknown[]) =>
    mockGetStoredGoogleDriveConnection(...args),
}))

vi.mock('./providers/googleDriveAdapter', () => ({
  GoogleDriveAdapter: vi.fn().mockImplementation(function () {
    return {
      getEntryByFileId: (...args: unknown[]) => mockAdapterGetEntryByFileId(...args),
    }
  }),
}))

vi.mock('./entryRepository', () => ({
  EntryRepository: {
    notifyChanged: (...args: unknown[]) => mockNotifyChanged(...args),
  },
}))

vi.mock('./providerConnection', () => ({
  backfillGoogleDriveMetadata: (...args: unknown[]) => mockBackfillGoogleDriveMetadata(...args),
}))

function makeEntry(date = '2026-05-01'): EntryFile {
  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date,
    content: { type: 'doc', content: [] },
    searchText: 'Test entry',
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: 2,
    createdAt: '2026-05-01T08:00:00.000Z',
    updatedAt: '2026-05-01T09:00:00.000Z',
  }
}

function makeMetadata(date = '2026-05-01', overrides: Partial<EntryMetadata> = {}): EntryMetadata {
  return {
    date,
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 2,
    hasContent: true,
    updatedAt: '2026-05-01T09:00:00.000Z',
    lastSeenRevisionId: 'rev-1',
    syncStatus: 'synced',
    deletedAt: null,
    ...overrides,
  }
}

function makeStartPageTokenResponse() {
  return { startPageToken: 'token-abc' }
}

function makeChangesListResponse(changes: unknown[], newStartPageToken = 'token-xyz') {
  return {
    changes,
    newStartPageToken,
  }
}

function makeFileChange(overrides: Record<string, unknown> = {}) {
  return {
    fileId: 'file-123',
    file: {
      id: 'file-123',
      name: '2026-05-01.json',
      mimeType: 'application/json',
      headRevisionId: 'rev-2',
      modifiedTime: '2026-05-01T12:00:00.000Z',
      trashed: false,
      ...overrides,
    },
  }
}

const USER_ID = 'test-uid'

describe('pollDriveDeltas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockGetSyncState.mockResolvedValue(null)
    mockGetStoredGoogleDriveConnection.mockReturnValue({
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-05-01T00:00:00.000Z',
    })
    mockListMetadata.mockResolvedValue([])
    mockAdapterGetEntryByFileId.mockResolvedValue(makeEntry())
  })

  it('30s debounce: second call within 30s skips (no extra fetch)', async () => {
    const recentPoll = new Date(Date.now() - 5000).toISOString() // 5 seconds ago
    mockGetSyncState.mockResolvedValue({
      userId: USER_ID,
      lastDeltaPollAt: recentPoll,
      driveStartPageToken: 'page-token',
      driveEntriesFolderId: null,
      monthFolderIds: [],
    })

    await pollDriveDeltas(USER_ID)

    // Should skip — no driveApiFetch calls
    expect(mockDriveApiFetch).not.toHaveBeenCalled()
  })

  it('call after 30s gap executes', async () => {
    const oldPoll = new Date(Date.now() - 35000).toISOString() // 35 seconds ago
    mockGetSyncState.mockResolvedValue({
      userId: USER_ID,
      lastDeltaPollAt: oldPoll,
      driveStartPageToken: 'page-token',
      driveEntriesFolderId: null,
      monthFolderIds: [],
    })
    mockDriveApiFetch.mockResolvedValue(makeChangesListResponse([]))

    await pollDriveDeltas(USER_ID)

    expect(mockDriveApiFetch).toHaveBeenCalled()
  })

  it('no startPageToken → calls changes.getStartPageToken first, stores in syncState', async () => {
    mockGetSyncState.mockResolvedValue(null)
    mockDriveApiFetch
      .mockResolvedValueOnce(makeStartPageTokenResponse())
      .mockResolvedValueOnce(makeChangesListResponse([]))

    await pollDriveDeltas(USER_ID)

    const firstCall = mockDriveApiFetch.mock.calls[0] as [string, string]
    expect(firstCall[1]).toContain('startPageToken')

    expect(mockSetSyncState).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ driveStartPageToken: 'token-abc' }),
    )
  })

  it('change for clean entry with different headRevisionId → entry downloaded and saved with syncStatus: synced', async () => {
    mockGetSyncState.mockResolvedValue({
      userId: USER_ID,
      lastDeltaPollAt: null,
      driveStartPageToken: 'page-token',
      driveEntriesFolderId: null,
      monthFolderIds: [],
    })
    mockDriveApiFetch.mockResolvedValue(
      makeChangesListResponse([makeFileChange({ headRevisionId: 'rev-2' })]),
    )
    mockListMetadata.mockResolvedValue([
      makeMetadata('2026-05-01', { lastSeenRevisionId: 'rev-1' }),
    ])

    await pollDriveDeltas(USER_ID)

    expect(mockAdapterGetEntryByFileId).toHaveBeenCalledWith('file-123')
    expect(mockCacheSaveEntry).toHaveBeenCalledWith(
      USER_ID,
      expect.any(Object),
      'synced',
      expect.objectContaining({ syncStatus: 'synced' }),
    )
  })

  it('change for dirty entry → only remoteRevisionId + remoteUpdatedAt updated; body NOT replaced', async () => {
    mockGetSyncState.mockResolvedValue({
      userId: USER_ID,
      lastDeltaPollAt: null,
      driveStartPageToken: 'page-token',
      driveEntriesFolderId: null,
      monthFolderIds: [],
    })
    mockDriveApiFetch.mockResolvedValue(
      makeChangesListResponse([makeFileChange({ headRevisionId: 'rev-new' })]),
    )
    // Local entry is dirty (sync-pending)
    mockListMetadata.mockResolvedValue([
      makeMetadata('2026-05-01', { syncStatus: 'sync-pending', lastSeenRevisionId: 'rev-1' }),
    ])

    await pollDriveDeltas(USER_ID)

    // Body should NOT be replaced
    expect(mockCacheSaveEntry).not.toHaveBeenCalled()
    expect(mockAdapterGetEntryByFileId).not.toHaveBeenCalled()

    // Only metadata updated
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      USER_ID,
      '2026-05-01',
      expect.objectContaining({
        remoteRevisionId: 'rev-new',
        remoteUpdatedAt: '2026-05-01T12:00:00.000Z',
      }),
    )
  })

  it('change where lastSeenRevisionId === headRevisionId → no action', async () => {
    mockGetSyncState.mockResolvedValue({
      userId: USER_ID,
      lastDeltaPollAt: null,
      driveStartPageToken: 'page-token',
      driveEntriesFolderId: null,
      monthFolderIds: [],
    })
    mockDriveApiFetch.mockResolvedValue(
      makeChangesListResponse([makeFileChange({ headRevisionId: 'rev-1' })]),
    )
    // Revision already matches
    mockListMetadata.mockResolvedValue([
      makeMetadata('2026-05-01', { lastSeenRevisionId: 'rev-1' }),
    ])

    await pollDriveDeltas(USER_ID)

    expect(mockCacheSaveEntry).not.toHaveBeenCalled()
    expect(mockAdapterGetEntryByFileId).not.toHaveBeenCalled()
    expect(mockUpdateMetadata).not.toHaveBeenCalled()
  })

  it('trashed file → skipped', async () => {
    mockGetSyncState.mockResolvedValue({
      userId: USER_ID,
      lastDeltaPollAt: null,
      driveStartPageToken: 'page-token',
      driveEntriesFolderId: null,
      monthFolderIds: [],
    })
    mockDriveApiFetch.mockResolvedValue(
      makeChangesListResponse([makeFileChange({ trashed: true })]),
    )
    mockListMetadata.mockResolvedValue([])

    await pollDriveDeltas(USER_ID)

    expect(mockCacheSaveEntry).not.toHaveBeenCalled()
    expect(mockAdapterGetEntryByFileId).not.toHaveBeenCalled()
  })

  it('non-date filename (e.g. notes.json) → skipped', async () => {
    mockGetSyncState.mockResolvedValue({
      userId: USER_ID,
      lastDeltaPollAt: null,
      driveStartPageToken: 'page-token',
      driveEntriesFolderId: null,
      monthFolderIds: [],
    })
    mockDriveApiFetch.mockResolvedValue(
      makeChangesListResponse([makeFileChange({ name: 'notes.json', headRevisionId: 'rev-2' })]),
    )
    mockListMetadata.mockResolvedValue([])

    await pollDriveDeltas(USER_ID)

    expect(mockCacheSaveEntry).not.toHaveBeenCalled()
    expect(mockAdapterGetEntryByFileId).not.toHaveBeenCalled()
  })

  it('newStartPageToken stored in syncState after poll', async () => {
    mockGetSyncState.mockResolvedValue({
      userId: USER_ID,
      lastDeltaPollAt: null,
      driveStartPageToken: 'page-token',
      driveEntriesFolderId: null,
      monthFolderIds: [],
    })
    mockDriveApiFetch.mockResolvedValue(makeChangesListResponse([], 'new-token-999'))

    await pollDriveDeltas(USER_ID)

    expect(mockSetSyncState).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ driveStartPageToken: 'new-token-999' }),
    )
  })

  it('410 error → clear token, call backfill, re-bootstrap token', async () => {
    mockGetSyncState.mockResolvedValue({
      userId: USER_ID,
      lastDeltaPollAt: null,
      driveStartPageToken: 'expired-token',
      driveEntriesFolderId: null,
      monthFolderIds: [],
    })
    // driveApiFetch throws a GoogleDriveError with status 410
    mockDriveApiFetch.mockRejectedValue(
      Object.assign(new GoogleDriveError('retryable', 'Gone', 410), { status: 410 }),
    )

    // Should not throw
    await expect(pollDriveDeltas(USER_ID)).resolves.toBeUndefined()

    expect(mockSetSyncState).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ driveStartPageToken: null }),
    )
    expect(mockBackfillGoogleDriveMetadata).toHaveBeenCalledWith(USER_ID)
  })

  it('new entry on remote (no local metadata) → downloaded and saved', async () => {
    mockGetSyncState.mockResolvedValue({
      userId: USER_ID,
      lastDeltaPollAt: null,
      driveStartPageToken: 'page-token',
      driveEntriesFolderId: null,
      monthFolderIds: [],
    })
    mockDriveApiFetch.mockResolvedValue(
      makeChangesListResponse([makeFileChange({ headRevisionId: 'rev-1' })]),
    )
    // No local metadata
    mockListMetadata.mockResolvedValue([])

    await pollDriveDeltas(USER_ID)

    expect(mockAdapterGetEntryByFileId).toHaveBeenCalledWith('file-123')
    expect(mockCacheSaveEntry).toHaveBeenCalled()
  })
})
