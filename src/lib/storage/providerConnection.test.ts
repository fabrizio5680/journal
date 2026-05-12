import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  backfillGoogleDriveMetadata,
  connectGoogleDriveProvider,
  disconnectGoogleDriveProvider,
  getDeviceProviderState,
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
  mockAdapterConnect,
  mockAdapterDisconnect,
  mockAdapterGetEntryByFileId,
  mockAdapterListEntryMetadata,
  mockClearGoogleDriveAuthState,
  mockGetStoredGoogleDriveConnection,
  mockHydrateGoogleDriveConnectionFromMetadata,
  mockIsGoogleDriveLocallyDisconnected,
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
  mockAdapterConnect: vi.fn(),
  mockAdapterDisconnect: vi.fn().mockResolvedValue(undefined),
  mockAdapterGetEntryByFileId: vi.fn(),
  mockAdapterListEntryMetadata: vi.fn(),
  mockClearGoogleDriveAuthState: vi.fn(),
  mockGetStoredGoogleDriveConnection: vi.fn(),
  mockHydrateGoogleDriveConnectionFromMetadata: vi.fn(),
  mockIsGoogleDriveLocallyDisconnected: vi.fn(),
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
  },
}))

vi.mock('./providers/googleDriveAdapter', () => ({
  GoogleDriveAdapter: vi.fn().mockImplementation(function () {
    return {
      connect: (...args: unknown[]) => mockAdapterConnect(...args),
      disconnect: (...args: unknown[]) => mockAdapterDisconnect(...args),
      getEntryByFileId: (...args: unknown[]) => mockAdapterGetEntryByFileId(...args),
      listEntryMetadata: (...args: unknown[]) => mockAdapterListEntryMetadata(...args),
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
  setStoredGoogleDriveConnection: (...args: unknown[]) =>
    mockSetStoredGoogleDriveConnection(...args),
}))

vi.mock('./syncCoordinator', () => ({
  syncCoordinator: {
    syncPending: (...args: unknown[]) => mockSyncPending(...args),
  },
}))

describe('providerConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStoredGoogleDriveConnection.mockReturnValue(null)
    mockIsGoogleDriveLocallyDisconnected.mockReturnValue(false)
    mockAdapterConnect.mockResolvedValue({
      provider: 'googleDrive',
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })
    mockAdapterListEntryMetadata.mockResolvedValue([])
    mockAdapterGetEntryByFileId.mockRejectedValue(new Error('download failed'))
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

    expect(result).toBe(unsubscribe)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'connected',
        storageConnectedAt: '2026-04-13T10:00:00.000Z',
      }),
    )
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
})
