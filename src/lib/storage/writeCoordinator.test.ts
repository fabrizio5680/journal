import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EntryFile, EntryMetadata } from './types'

const { mockGetEntrySnapshot, mockCommitEntry, mockIsConnectedOnDevice, mockEnqueue } = vi.hoisted(
  () => ({
    mockGetEntrySnapshot: vi.fn(),
    mockCommitEntry: vi.fn(),
    mockIsConnectedOnDevice: vi.fn(),
    mockEnqueue: vi.fn().mockResolvedValue(undefined),
  }),
)

vi.mock('./localEntryCache', () => ({
  localEntryCache: {
    getEntrySnapshot: (...args: unknown[]) => mockGetEntrySnapshot(...args),
    commitEntry: (...args: unknown[]) => mockCommitEntry(...args),
  },
}))

vi.mock('./syncCoordinator', () => ({
  syncCoordinator: {
    isConnectedOnDevice: (...args: unknown[]) => mockIsConnectedOnDevice(...args),
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
  },
}))

function makeEntry(overrides: Partial<EntryFile> = {}): EntryFile {
  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date: '2026-05-01',
    content: { type: 'doc', content: [] },
    searchText: 'Hello world',
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: 2,
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
    wordCount: 2,
    hasContent: true,
    updatedAt: '2026-05-01T00:00:00.000Z',
    lastSeenRevisionId: null,
    syncStatus: 'saved-local',
    deletedAt: null,
    ...overrides,
  }
}

describe('openWriteCoordinator', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockIsConnectedOnDevice.mockReturnValue(false)
    mockGetEntrySnapshot.mockResolvedValue({
      entry: null,
      metadata: null,
      localGen: 0,
      remoteRevId: null,
    })
    mockCommitEntry.mockResolvedValue({
      kind: 'committed',
      metadata: makeMetadata(),
      localGen: 1,
    })
  })

  it('read returns committed entry state with persisted generation', async () => {
    const entry = makeEntry()
    mockGetEntrySnapshot.mockResolvedValue({
      entry,
      metadata: makeMetadata(),
      localGen: 7,
      remoteRevId: null,
    })

    const { openWriteCoordinator } = await import('./writeCoordinator')
    const state = await openWriteCoordinator('uid').read('2026-05-01')

    expect(state).toMatchObject({ kind: 'committed', gen: 7, entry: { date: '2026-05-01' } })
  })

  it('content save passes the observed generation and bumps generation', async () => {
    const { openWriteCoordinator } = await import('./writeCoordinator')
    await openWriteCoordinator('uid').save({
      date: '2026-05-01',
      baseGen: 3,
      changes: { contentText: 'new words', wordCount: 2 },
      origin: 'user-edit',
    })

    expect(mockCommitEntry).toHaveBeenCalledWith(
      'uid',
      expect.objectContaining({ date: '2026-05-01' }),
      'saved-local',
      expect.objectContaining({ baseGen: 3, bumpGeneration: true }),
    )
  })

  it('metadata-only save commits without bumping generation', async () => {
    const { openWriteCoordinator } = await import('./writeCoordinator')
    await openWriteCoordinator('uid').save({
      date: '2026-05-01',
      baseGen: 3,
      changes: { mood: 4, moodLabel: 'peaceful' },
      origin: 'user-edit',
    })

    expect(mockCommitEntry).toHaveBeenCalledWith(
      'uid',
      expect.any(Object),
      'saved-local',
      expect.objectContaining({ baseGen: 3, bumpGeneration: false }),
    )
  })

  it('returns stale when the cache rejects the observed generation', async () => {
    mockCommitEntry.mockResolvedValue({
      kind: 'stale',
      current: makeEntry({ searchText: 'current' }),
      metadata: makeMetadata(),
      currentGen: 4,
    })

    const { openWriteCoordinator } = await import('./writeCoordinator')
    const result = await openWriteCoordinator('uid').save({
      date: '2026-05-01',
      baseGen: 3,
      changes: { contentText: 'old words', wordCount: 2 },
      origin: 'user-edit',
    })

    expect(result).toMatchObject({ kind: 'stale', currentGen: 4 })
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('non-empty connected save is queued for sync', async () => {
    mockIsConnectedOnDevice.mockReturnValue(true)

    const { openWriteCoordinator } = await import('./writeCoordinator')
    await openWriteCoordinator('uid').save({
      date: '2026-05-01',
      changes: { contentText: 'sync me', wordCount: 2 },
      origin: 'user-edit',
    })

    expect(mockCommitEntry).toHaveBeenCalledWith(
      'uid',
      expect.any(Object),
      'sync-pending',
      expect.any(Object),
    )
    expect(mockEnqueue).toHaveBeenCalledWith('uid', '2026-05-01')
  })
})
