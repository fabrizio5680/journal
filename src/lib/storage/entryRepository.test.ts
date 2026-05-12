import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EntryFile, EntryMetadata } from './types'

const {
  mockCacheGetEntry,
  mockCacheSaveEntry,
  mockCacheListMetadata,
  mockCacheListEntries,
  mockCacheUpdateMetadata,
  mockAdapterGetEntry,
  mockAdapterListEntryMetadata,
  mockGetStoredGoogleDriveConnection,
  mockIsGoogleDriveLocallyDisconnected,
  mockSyncCoordinatorIsConnected,
  mockSyncCoordinatorEnqueue,
  mockSetDriveLoadProgress,
  mockSetDoc,
} = vi.hoisted(() => ({
  mockCacheGetEntry: vi.fn(),
  mockCacheSaveEntry: vi.fn(),
  mockCacheListMetadata: vi.fn(),
  mockCacheListEntries: vi.fn(),
  mockCacheUpdateMetadata: vi.fn(),
  mockAdapterGetEntry: vi.fn(),
  mockAdapterListEntryMetadata: vi.fn(),
  mockGetStoredGoogleDriveConnection: vi.fn(),
  mockIsGoogleDriveLocallyDisconnected: vi.fn().mockReturnValue(false),
  mockSyncCoordinatorIsConnected: vi.fn().mockReturnValue(false),
  mockSyncCoordinatorEnqueue: vi.fn().mockResolvedValue(undefined),
  mockSetDriveLoadProgress: vi.fn(),
  mockSetDoc: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./localEntryCache', () => ({
  localEntryCache: {
    getEntry: (...args: unknown[]) => mockCacheGetEntry(...args),
    saveEntry: (...args: unknown[]) => mockCacheSaveEntry(...args),
    listMetadata: (...args: unknown[]) => mockCacheListMetadata(...args),
    listEntries: (...args: unknown[]) => mockCacheListEntries(...args),
    updateMetadata: (...args: unknown[]) => mockCacheUpdateMetadata(...args),
  },
}))

vi.mock('./providers/googleDriveAdapter', () => ({
  GoogleDriveAdapter: vi.fn().mockImplementation(function () {
    return {
      getEntry: (...args: unknown[]) => mockAdapterGetEntry(...args),
      listEntryMetadata: (...args: unknown[]) => mockAdapterListEntryMetadata(...args),
    }
  }),
}))

vi.mock('./providers/googleDriveAuth', () => ({
  getStoredGoogleDriveConnection: (...args: unknown[]) =>
    mockGetStoredGoogleDriveConnection(...args),
  isGoogleDriveLocallyDisconnected: (...args: unknown[]) =>
    mockIsGoogleDriveLocallyDisconnected(...args),
}))

vi.mock('./syncCoordinator', () => ({
  syncCoordinator: {
    isConnectedOnDevice: (...args: unknown[]) => mockSyncCoordinatorIsConnected(...args),
    enqueue: (...args: unknown[]) => mockSyncCoordinatorEnqueue(...args),
    subscribe: vi.fn(() => vi.fn()),
    syncPending: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('./driveLoadProgress', () => ({
  setDriveLoadProgress: (...args: unknown[]) => mockSetDriveLoadProgress(...args),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'users/test-uid' })),
  serverTimestamp: vi.fn(() => ({ serverTimestamp: true })),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}))

vi.mock('@/lib/firebase', () => ({
  db: {},
}))

function makeMetadata(overrides: Partial<EntryMetadata> = {}): EntryMetadata {
  return {
    date: '2026-05-01',
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 0,
    hasContent: false,
    updatedAt: '2026-05-01T10:00:00.000Z',
    lastSeenRevisionId: null,
    syncStatus: 'saved-local',
    deletedAt: null,
    ...overrides,
  }
}

describe('EntryRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheSaveEntry.mockResolvedValue(makeMetadata())
    mockCacheGetEntry.mockResolvedValue(null)
    mockCacheListMetadata.mockResolvedValue([])
    mockCacheListEntries.mockResolvedValue([])
    mockCacheUpdateMetadata.mockResolvedValue(null)
    mockSyncCoordinatorIsConnected.mockReturnValue(false)
  })

  describe('saveEntry', () => {
    it('empty draft (null mood, empty tags, empty scriptureRefs, 0 wordCount) → syncStatus: saved-local not sync-pending', async () => {
      // Drive connected but entry is empty
      mockSyncCoordinatorIsConnected.mockReturnValue(true)

      const { EntryRepository } = await import('./entryRepository')

      await EntryRepository.saveEntry('test-uid', '2026-05-01', {
        content: { type: 'doc', content: [] },
        contentText: '',
        mood: null,
        moodLabel: null,
        tags: [],
        scriptureRefs: [],
        wordCount: 0,
      })

      expect(mockCacheSaveEntry).toHaveBeenCalledWith('test-uid', expect.any(Object), 'saved-local')
      // Should NOT enqueue for sync because entry is empty
      expect(mockSyncCoordinatorEnqueue).not.toHaveBeenCalled()
    })

    it('non-empty draft with Drive connected → syncStatus: sync-pending', async () => {
      mockSyncCoordinatorIsConnected.mockReturnValue(true)

      const { EntryRepository } = await import('./entryRepository')

      await EntryRepository.saveEntry('test-uid', '2026-05-01', {
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        contentText: 'Hello world',
        mood: null,
        moodLabel: null,
        tags: [],
        scriptureRefs: [],
        wordCount: 2,
      })

      expect(mockCacheSaveEntry).toHaveBeenCalledWith(
        'test-uid',
        expect.any(Object),
        'sync-pending',
      )
    })
  })

  describe('searchEntries', () => {
    function makeEntryRecord(
      date: string,
      searchText: string,
      tags: string[],
      moodLabel: string | null = null,
    ) {
      return {
        date,
        content: {},
        contentText: searchText,
        searchText,
        mood: null,
        moodLabel,
        tags,
        wordCount: searchText.split(' ').length,
        deleted: false,
        deletedAt: null,
        scriptureRefs: [],
        createdAt: `${date}T00:00:00.000Z`,
        updatedAt: `${date}T00:00:00.000Z`,
      }
    }

    it('returns all matching entries when filters.tags is empty', async () => {
      mockCacheListEntries.mockResolvedValue([
        makeEntryRecord('2026-05-01', 'faith morning', ['faith', 'morning']),
        makeEntryRecord('2026-05-02', 'work day', ['work']),
      ])

      const { EntryRepository } = await import('./entryRepository')
      const results = await EntryRepository.searchEntries('uid', '', { tags: [] })

      expect(results).toHaveLength(2)
    })

    it('returns only entries containing ALL selected tags when filters.tags is set', async () => {
      mockCacheListEntries.mockResolvedValue([
        // both 'faith' and 'morning' → should match
        makeEntryRecord('2026-05-01', 'faith morning entry', ['faith', 'morning']),
        // only 'faith' → should NOT match when filtering by ['faith','morning']
        makeEntryRecord('2026-05-02', 'faith only entry', ['faith']),
        // completely different tag → should NOT match
        makeEntryRecord('2026-05-03', 'work entry', ['work']),
      ])

      const { EntryRepository } = await import('./entryRepository')
      const results = await EntryRepository.searchEntries('uid', '', {
        tags: ['faith', 'morning'],
      })

      expect(results).toHaveLength(1)
      expect(results[0].date).toBe('2026-05-01')
    })

    it('filters by single tag returning all entries that include it', async () => {
      mockCacheListEntries.mockResolvedValue([
        makeEntryRecord('2026-05-04', 'faith morning', ['faith', 'morning']),
        makeEntryRecord('2026-05-05', 'faith only', ['faith']),
        makeEntryRecord('2026-05-06', 'work entry', ['work']),
      ])

      const { EntryRepository } = await import('./entryRepository')
      const results = await EntryRepository.searchEntries('uid', '', { tags: ['faith'] })

      expect(results).toHaveLength(2)
      const dates = results.map((r) => r.date)
      expect(dates).toContain('2026-05-04')
      expect(dates).toContain('2026-05-05')
    })

    it('combines text query with tag filter', async () => {
      mockCacheListEntries.mockResolvedValue([
        makeEntryRecord('2026-05-07', 'grace abounds in faith', ['faith']),
        makeEntryRecord('2026-05-08', 'peace and joy', ['faith']),
      ])

      const { EntryRepository } = await import('./entryRepository')
      // Both have 'faith' tag, but only first has 'grace' text
      const results = await EntryRepository.searchEntries('uid', 'grace', { tags: ['faith'] })

      expect(results).toHaveLength(1)
      expect(results[0].date).toBe('2026-05-07')
    })
  })

  describe('getEntry', () => {
    it('returns null and sets reconnect status when Drive returns entry with schemaVersion > 1', async () => {
      // No local cache
      mockCacheGetEntry.mockResolvedValue(null)
      mockSyncCoordinatorIsConnected.mockReturnValue(true)

      // Drive returns entry with schemaVersion: 2
      const futureEntry = {
        schemaVersion: 2,
        app: 'quiet-dwelling',
        date: '2026-05-01',
        content: { type: 'doc', content: [] },
        searchText: 'hello',
        mood: null,
        moodLabel: null,
        tags: [],
        scriptureRefs: [],
        wordCount: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      } as unknown as EntryFile

      mockAdapterGetEntry.mockResolvedValue(futureEntry)
      mockCacheListMetadata.mockResolvedValue([makeMetadata()])

      const { EntryRepository } = await import('./entryRepository')
      const result = await EntryRepository.getEntry('test-uid', '2026-05-01')

      // Should return null
      expect(result).toBeNull()

      // Should update metadata with reconnect status
      expect(mockCacheUpdateMetadata).toHaveBeenCalledWith(
        'test-uid',
        '2026-05-01',
        expect.objectContaining({ syncStatus: 'reconnect' }),
      )
    })

    it('returns entry from local cache when available (no Drive fetch)', async () => {
      const localEntry: EntryFile = {
        schemaVersion: 1,
        app: 'quiet-dwelling',
        date: '2026-05-01',
        content: { type: 'doc', content: [] },
        searchText: 'local content',
        mood: null,
        moodLabel: null,
        tags: [],
        scriptureRefs: [],
        wordCount: 2,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      }
      mockCacheGetEntry.mockResolvedValue(localEntry)

      const { EntryRepository } = await import('./entryRepository')
      const result = await EntryRepository.getEntry('test-uid', '2026-05-01')

      expect(result).not.toBeNull()
      expect(result?.date).toBe('2026-05-01')
      expect(mockAdapterGetEntry).not.toHaveBeenCalled()
    })
  })
})
