import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  backfillFromManifest,
  backfillGoogleDriveMetadata,
  connectGoogleDriveProvider,
  disconnectGoogleDriveProvider,
  getDeviceProviderState,
  initDriveSyncListeners,
  subscribeProviderConnection,
} from './providerConnection'

const { mockSetDriveLoadProgress } = vi.hoisted(() => ({
  mockSetDriveLoadProgress: vi.fn(),
}))

vi.mock('./driveLoadProgress', () => ({
  setDriveLoadProgress: (...args: unknown[]) => mockSetDriveLoadProgress(...args),
}))

const {
  mockDoc,
  mockOnSnapshot,
  mockServerTimestamp,
  mockSetDoc,
  mockSaveEntry,
  mockSaveMetadata,
  mockUpdateMetadata,
  mockListMetadata,
  mockAdapterConnect,
  mockAdapterDisconnect,
  mockAdapterGetEntryByFileId,
  mockAdapterListEntryMetadata,
  mockAdapterReadManifest,
  mockAdapterWriteManifest,
  mockClearGoogleDriveAuthState,
  mockGetStoredGoogleDriveConnection,
  mockHydrateGoogleDriveConnectionFromMetadata,
  mockIsGoogleDriveLocallyDisconnected,
  mockOpenDriveTokenSession,
  mockSetStoredGoogleDriveConnection,
  mockSyncPending,
  mockNotifyChanged,
} = vi.hoisted(() => ({
  mockDoc: vi.fn(() => ({ path: 'users/test-uid' })),
  mockOnSnapshot: vi.fn(),
  mockServerTimestamp: vi.fn(() => ({ serverTimestamp: true })),
  mockSetDoc: vi.fn().mockResolvedValue(undefined),
  mockSaveEntry: vi.fn().mockResolvedValue(undefined),
  mockSaveMetadata: vi.fn().mockResolvedValue(undefined),
  mockUpdateMetadata: vi.fn().mockResolvedValue(undefined),
  mockListMetadata: vi.fn().mockResolvedValue([]),
  mockAdapterConnect: vi.fn(),
  mockAdapterDisconnect: vi.fn().mockResolvedValue(undefined),
  mockAdapterGetEntryByFileId: vi.fn(),
  mockAdapterListEntryMetadata: vi.fn(),
  mockAdapterReadManifest: vi.fn().mockResolvedValue(null),
  mockAdapterWriteManifest: vi.fn().mockResolvedValue(undefined),
  mockClearGoogleDriveAuthState: vi.fn(),
  mockGetStoredGoogleDriveConnection: vi.fn(),
  mockHydrateGoogleDriveConnectionFromMetadata: vi.fn(),
  mockIsGoogleDriveLocallyDisconnected: vi.fn(),
  mockOpenDriveTokenSession: vi.fn(),
  mockSetStoredGoogleDriveConnection: vi.fn(),
  mockSyncPending: vi.fn().mockResolvedValue(undefined),
  mockNotifyChanged: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => (mockDoc as (...input: unknown[]) => unknown)(...args),
  onSnapshot: (...args: unknown[]) => (mockOnSnapshot as (...input: unknown[]) => unknown)(...args),
  serverTimestamp: () => mockServerTimestamp(),
  setDoc: (...args: unknown[]) => (mockSetDoc as (...input: unknown[]) => unknown)(...args),
}))

vi.mock('@/lib/firebase', () => ({
  db: {},
}))

vi.mock('./localEntryCache', () => ({
  localEntryCache: {
    saveEntry: (...args: unknown[]) => mockSaveEntry(...args),
    saveMetadata: (...args: unknown[]) => mockSaveMetadata(...args),
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
    listMetadata: (...args: unknown[]) => mockListMetadata(...args),
  },
}))

vi.mock('./providers/googleDriveAdapter', () => ({
  GoogleDriveAdapter: vi.fn().mockImplementation(function () {
    return {
      connect: (...args: unknown[]) => mockAdapterConnect(...args),
      disconnect: (...args: unknown[]) => mockAdapterDisconnect(...args),
      getEntryByFileId: (...args: unknown[]) => mockAdapterGetEntryByFileId(...args),
      listEntryMetadata: (...args: unknown[]) => mockAdapterListEntryMetadata(...args),
      readManifest: (...args: unknown[]) => mockAdapterReadManifest(...args),
      writeManifest: (...args: unknown[]) => mockAdapterWriteManifest(...args),
    }
  }),
}))

vi.mock('./entryRepository', () => ({
  EntryRepository: {
    notifyChanged: (...args: unknown[]) => mockNotifyChanged(...args),
  },
}))

vi.mock('./providers/googleDriveAuth', () => ({
  clearGoogleDriveAuthState: (...args: unknown[]) => mockClearGoogleDriveAuthState(...args),
  getStoredGoogleDriveConnection: (...args: unknown[]) =>
    mockGetStoredGoogleDriveConnection(...args),
  hydrateGoogleDriveConnectionFromMetadata: (...args: unknown[]) =>
    mockHydrateGoogleDriveConnectionFromMetadata(...args),
  isGoogleDriveLocallyDisconnected: (...args: unknown[]) =>
    mockIsGoogleDriveLocallyDisconnected(...args),
  openDriveTokenSession: (userId: string) => mockOpenDriveTokenSession(userId),
  setStoredGoogleDriveConnection: (...args: unknown[]) =>
    mockSetStoredGoogleDriveConnection(...args),
}))

vi.mock('./syncCoordinator', () => ({
  syncCoordinator: {
    syncPending: (...args: unknown[]) => mockSyncPending(...args),
  },
}))

const { mockPollDriveDeltas } = vi.hoisted(() => ({
  mockPollDriveDeltas: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./deltaPoll', () => ({
  pollDriveDeltas: (...args: unknown[]) => mockPollDriveDeltas(...args),
}))

describe('providerConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStoredGoogleDriveConnection.mockReturnValue(null)
    mockIsGoogleDriveLocallyDisconnected.mockReturnValue(false)
    mockOpenDriveTokenSession.mockReturnValue({
      status: () => 'disconnected',
      onStatusChange: vi.fn(() => vi.fn()),
    })
    mockAdapterConnect.mockResolvedValue({
      provider: 'googleDrive',
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })
    mockAdapterListEntryMetadata.mockResolvedValue([])
    mockAdapterGetEntryByFileId.mockRejectedValue(new Error('download failed'))
    mockAdapterReadManifest.mockResolvedValue(null)
    mockAdapterWriteManifest.mockResolvedValue(undefined)
    mockUpdateMetadata.mockResolvedValue(null)
  })

  it('derives disconnected, connected, and reconnect device states', () => {
    expect(getDeviceProviderState('test-uid', {})).toMatchObject({
      status: 'disconnected',
      deviceConnected: false,
    })

    mockGetStoredGoogleDriveConnection.mockReturnValueOnce({
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })
    mockOpenDriveTokenSession.mockReturnValueOnce({ status: () => 'connected' })
    expect(
      getDeviceProviderState('test-uid', {
        activeStorageProvider: 'googleDrive',
        storageAccountEmail: 'drive@example.com',
        storageRootFolderId: 'root-folder',
        storageConnectedAt: '2026-04-13T00:00:00.000Z',
      }),
    ).toMatchObject({ status: 'connected', deviceConnected: true })
    expect(mockHydrateGoogleDriveConnectionFromMetadata).toHaveBeenCalledWith(
      'test-uid',
      expect.objectContaining({
        accountEmail: 'drive@example.com',
        rootFolderId: 'root-folder',
      }),
    )

    mockGetStoredGoogleDriveConnection.mockReturnValueOnce({
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
      reconnectRequired: true,
    })
    mockOpenDriveTokenSession.mockReturnValueOnce({ status: () => 'connected' })
    expect(
      getDeviceProviderState('test-uid', {
        activeStorageProvider: 'googleDrive',
        storageAccountEmail: 'drive@example.com',
        storageRootFolderId: 'root-folder',
        storageConnectedAt: '2026-04-13T00:00:00.000Z',
      }),
    ).toMatchObject({ status: 'reconnect', deviceConnected: false })

    mockIsGoogleDriveLocallyDisconnected.mockReturnValueOnce(true)
    expect(
      getDeviceProviderState('test-uid', {
        activeStorageProvider: 'googleDrive',
        storageAccountEmail: 'drive@example.com',
        storageRootFolderId: 'root-folder',
        storageConnectedAt: '2026-04-13T00:00:00.000Z',
      }),
    ).toMatchObject({ status: 'disconnected', deviceConnected: false })
  })

  it('subscribes to Firestore provider metadata and normalizes timestamps', () => {
    const unsubscribe = vi.fn()
    const tokenUnsubscribe = vi.fn()
    mockOpenDriveTokenSession.mockReturnValue({
      status: () => 'connected',
      onStatusChange: vi.fn(() => tokenUnsubscribe),
    })
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      onNext({
        data: () => ({
          activeStorageProvider: 'googleDrive',
          storageAccountEmail: 'drive@example.com',
          storageRootFolderId: 'root-folder',
          storageConnectedAt: {
            toDate: () => new Date('2026-04-13T10:00:00.000Z'),
          },
        }),
      })
      return unsubscribe
    })
    mockGetStoredGoogleDriveConnection.mockReturnValue({
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })
    const onChange = vi.fn()

    const result = subscribeProviderConnection('test-uid', onChange)

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'connected',
        storageConnectedAt: '2026-04-13T10:00:00.000Z',
      }),
    )
    result()
    expect(unsubscribe).toHaveBeenCalled()
    expect(tokenUnsubscribe).toHaveBeenCalled()
  })

  it('connects Google Drive and writes only non-secret provider metadata', async () => {
    await connectGoogleDriveProvider('test-uid', 'app@example.com')

    expect(mockAdapterConnect).toHaveBeenCalled()
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      {
        activeStorageProvider: 'googleDrive',
        storageAccountEmail: 'drive@example.com',
        storageRootFolderId: 'root-folder',
        storageConnectedAt: { serverTimestamp: true },
        storageTokenStatus: 'valid',
      },
      { merge: true },
    )
    expect(mockSetStoredGoogleDriveConnection).toHaveBeenCalledWith(
      'test-uid',
      expect.objectContaining({
        accountEmail: 'drive@example.com',
        rootFolderId: 'root-folder',
      }),
    )
    expect(mockSyncPending).toHaveBeenCalledWith('test-uid')
  })

  it('disconnects only this device without deleting shared provider metadata', async () => {
    await disconnectGoogleDriveProvider('test-uid')

    expect(mockAdapterDisconnect).toHaveBeenCalled()
    expect(mockClearGoogleDriveAuthState).toHaveBeenCalledWith('test-uid')
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('backfills Drive JSON and saves the full entry with provider metadata', async () => {
    const item = {
      date: '2026-04-13',
      mood: null,
      moodLabel: null,
      tags: [],
      wordCount: 0,
      hasContent: true,
      updatedAt: '2026-04-13T10:00:00.000Z',
      provider: 'googleDrive',
      providerFileId: 'entry-file',
      lastSeenRevisionId: 'revision-1',
      lastSyncedAt: '2026-04-13T10:00:00.000Z',
      syncStatus: 'synced',
      deletedAt: null,
    }
    const entry = {
      schemaVersion: 1,
      app: 'quiet-dwelling',
      date: '2026-04-13',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      searchText: 'Peace and mercy',
      mood: 4,
      moodLabel: 'grateful',
      tags: ['faith', 'work'],
      scriptureRefs: [],
      wordCount: 3,
      createdAt: '2026-04-13T09:00:00.000Z',
      updatedAt: '2026-04-13T10:00:00.000Z',
    }
    mockAdapterListEntryMetadata.mockResolvedValue([item])
    mockAdapterGetEntryByFileId.mockResolvedValue(entry)

    await backfillGoogleDriveMetadata('test-uid')

    expect(mockAdapterGetEntryByFileId).toHaveBeenCalledWith('entry-file')
    expect(mockSaveEntry).toHaveBeenCalledWith('test-uid', entry, 'synced', {
      provider: 'googleDrive',
      providerFileId: 'entry-file',
      lastSeenRevisionId: 'revision-1',
      lastSyncedAt: '2026-04-13T10:00:00.000Z',
      syncStatus: 'synced',
      syncError: undefined,
    })
    expect(mockSaveEntry.mock.calls[0][1]).toMatchObject({
      mood: 4,
      moodLabel: 'grateful',
      tags: ['faith', 'work'],
      wordCount: 3,
    })
    expect(mockUpdateMetadata).not.toHaveBeenCalled()
    expect(mockSaveMetadata).not.toHaveBeenCalled()
    expect(mockNotifyChanged).toHaveBeenCalledWith('test-uid')
  })

  it('falls back to metadata-only rows when Drive JSON download fails', async () => {
    const existing = {
      date: '2026-04-13',
      mood: null,
      moodLabel: null,
      tags: [],
      wordCount: 0,
      hasContent: true,
      updatedAt: '2026-04-13T10:00:00.000Z',
      provider: 'googleDrive',
      providerFileId: 'existing-file',
      lastSeenRevisionId: 'revision-1',
      lastSyncedAt: '2026-04-13T10:00:00.000Z',
      syncStatus: 'synced',
      deletedAt: null,
    }
    const missing = { ...existing, date: '2026-04-14', providerFileId: 'missing-file' }
    mockAdapterListEntryMetadata.mockResolvedValue([existing, missing])
    mockUpdateMetadata.mockResolvedValueOnce(existing)
    mockUpdateMetadata.mockResolvedValueOnce(null)

    await backfillGoogleDriveMetadata('test-uid')

    expect(mockUpdateMetadata).toHaveBeenCalledWith('test-uid', '2026-04-13', {
      provider: 'googleDrive',
      providerFileId: 'existing-file',
      lastSeenRevisionId: 'revision-1',
      lastSyncedAt: '2026-04-13T10:00:00.000Z',
      syncStatus: 'synced',
      syncError: undefined,
    })
    expect(mockSaveMetadata).toHaveBeenCalledWith('test-uid', missing)
    expect(mockSaveEntry).not.toHaveBeenCalled()
    expect(mockNotifyChanged).toHaveBeenCalledWith('test-uid')
  })

  it('falls back to metadata-only rows when downloaded Drive JSON is invalid', async () => {
    const item = {
      date: '2026-04-13',
      mood: null,
      moodLabel: null,
      tags: [],
      wordCount: 0,
      hasContent: true,
      updatedAt: '2026-04-13T10:00:00.000Z',
      provider: 'googleDrive',
      providerFileId: 'invalid-file',
      lastSeenRevisionId: 'revision-1',
      lastSyncedAt: '2026-04-13T10:00:00.000Z',
      syncStatus: 'synced',
      deletedAt: null,
    }
    mockAdapterListEntryMetadata.mockResolvedValue([item])
    mockAdapterGetEntryByFileId.mockResolvedValue({ app: 'quiet-dwelling' })
    mockUpdateMetadata.mockResolvedValue(null)

    await backfillGoogleDriveMetadata('test-uid')

    expect(mockSaveEntry).not.toHaveBeenCalled()
    expect(mockSaveMetadata).toHaveBeenCalledWith('test-uid', item)
  })

  it('emits listing phase, per-entry progress, then clears on backfill', async () => {
    const item = {
      date: '2026-04-13',
      mood: null,
      moodLabel: null,
      tags: [],
      wordCount: 0,
      hasContent: true,
      updatedAt: '2026-04-13T10:00:00.000Z',
      provider: 'googleDrive',
      providerFileId: 'file-1',
      lastSeenRevisionId: null,
      lastSyncedAt: '2026-04-13T10:00:00.000Z',
      syncStatus: 'synced',
      deletedAt: null,
    }
    mockAdapterListEntryMetadata.mockResolvedValue([item])
    mockUpdateMetadata.mockResolvedValue(item)

    await backfillGoogleDriveMetadata('test-uid')

    const calls = mockSetDriveLoadProgress.mock.calls.map((c) => c[0])
    expect(calls[0]).toEqual({ loaded: 0, total: 0 })
    expect(calls[1]).toEqual({ loaded: 0, total: 1 })
    expect(calls).toContainEqual({ loaded: 1, total: 1 })
    expect(calls[calls.length - 1]).toBeNull()
  })

  it('clears progress in finally when listing throws', async () => {
    mockAdapterListEntryMetadata.mockRejectedValue(new Error('list failed'))

    await expect(backfillGoogleDriveMetadata('test-uid')).rejects.toThrow('list failed')

    const calls = mockSetDriveLoadProgress.mock.calls.map((c) => c[0])
    expect(calls[0]).toEqual({ loaded: 0, total: 0 })
    expect(calls[calls.length - 1]).toBeNull()
    expect(mockNotifyChanged).not.toHaveBeenCalled()
  })

  it('clears progress in finally when metadata fallback processing throws', async () => {
    const item = {
      date: '2026-04-13',
      mood: null,
      moodLabel: null,
      tags: [],
      wordCount: 0,
      hasContent: true,
      updatedAt: '2026-04-13T10:00:00.000Z',
      provider: 'googleDrive',
      providerFileId: 'file-1',
      lastSeenRevisionId: null,
      lastSyncedAt: '2026-04-13T10:00:00.000Z',
      syncStatus: 'synced',
      deletedAt: null,
    }
    mockAdapterListEntryMetadata.mockResolvedValue([item])
    mockUpdateMetadata.mockRejectedValue(new Error('metadata failed'))

    await expect(backfillGoogleDriveMetadata('test-uid')).rejects.toThrow('metadata failed')

    const calls = mockSetDriveLoadProgress.mock.calls.map((c) => c[0])
    expect(calls[0]).toEqual({ loaded: 0, total: 0 })
    expect(calls[1]).toEqual({ loaded: 0, total: 1 })
    expect(calls[calls.length - 1]).toBeNull()
    expect(mockNotifyChanged).not.toHaveBeenCalled()
  })

  it('emits listing and zero-entry completion when Drive has no entries', async () => {
    mockAdapterListEntryMetadata.mockResolvedValue([])

    await backfillGoogleDriveMetadata('test-uid')

    const calls = mockSetDriveLoadProgress.mock.calls.map((c) => c[0])
    expect(calls[0]).toEqual({ loaded: 0, total: 0 })
    expect(calls[1]).toEqual({ loaded: 0, total: 0 })
    expect(calls[calls.length - 1]).toBeNull()
    expect(mockNotifyChanged).toHaveBeenCalledWith('test-uid')
  })

  // ── New hydrate guard and initDriveSyncListeners tests ──────────────────────

  it('hydrate: when local entry exists with syncStatus: sync-pending → Drive entry for same date is NOT written to cache', async () => {
    const item = {
      date: '2026-04-13',
      mood: null,
      moodLabel: null,
      tags: [],
      wordCount: 5,
      hasContent: true,
      updatedAt: '2026-04-13T10:00:00.000Z',
      provider: 'googleDrive',
      providerFileId: 'drive-file',
      lastSeenRevisionId: 'revision-1',
      lastSyncedAt: '2026-04-13T10:00:00.000Z',
      syncStatus: 'synced',
      deletedAt: null,
    }
    mockAdapterListEntryMetadata.mockResolvedValue([item])

    // Local entry is dirty (sync-pending)
    mockListMetadata.mockResolvedValue([
      {
        ...item,
        syncStatus: 'sync-pending',
      },
    ])

    await backfillGoogleDriveMetadata('test-uid')

    // Drive entry body should NOT be written to cache (no saveEntry call)
    expect(mockSaveEntry).not.toHaveBeenCalled()
    // Also no Drive download should have happened
    expect(mockAdapterGetEntryByFileId).not.toHaveBeenCalled()
  })

  it('initDriveSyncListeners: fires syncPending + pollDriveDeltas immediately on call', () => {
    const cleanup = initDriveSyncListeners('test-uid')

    expect(mockSyncPending).toHaveBeenCalledWith('test-uid')
    expect(mockPollDriveDeltas).toHaveBeenCalledWith('test-uid')

    // Clean up listeners to avoid polluting other tests
    cleanup()
  })

  it('initDriveSyncListeners: calls backfillFromManifest once on boot and not on subsequent events', async () => {
    const cleanup = initDriveSyncListeners('test-uid')

    // Flush the microtask queue so backfillFromManifest's async work runs
    await Promise.resolve()

    // backfillFromManifest invokes adapter.readManifest — verify it was called exactly once at boot
    expect(mockAdapterReadManifest).toHaveBeenCalledTimes(1)

    // Firing online, visibilitychange, and pageshow should NOT trigger another backfillFromManifest
    window.dispatchEvent(new Event('online'))
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pageshow'))

    // Give any async work another tick to settle
    await Promise.resolve()

    // Still only called once — only boot fires backfillFromManifest
    expect(mockAdapterReadManifest).toHaveBeenCalledTimes(1)

    cleanup()
  })

  // ── backfillFromManifest tests ───────────────────────────────────────────────

  describe('backfillFromManifest', () => {
    it('returns early without touching cache when manifest is null', async () => {
      mockAdapterReadManifest.mockResolvedValue(null)

      await backfillFromManifest('test-uid')

      expect(mockSaveMetadata).not.toHaveBeenCalled()
      expect(mockNotifyChanged).not.toHaveBeenCalled()
    })

    it('saves metadata rows for manifest entries that do not exist locally', async () => {
      const manifestEntry = {
        date: '2026-04-20',
        mood: 4 as const,
        moodLabel: 'grateful',
        tags: ['faith'],
        wordCount: 10,
        providerFileId: 'file-manifest-1',
      }
      mockAdapterReadManifest.mockResolvedValue([manifestEntry])
      // listMetadata returns empty — entry not in local cache
      mockListMetadata.mockResolvedValue([])

      await backfillFromManifest('test-uid')

      expect(mockSaveMetadata).toHaveBeenCalledWith(
        'test-uid',
        expect.objectContaining({
          date: '2026-04-20',
          mood: 4,
          moodLabel: 'grateful',
          tags: ['faith'],
          wordCount: 10,
          providerFileId: 'file-manifest-1',
          syncStatus: 'synced',
        }),
      )
      expect(mockNotifyChanged).toHaveBeenCalledWith('test-uid')
    })

    it('skips manifest entries where local syncStatus !== synced (dirty guard)', async () => {
      const manifestEntry = {
        date: '2026-04-21',
        mood: null as null,
        moodLabel: null,
        tags: [],
        wordCount: 5,
        providerFileId: 'file-manifest-2',
      }
      mockAdapterReadManifest.mockResolvedValue([manifestEntry])
      // Local entry is dirty (sync-pending)
      mockListMetadata.mockResolvedValue([
        {
          date: '2026-04-21',
          mood: null,
          moodLabel: null,
          tags: [],
          wordCount: 5,
          hasContent: true,
          updatedAt: '2026-04-21T10:00:00.000Z',
          provider: 'googleDrive',
          providerFileId: 'file-manifest-2',
          lastSeenRevisionId: null,
          syncStatus: 'sync-pending',
          deletedAt: null,
        },
      ])

      await backfillFromManifest('test-uid')

      // Dirty local entry must NOT be overwritten
      expect(mockSaveMetadata).not.toHaveBeenCalled()
      // notifyChanged is still called after the loop
      expect(mockNotifyChanged).toHaveBeenCalledWith('test-uid')
    })

    it('skips manifest entries that already exist locally as synced (no overwrite)', async () => {
      const manifestEntry = {
        date: '2026-04-22',
        mood: 3 as const,
        moodLabel: 'peaceful',
        tags: ['morning'],
        wordCount: 8,
        providerFileId: 'file-manifest-3',
      }
      mockAdapterReadManifest.mockResolvedValue([manifestEntry])
      // Entry already exists and is synced
      mockListMetadata.mockResolvedValue([
        {
          date: '2026-04-22',
          mood: 3,
          moodLabel: 'peaceful',
          tags: ['morning'],
          wordCount: 8,
          hasContent: true,
          updatedAt: '2026-04-22T10:00:00.000Z',
          provider: 'googleDrive',
          providerFileId: 'file-manifest-3',
          lastSeenRevisionId: null,
          syncStatus: 'synced',
          deletedAt: null,
        },
      ])

      await backfillFromManifest('test-uid')

      // Already-synced entry must NOT be overwritten either
      expect(mockSaveMetadata).not.toHaveBeenCalled()
      expect(mockNotifyChanged).toHaveBeenCalledWith('test-uid')
    })

    it('calls notifyChanged after populating all manifest entries', async () => {
      const manifestEntries = [
        {
          date: '2026-04-23',
          mood: null as null,
          moodLabel: null,
          tags: [],
          wordCount: 0,
          providerFileId: 'file-a',
        },
        {
          date: '2026-04-24',
          mood: null as null,
          moodLabel: null,
          tags: [],
          wordCount: 0,
          providerFileId: 'file-b',
        },
      ]
      mockAdapterReadManifest.mockResolvedValue(manifestEntries)
      mockListMetadata.mockResolvedValue([])

      await backfillFromManifest('test-uid')

      expect(mockSaveMetadata).toHaveBeenCalledTimes(2)
      expect(mockNotifyChanged).toHaveBeenCalledTimes(1)
      expect(mockNotifyChanged).toHaveBeenCalledWith('test-uid')
    })
  })

  // ── backfillGoogleDriveMetadata manifest integration tests ──────────────────

  it('backfillGoogleDriveMetadata: reads manifest (backfillFromManifest) before full backfill', async () => {
    mockAdapterListEntryMetadata.mockResolvedValue([])

    await backfillGoogleDriveMetadata('test-uid')

    // readManifest is called once inside backfillFromManifest
    expect(mockAdapterReadManifest).toHaveBeenCalled()
  })

  it('backfillGoogleDriveMetadata: writes manifest at end when none existed before', async () => {
    // No manifest on Drive
    mockAdapterReadManifest.mockResolvedValue(null)

    const entry = {
      date: '2026-04-25',
      mood: 4 as const,
      moodLabel: 'grateful',
      tags: ['faith'],
      wordCount: 5,
      hasContent: true,
      updatedAt: '2026-04-25T10:00:00.000Z',
      provider: 'googleDrive' as const,
      providerFileId: 'file-new',
      lastSeenRevisionId: 'rev-1',
      lastSyncedAt: '2026-04-25T10:00:00.000Z',
      syncStatus: 'synced' as const,
      deletedAt: null,
    }
    const entryFile = {
      schemaVersion: 1 as const,
      app: 'quiet-dwelling' as const,
      date: '2026-04-25',
      content: { type: 'doc', content: [] },
      searchText: 'grace',
      mood: 4 as const,
      moodLabel: 'grateful',
      tags: ['faith'],
      scriptureRefs: [],
      wordCount: 5,
      createdAt: '2026-04-25T09:00:00.000Z',
      updatedAt: '2026-04-25T10:00:00.000Z',
    }
    mockAdapterListEntryMetadata.mockResolvedValue([entry])
    mockAdapterGetEntryByFileId.mockResolvedValue(entryFile)
    // After full backfill, listMetadata returns the saved metadata
    mockListMetadata.mockResolvedValue([{ ...entry, providerFileId: 'file-new' }])

    await backfillGoogleDriveMetadata('test-uid')

    // writeManifest should be called to bootstrap the manifest
    expect(mockAdapterWriteManifest).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ providerFileId: 'file-new' })]),
    )
  })

  it('backfillGoogleDriveMetadata: writes manifest even when one already existed (repairs pre-existing entries)', async () => {
    // Manifest already exists on Drive but may be incomplete
    mockAdapterReadManifest.mockResolvedValue([
      {
        date: '2026-04-26',
        mood: null,
        moodLabel: null,
        tags: [],
        wordCount: 0,
        providerFileId: 'file-existing',
      },
    ])
    mockAdapterListEntryMetadata.mockResolvedValue([])
    mockListMetadata.mockResolvedValue([
      {
        date: '2026-04-26',
        mood: null,
        moodLabel: null,
        tags: [],
        wordCount: 0,
        providerFileId: 'file-existing',
        hasContent: false,
        updatedAt: '2026-04-26T10:00:00.000Z',
        provider: 'googleDrive' as const,
        lastSeenRevisionId: null,
        syncStatus: 'synced' as const,
        deletedAt: null,
      },
    ])

    await backfillGoogleDriveMetadata('test-uid')

    // writeManifest must be called to capture any pre-existing entries missed before manifest was introduced
    expect(mockAdapterWriteManifest).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ providerFileId: 'file-existing' })]),
    )
  })
})
