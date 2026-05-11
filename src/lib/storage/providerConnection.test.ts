import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  backfillGoogleDriveMetadata,
  connectGoogleDriveProvider,
  disconnectGoogleDriveProvider,
  getDeviceProviderState,
  subscribeProviderConnection,
} from './providerConnection'

const {
  mockDeleteField,
  mockDoc,
  mockOnSnapshot,
  mockServerTimestamp,
  mockSetDoc,
  mockUpdateDoc,
  mockSaveMetadata,
  mockUpdateMetadata,
  mockAdapterConnect,
  mockAdapterDisconnect,
  mockAdapterListEntryMetadata,
  mockClearGoogleDriveAuthState,
  mockGetStoredGoogleDriveConnection,
  mockSetStoredGoogleDriveConnection,
  mockSyncPending,
} = vi.hoisted(() => ({
  mockDeleteField: vi.fn(() => ({ deleteField: true })),
  mockDoc: vi.fn(() => ({ path: 'users/test-uid' })),
  mockOnSnapshot: vi.fn(),
  mockServerTimestamp: vi.fn(() => ({ serverTimestamp: true })),
  mockSetDoc: vi.fn().mockResolvedValue(undefined),
  mockUpdateDoc: vi.fn().mockResolvedValue(undefined),
  mockSaveMetadata: vi.fn().mockResolvedValue(undefined),
  mockUpdateMetadata: vi.fn().mockResolvedValue(undefined),
  mockAdapterConnect: vi.fn(),
  mockAdapterDisconnect: vi.fn().mockResolvedValue(undefined),
  mockAdapterListEntryMetadata: vi.fn(),
  mockClearGoogleDriveAuthState: vi.fn(),
  mockGetStoredGoogleDriveConnection: vi.fn(),
  mockSetStoredGoogleDriveConnection: vi.fn(),
  mockSyncPending: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('firebase/firestore', () => ({
  deleteField: () => mockDeleteField(),
  doc: (...args: unknown[]) => (mockDoc as (...input: unknown[]) => unknown)(...args),
  onSnapshot: (...args: unknown[]) => (mockOnSnapshot as (...input: unknown[]) => unknown)(...args),
  serverTimestamp: () => mockServerTimestamp(),
  setDoc: (...args: unknown[]) => (mockSetDoc as (...input: unknown[]) => unknown)(...args),
  updateDoc: (...args: unknown[]) => (mockUpdateDoc as (...input: unknown[]) => unknown)(...args),
}))

vi.mock('@/lib/firebase', () => ({
  db: {},
}))

vi.mock('./localEntryCache', () => ({
  localEntryCache: {
    saveMetadata: (...args: unknown[]) => mockSaveMetadata(...args),
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
  },
}))

vi.mock('./providers/googleDriveAdapter', () => ({
  GoogleDriveAdapter: vi.fn().mockImplementation(function () {
    return {
      connect: (...args: unknown[]) => mockAdapterConnect(...args),
      disconnect: (...args: unknown[]) => mockAdapterDisconnect(...args),
      listEntryMetadata: (...args: unknown[]) => mockAdapterListEntryMetadata(...args),
    }
  }),
}))

vi.mock('./providers/googleDriveAuth', () => ({
  clearGoogleDriveAuthState: (...args: unknown[]) => mockClearGoogleDriveAuthState(...args),
  getStoredGoogleDriveConnection: (...args: unknown[]) =>
    mockGetStoredGoogleDriveConnection(...args),
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
    mockAdapterConnect.mockResolvedValue({
      provider: 'googleDrive',
      accountEmail: 'drive@example.com',
      rootFolderId: 'root-folder',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })
    mockAdapterListEntryMetadata.mockResolvedValue([])
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
        storageRootFolderId: 'root-folder',
      }),
    ).toMatchObject({ status: 'connected', deviceConnected: true })

    mockGetStoredGoogleDriveConnection.mockReturnValueOnce({
      accountEmail: 'drive@example.com',
      rootFolderId: 'other-root',
      connectedAt: '2026-04-13T00:00:00.000Z',
    })
    expect(
      getDeviceProviderState('test-uid', {
        activeStorageProvider: 'googleDrive',
        storageRootFolderId: 'root-folder',
      }),
    ).toMatchObject({ status: 'reconnect', deviceConnected: false })
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

  it('disconnects without deleting Drive files and clears provider fields', async () => {
    await disconnectGoogleDriveProvider('test-uid')

    expect(mockAdapterDisconnect).toHaveBeenCalled()
    expect(mockClearGoogleDriveAuthState).toHaveBeenCalledWith('test-uid')
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeStorageProvider: { deleteField: true },
        storageAccountEmail: { deleteField: true },
        storageRootFolderId: { deleteField: true },
        storageConnectedAt: { deleteField: true },
      }),
    )
  })

  it('backfills existing metadata and creates metadata-only rows when needed', async () => {
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

    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({
        providerFileId: 'existing-file',
        syncStatus: 'synced',
      }),
    )
    expect(mockSaveMetadata).toHaveBeenCalledWith('test-uid', missing)
  })
})
