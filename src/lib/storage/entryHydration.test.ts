import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EntryFile, EntryMetadata } from './types'

const {
  mockGetEntrySnapshot,
  mockSaveEntry,
  mockUpdateMetadata,
  mockGetEntry,
  mockIsConnectedOnDevice,
} = vi.hoisted(() => ({
  mockGetEntrySnapshot: vi.fn(),
  mockSaveEntry: vi.fn(),
  mockUpdateMetadata: vi.fn(),
  mockGetEntry: vi.fn(),
  mockIsConnectedOnDevice: vi.fn(),
}))

vi.mock('./localEntryCache', () => ({
  localEntryCache: {
    getEntrySnapshot: (...args: unknown[]) => mockGetEntrySnapshot(...args),
    saveEntry: (...args: unknown[]) => mockSaveEntry(...args),
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
    listMetadata: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('./syncCoordinator', () => ({
  syncCoordinator: {
    isConnectedOnDevice: (...args: unknown[]) => mockIsConnectedOnDevice(...args),
  },
}))

vi.mock('./providers/googleDriveAdapter', () => ({
  GoogleDriveAdapter: vi.fn().mockImplementation(function () {
    return { getEntry: (...args: unknown[]) => mockGetEntry(...args) }
  }),
}))

function makeEntry(overrides: Partial<EntryFile> = {}): EntryFile {
  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date: '2026-05-01',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    },
    searchText: 'Hello',
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeMetadata(overrides: Partial<EntryMetadata> = {}): EntryMetadata {
  return {
    date: '2026-05-01',
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 0,
    hasContent: false,
    updatedAt: '2026-05-01T00:00:00.000Z',
    lastSeenRevisionId: null,
    syncStatus: 'synced',
    deletedAt: null,
    providerFileId: 'file123',
    ...overrides,
  }
}

function metadataOnlySnapshot() {
  return { entry: null, metadata: makeMetadata(), localGen: 0, remoteRevId: null }
}

function presentSnapshot(entry: EntryFile) {
  return {
    entry,
    metadata: makeMetadata({ hasContent: true }),
    localGen: 1,
    remoteRevId: null,
  }
}

describe('openEntryHydration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockIsConnectedOnDevice.mockReturnValue(true)
    mockUpdateMetadata.mockResolvedValue(null)
    mockSaveEntry.mockResolvedValue(makeMetadata({ hasContent: true }))
    mockGetEntrySnapshot.mockResolvedValue({
      entry: null,
      metadata: null,
      localGen: 0,
      remoteRevId: null,
    })
  })

  it('returns present when entry exists locally', async () => {
    const entry = makeEntry({ wordCount: 2 })
    mockGetEntrySnapshot.mockResolvedValue(presentSnapshot(entry))

    const { openEntryHydration } = await import('./entryHydration')
    const state = await openEntryHydration('uid').get('2026-05-01')

    expect(state).toMatchObject({ kind: 'present', gen: 1, entry: { date: '2026-05-01' } })
    expect(mockGetEntry).not.toHaveBeenCalled()
  })

  it('manifest-only entry: get() triggers Drive fetch and returns present', async () => {
    const driveEntry = makeEntry({ wordCount: 3 })
    mockGetEntrySnapshot
      .mockResolvedValueOnce(metadataOnlySnapshot())
      .mockResolvedValue(presentSnapshot(driveEntry))
    mockGetEntry.mockResolvedValue(driveEntry)

    const { openEntryHydration } = await import('./entryHydration')
    const state = await openEntryHydration('uid').get('2026-05-01')

    expect(mockGetEntry).toHaveBeenCalledTimes(1)
    expect(state).toMatchObject({ kind: 'present', entry: { date: '2026-05-01' } })
  })

  it('Drive returns null for known manifest entry → missing, metadata pruned', async () => {
    mockGetEntrySnapshot.mockResolvedValue(metadataOnlySnapshot())
    mockGetEntry.mockResolvedValue(null)

    const { openEntryHydration } = await import('./entryHydration')
    const state = await openEntryHydration('uid').get('2026-05-01')

    expect(state).toMatchObject({ kind: 'missing' })
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'uid',
      '2026-05-01',
      expect.objectContaining({ deletedAt: expect.any(String) }),
    )
  })

  it('two concurrent get() calls issue only one Drive fetch', async () => {
    const driveEntry = makeEntry({ wordCount: 1 })
    mockGetEntrySnapshot
      .mockResolvedValueOnce(metadataOnlySnapshot())
      .mockResolvedValue(presentSnapshot(driveEntry))
    mockGetEntry.mockResolvedValue(driveEntry)

    const { openEntryHydration } = await import('./entryHydration')
    const hydration = openEntryHydration('uid')

    const [a, b] = await Promise.all([hydration.get('2026-05-01'), hydration.get('2026-05-01')])

    expect(mockGetEntry).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('empty local entry is pruned and returns missing', async () => {
    mockGetEntrySnapshot.mockResolvedValue({
      entry: makeEntry({ wordCount: 0, mood: null, tags: [], scriptureRefs: [] }),
      metadata: makeMetadata(),
      localGen: 1,
      remoteRevId: null,
    })

    const { openEntryHydration } = await import('./entryHydration')
    const state = await openEntryHydration('uid').get('2026-05-01')

    expect(state).toMatchObject({ kind: 'missing' })
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'uid',
      '2026-05-01',
      expect.objectContaining({ deletedAt: expect.any(String) }),
    )
  })

  it('empty Drive entry is pruned and returns missing', async () => {
    mockGetEntrySnapshot.mockResolvedValue(metadataOnlySnapshot())
    mockGetEntry.mockResolvedValue(
      makeEntry({ wordCount: 0, mood: null, tags: [], scriptureRefs: [] }),
    )

    const { openEntryHydration } = await import('./entryHydration')
    const state = await openEntryHydration('uid').get('2026-05-01')

    expect(state).toMatchObject({ kind: 'missing' })
    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      'uid',
      '2026-05-01',
      expect.objectContaining({ deletedAt: expect.any(String) }),
    )
  })

  it('metadata-only with Drive disconnected returns awaiting-network', async () => {
    mockIsConnectedOnDevice.mockReturnValue(false)
    mockGetEntrySnapshot.mockResolvedValue(metadataOnlySnapshot())

    const { openEntryHydration } = await import('./entryHydration')
    const state = await openEntryHydration('uid').get('2026-05-01')

    expect(state).toMatchObject({ kind: 'metadata-only', reason: 'awaiting-network' })
    expect(mockGetEntry).not.toHaveBeenCalled()
  })

  it('transient Drive error schedules auto-retry and notifies subscribers on success', async () => {
    const driveEntry = makeEntry({ wordCount: 2 })
    mockGetEntrySnapshot
      .mockResolvedValueOnce(metadataOnlySnapshot())
      .mockResolvedValue(presentSnapshot(driveEntry))
    mockGetEntry.mockRejectedValueOnce(new Error('network error')).mockResolvedValue(driveEntry)

    const { openEntryHydration } = await import('./entryHydration')
    const hydration = openEntryHydration('uid')

    const states: string[] = []
    hydration.subscribe('2026-05-01', (s) => states.push(s.kind))

    await vi.runAllTimersAsync()

    expect(states).toContain('failed')
    expect(states.at(-1)).toBe('present')
  })

  it('retry() resets attempt counter and re-fetches immediately', async () => {
    const driveEntry = makeEntry({ wordCount: 1 })
    mockGetEntrySnapshot
      .mockResolvedValueOnce(metadataOnlySnapshot())
      .mockResolvedValueOnce(metadataOnlySnapshot())
      .mockResolvedValue(presentSnapshot(driveEntry))
    mockGetEntry
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(driveEntry)

    const { openEntryHydration } = await import('./entryHydration')
    const hydration = openEntryHydration('uid')

    const initial = await hydration.get('2026-05-01')
    await vi.runAllTimersAsync()

    expect(initial).toMatchObject({ kind: 'failed' })

    const recovered = await hydration.retry('2026-05-01')
    expect(recovered).toMatchObject({ kind: 'present' })
  })

  it('reconnect error is not retried', async () => {
    const { GoogleDriveError } = await import('./providers/googleDriveTypes')
    mockGetEntrySnapshot.mockResolvedValue(metadataOnlySnapshot())
    mockGetEntry.mockRejectedValue(new GoogleDriveError('reconnect', 'Token expired'))

    const { openEntryHydration } = await import('./entryHydration')
    const state = await openEntryHydration('uid').get('2026-05-01')

    expect(state).toMatchObject({ kind: 'failed', retryable: false })
    await vi.runAllTimersAsync()
    expect(mockGetEntry).toHaveBeenCalledTimes(1)
  })
})
