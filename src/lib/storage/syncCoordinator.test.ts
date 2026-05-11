import { beforeEach, describe, expect, it, vi } from 'vitest'

import { syncCoordinator } from './syncCoordinator'
import { GoogleDriveError } from './providers/googleDriveTypes'
import type { EntryFile, EntryMetadata } from './types'

const {
  mockGetEntry,
  mockListMetadata,
  mockUpdateMetadata,
  mockSaveEntry,
  mockGetStoredGoogleDriveConnection,
  mockHasUsableGoogleDriveToken,
} = vi.hoisted(() => ({
  mockGetEntry: vi.fn(),
  mockListMetadata: vi.fn(),
  mockUpdateMetadata: vi.fn(),
  mockSaveEntry: vi.fn(),
  mockGetStoredGoogleDriveConnection: vi.fn(),
  mockHasUsableGoogleDriveToken: vi.fn(),
}))

vi.mock('./localEntryCache', () => ({
  localEntryCache: {
    getEntry: (...args: unknown[]) => mockGetEntry(...args),
    listMetadata: (...args: unknown[]) => mockListMetadata(...args),
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
  },
}))

vi.mock('./providers/googleDriveAuth', () => ({
  getStoredGoogleDriveConnection: (...args: unknown[]) =>
    mockGetStoredGoogleDriveConnection(...args),
  hasUsableGoogleDriveToken: (...args: unknown[]) => mockHasUsableGoogleDriveToken(...args),
}))

vi.mock('./providers/googleDriveAdapter', () => ({
  GoogleDriveAdapter: vi.fn().mockImplementation(function () {
    return {
      saveEntry: (...args: unknown[]) => mockSaveEntry(...args),
    }
  }),
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
    mockHasUsableGoogleDriveToken.mockReturnValue(true)
    mockGetEntry.mockResolvedValue(makeEntry())
    mockListMetadata.mockResolvedValue([makeMetadata()])
    mockUpdateMetadata.mockResolvedValue(makeMetadata())
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

  it('marks pending entries reconnect when token access is unavailable', async () => {
    mockHasUsableGoogleDriveToken.mockReturnValue(false)

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

  it('maps provider storage-full and conflict errors to local metadata status', async () => {
    mockListMetadata.mockResolvedValueOnce([makeMetadata('2026-04-13'), makeMetadata('2026-04-14')])
    mockGetEntry.mockResolvedValueOnce(makeEntry('2026-04-13'))
    mockGetEntry.mockResolvedValueOnce(makeEntry('2026-04-14'))
    mockSaveEntry.mockRejectedValueOnce(
      new GoogleDriveError('storage-full', 'Drive storage is full.'),
    )
    mockSaveEntry.mockRejectedValueOnce(
      new GoogleDriveError('conflict', 'Drive has a newer revision.'),
    )

    await syncCoordinator.syncPending('test-uid')

    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({ syncStatus: 'storage-full' }),
    )
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-14',
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
})
