import { beforeEach, describe, expect, it, vi } from 'vitest'

import { syncCoordinator } from './syncCoordinator'
import { GoogleDriveError } from './providers/googleDriveTypes'
import type { EntryFile, EntryMetadata } from './types'

const {
  mockGetEntry,
  mockListMetadata,
  mockUpdateMetadata,
  mockSaveEntry,
  mockCacheSaveEntry,
  mockGetStoredGoogleDriveConnection,
  mockIsGoogleDriveLocallyDisconnected,
  mockSaveConflictBackup,
  mockAdapterGetEntry,
} = vi.hoisted(() => ({
  mockGetEntry: vi.fn(),
  mockListMetadata: vi.fn(),
  mockUpdateMetadata: vi.fn(),
  mockSaveEntry: vi.fn(),
  mockCacheSaveEntry: vi.fn(),
  mockGetStoredGoogleDriveConnection: vi.fn(),
  mockIsGoogleDriveLocallyDisconnected: vi.fn(),
  mockSaveConflictBackup: vi.fn().mockResolvedValue(undefined),
  mockAdapterGetEntry: vi.fn(),
}))

vi.mock('./localEntryCache', () => ({
  localEntryCache: {
    getEntry: (...args: unknown[]) => mockGetEntry(...args),
    listMetadata: (...args: unknown[]) => mockListMetadata(...args),
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
    saveEntry: (...args: unknown[]) => mockCacheSaveEntry(...args),
  },
}))

vi.mock('./providers/googleDriveAuth', () => ({
  getStoredGoogleDriveConnection: (...args: unknown[]) =>
    mockGetStoredGoogleDriveConnection(...args),
  isGoogleDriveLocallyDisconnected: (...args: unknown[]) =>
    mockIsGoogleDriveLocallyDisconnected(...args),
}))

vi.mock('./providers/googleDriveAdapter', () => ({
  GoogleDriveAdapter: vi.fn().mockImplementation(function () {
    return {
      saveEntry: (...args: unknown[]) => mockSaveEntry(...args),
      getEntry: (...args: unknown[]) => mockAdapterGetEntry(...args),
      saveConflictBackup: (...args: unknown[]) => mockSaveConflictBackup(...args),
    }
  }),
}))

vi.mock('./deviceFingerprint', () => ({
  getDeviceFingerprint: () =>
    Promise.resolve({ deviceId: 'test-device-id', deviceLabel: 'Test Device', generatedAt: 1 }),
}))

function makeEntry(date = '2026-04-13'): EntryFile {
  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date,
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

function makeMetadata(date = '2026-04-13', overrides: Partial<EntryMetadata> = {}): EntryMetadata {
  return {
    date,
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 3,
    hasContent: true,
    updatedAt: '2026-04-13T00:00:00.000Z',
    lastSeenRevisionId: 'revision-0',
    syncStatus: 'sync-pending',
    deletedAt: null,
    ...overrides,
  }
}

describe('syncCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockGetStoredGoogleDriveConnection.mockReturnValue({
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })
    mockIsGoogleDriveLocallyDisconnected.mockReturnValue(false)
    mockGetEntry.mockResolvedValue(makeEntry())
    mockListMetadata.mockResolvedValue([makeMetadata()])
    mockUpdateMetadata.mockResolvedValue(makeMetadata())
    mockCacheSaveEntry.mockResolvedValue(makeMetadata())
    mockAdapterGetEntry.mockResolvedValue(null)
    mockSaveEntry.mockResolvedValue({
      metadata: { providerFileId: 'entry-file' },
      revisionId: 'revision-1',
    })
  })

  it('reports whether Google Drive is connected on this device', () => {
    expect(syncCoordinator.isConnectedOnDevice('test-uid')).toBe(true)

    mockGetStoredGoogleDriveConnection.mockReturnValueOnce({
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
      reconnectRequired: true,
    })
    expect(syncCoordinator.isConnectedOnDevice('test-uid')).toBe(false)

    mockIsGoogleDriveLocallyDisconnected.mockReturnValueOnce(true)
    expect(syncCoordinator.isConnectedOnDevice('test-uid')).toBe(false)
  })

  it('uploads pending entries and stores provider revision metadata', async () => {
    await syncCoordinator.syncPending('test-uid')

    expect(mockSaveEntry).toHaveBeenCalledWith(makeEntry(), 'revision-0')
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({
        provider: 'googleDrive',
        providerFileId: 'entry-file',
        lastSeenRevisionId: 'revision-1',
        syncStatus: 'synced',
      }),
    )
  })

  it('uploads pending entries even when no local access token is cached', async () => {
    await syncCoordinator.syncPending('test-uid')

    expect(mockSaveEntry).toHaveBeenCalledWith(makeEntry(), 'revision-0')
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({ syncStatus: 'synced' }),
    )
  })

  it('marks pending entries reconnect when this device opted out locally', async () => {
    mockIsGoogleDriveLocallyDisconnected.mockReturnValue(true)

    await syncCoordinator.syncPending('test-uid')

    expect(mockSaveEntry).not.toHaveBeenCalled()
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({
        provider: 'googleDrive',
        syncStatus: 'reconnect',
        syncError: 'Google Drive needs to be reconnected.',
      }),
    )
  })

  it('maps provider storage-full error to local metadata status', async () => {
    mockListMetadata.mockResolvedValueOnce([makeMetadata('2026-04-13')])
    mockGetEntry.mockResolvedValueOnce(makeEntry('2026-04-13'))
    mockSaveEntry.mockRejectedValueOnce(
      new GoogleDriveError('storage-full', 'Drive storage is full.'),
    )

    await syncCoordinator.syncPending('test-uid')

    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({ syncStatus: 'storage-full' }),
    )
  })

  it('merges and re-uploads on conflict when remote entry exists', async () => {
    const remoteEntry = makeEntry()
    mockSaveEntry
      .mockRejectedValueOnce(new GoogleDriveError('conflict', 'Drive has a newer revision.'))
      .mockResolvedValueOnce({
        metadata: { providerFileId: 'entry-file' },
        revisionId: 'revision-2',
      })
    mockAdapterGetEntry.mockResolvedValueOnce(remoteEntry)

    await syncCoordinator.syncPending('test-uid')

    expect(mockCacheSaveEntry).toHaveBeenCalled()
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({ syncStatus: 'synced' }),
    )
  })

  it('marks conflict status when all re-push attempts fail', async () => {
    const remoteEntry = makeEntry()
    // Every saveEntry call throws conflict — simulates persistent remote racing
    mockSaveEntry.mockRejectedValue(new GoogleDriveError('conflict', 'Drive has a newer revision.'))
    mockAdapterGetEntry.mockResolvedValue(remoteEntry)

    await syncCoordinator.syncPending('test-uid')

    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({ syncStatus: 'conflict' }),
    )
  })

  it('schedules retryable errors without moving the entry out of pending', async () => {
    vi.useFakeTimers()
    mockSaveEntry.mockRejectedValueOnce(new GoogleDriveError('retryable', 'Try again later.', 429))

    await syncCoordinator.syncPending('test-uid')

    expect(mockUpdateMetadata).not.toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({ syncStatus: 'synced' }),
    )

    await vi.advanceTimersByTimeAsync(2000)

    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({
        provider: 'googleDrive',
        syncStatus: 'sync-pending',
      }),
    )
  })

  // ── New merge-on-conflict path tests ─────────────────────────────────────────

  it('conflict error on saveEntry → calls mergeEntries, writes conflict backup, saves merged entry, re-enqueues', async () => {
    const remoteEntry = makeEntry()
    mockSaveEntry
      .mockRejectedValueOnce(new GoogleDriveError('conflict', 'Drive has a newer revision.'))
      .mockResolvedValueOnce({
        metadata: { providerFileId: 'entry-file' },
        revisionId: 'revision-2',
      })
    mockAdapterGetEntry.mockResolvedValueOnce(remoteEntry)

    await syncCoordinator.syncPending('test-uid')

    // Backup saved
    expect(mockSaveConflictBackup).toHaveBeenCalled()
    // Merged entry saved locally
    expect(mockCacheSaveEntry).toHaveBeenCalledWith(
      'test-uid',
      expect.any(Object),
      'sync-pending',
      expect.objectContaining({ mergedFromDeviceId: 'test-device-id' }),
    )
  })

  it('merge with no mood conflict → entry pushed on re-enqueue', async () => {
    const remoteEntry = makeEntry()
    mockSaveEntry
      .mockRejectedValueOnce(new GoogleDriveError('conflict', 'Drive has a newer revision.'))
      .mockResolvedValueOnce({
        metadata: { providerFileId: 'entry-file' },
        revisionId: 'revision-2',
      })
    mockAdapterGetEntry.mockResolvedValueOnce(remoteEntry)

    await syncCoordinator.syncPending('test-uid')

    // After merge with no mood conflict, push should succeed
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({ syncStatus: 'synced' }),
    )
  })

  it('merge with mood conflict → syncStatus: merge-pending-mood, push NOT triggered', async () => {
    const localEntry = makeEntry()
    localEntry.mood = 5
    localEntry.moodLabel = 'joyful'

    const remoteEntry = makeEntry()
    remoteEntry.mood = 3
    remoteEntry.moodLabel = 'peaceful'

    mockGetEntry.mockResolvedValue(localEntry)
    mockListMetadata.mockResolvedValue([makeMetadata()])
    mockCacheSaveEntry.mockResolvedValue(makeMetadata())
    mockSaveEntry.mockRejectedValueOnce(
      new GoogleDriveError('conflict', 'Drive has a newer revision.'),
    )
    mockAdapterGetEntry.mockResolvedValueOnce(remoteEntry)

    await syncCoordinator.syncPending('test-uid')

    // Status should be merge-pending-mood, not synced
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({ syncStatus: 'merge-pending-mood' }),
    )

    // Push should NOT have been called a second time
    const syncedCalls = mockUpdateMetadata.mock.calls.filter(
      (call) =>
        (call as unknown[])[2] &&
        typeof (call as unknown[])[2] === 'object' &&
        ((call as unknown[])[2] as { syncStatus?: string }).syncStatus === 'synced',
    )
    expect(syncedCalls.length).toBe(0)
  })

  it('resolveMoodConflict updates mood, clears moodConflict, marks sync-pending, enqueues', async () => {
    const entry = makeEntry()
    entry.mood = 5
    entry.moodLabel = 'joyful'
    mockGetEntry.mockResolvedValue(entry)
    mockListMetadata.mockResolvedValue([makeMetadata()])
    mockCacheSaveEntry.mockResolvedValue(makeMetadata())
    mockUpdateMetadata.mockResolvedValue(makeMetadata())
    mockSaveEntry.mockResolvedValue({
      metadata: { providerFileId: 'entry-file' },
      revisionId: 'revision-1',
    })

    await syncCoordinator.resolveMoodConflict('test-uid', '2026-04-13', 3, 'peaceful')

    // Should save with new mood values and cleared moodConflict
    expect(mockCacheSaveEntry).toHaveBeenCalledWith(
      'test-uid',
      expect.objectContaining({ mood: 3, moodLabel: 'peaceful' }),
      'sync-pending',
      expect.objectContaining({ moodConflict: null }),
    )
  })

  it('double-conflict race: conflict on retry → mark syncStatus: conflict (not infinite loop)', async () => {
    const remoteEntry = makeEntry()
    // Every saveEntry call throws conflict
    mockSaveEntry.mockRejectedValue(new GoogleDriveError('conflict', 'Drive has a newer revision.'))
    mockAdapterGetEntry.mockResolvedValue(remoteEntry)

    await syncCoordinator.syncPending('test-uid')

    // After retry exhaustion, should be in 'conflict' status
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({ syncStatus: 'conflict' }),
    )
  })
})
