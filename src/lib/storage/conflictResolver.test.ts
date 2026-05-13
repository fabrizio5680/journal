import { beforeEach, describe, expect, it, vi } from 'vitest'

import { conflictResolver } from './conflictResolver'
import type { ConflictRecordStore, EntryFile } from './types'

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockGetConflict,
  mockSetConflict,
  mockDeleteConflict,
  mockListConflicts,
  mockSaveEntry,
  mockSaveConflictBackup,
} = vi.hoisted(() => ({
  mockGetConflict: vi.fn(),
  mockSetConflict: vi.fn(),
  mockDeleteConflict: vi.fn(),
  mockListConflicts: vi.fn(),
  mockSaveEntry: vi.fn(),
  mockSaveConflictBackup: vi.fn(),
}))

vi.mock('./localEntryCache', () => ({
  localEntryCache: {
    getConflict: mockGetConflict,
    setConflict: mockSetConflict,
    deleteConflict: mockDeleteConflict,
    listConflicts: mockListConflicts,
    saveEntry: mockSaveEntry,
  },
}))

vi.mock('./providers/googleDriveAdapter', () => ({
  GoogleDriveAdapter: class {
    saveConflictBackup(...args: unknown[]) {
      return mockSaveConflictBackup(...args)
    }
  },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(overrides: Partial<EntryFile> = {}): EntryFile {
  return {
    schemaVersion: 1,
    app: 'quiet-dwelling',
    date: '2026-05-01',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Local' }] }],
    },
    searchText: 'Local',
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: 1,
    createdAt: '2026-05-01T08:00:00.000Z',
    updatedAt: '2026-05-01T09:00:00.000Z',
    ...overrides,
  }
}

function makeRemoteFile(overrides: Partial<EntryFile> = {}): EntryFile {
  return makeFile({
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remote' }] }],
    },
    searchText: 'Remote',
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T11:00:00.000Z',
    ...overrides,
  })
}

const USER = 'user-1'
const DATE = '2026-05-01'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('conflictResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConflict.mockResolvedValue(null)
    mockSetConflict.mockResolvedValue(undefined)
    mockDeleteConflict.mockResolvedValue(undefined)
    mockListConflicts.mockResolvedValue([])
    mockSaveEntry.mockResolvedValue({})
    mockSaveConflictBackup.mockResolvedValue('fake-backup-id')
  })

  describe('record()', () => {
    it('awaits backup before returning — backupStatus saved on success', async () => {
      // conflictResolver is statically imported above
      mockSaveConflictBackup.mockResolvedValue('backup-file-123')

      const { conflict } = await conflictResolver.record(
        USER,
        DATE,
        makeFile(),
        makeRemoteFile(),
        'MacBook',
      )

      expect(conflict.backupRef).toBe('backup-file-123')
      expect(conflict.backupStatus).toBe('saved')
    })

    it('backup fails → backupStatus failed, record still persisted', async () => {
      // conflictResolver is statically imported above
      mockSaveConflictBackup.mockResolvedValue(null)

      const { conflict } = await conflictResolver.record(
        USER,
        DATE,
        makeFile(),
        makeRemoteFile(),
        'MacBook',
      )

      expect(conflict.backupRef).toBeNull()
      expect(conflict.backupStatus).toBe('failed')
      expect(mockSetConflict).toHaveBeenCalled()
    })

    it('mood conflict with local=null, remote=3 → proposed.mood is null', async () => {
      // conflictResolver is statically imported above
      const local = makeFile({ mood: null, moodLabel: null })
      const remote = makeRemoteFile({ mood: 3, moodLabel: 'peaceful' })

      const { conflict, proposedFile } = await conflictResolver.record(
        USER,
        DATE,
        local,
        remote,
        'iPhone',
      )

      expect(proposedFile.mood).toBeNull()
      expect(proposedFile.moodLabel).toBeNull()
      expect(conflict.proposed.mood).toBeNull()
      expect(conflict.kinds).toContain('mood')
    })

    it('mood conflict with both non-null and different → proposed.mood is null', async () => {
      // conflictResolver is statically imported above
      const local = makeFile({ mood: 5, moodLabel: 'joyful' })
      const remote = makeRemoteFile({ mood: 2, moodLabel: 'weary' })

      const { proposedFile } = await conflictResolver.record(USER, DATE, local, remote, 'iPhone')

      expect(proposedFile.mood).toBeNull()
    })

    it('no mood conflict when both moods are same → proposed preserves mood', async () => {
      // conflictResolver is statically imported above
      const local = makeFile({ mood: 4, moodLabel: 'grateful' })
      const remote = makeRemoteFile({ mood: 4, moodLabel: 'grateful' })

      const { conflict, proposedFile } = await conflictResolver.record(
        USER,
        DATE,
        local,
        remote,
        'iPad',
      )

      expect(proposedFile.mood).toBe(4)
      expect(conflict.kinds).not.toContain('mood')
    })

    it('detects content kind when Tiptap content differs', async () => {
      // conflictResolver is statically imported above
      const { conflict } = await conflictResolver.record(
        USER,
        DATE,
        makeFile(),
        makeRemoteFile(),
        'iPad',
      )
      expect(conflict.kinds).toContain('content')
    })

    it('detects tags kind on symmetric difference', async () => {
      // conflictResolver is statically imported above
      const local = makeFile({ tags: ['faith'] })
      const remote = makeRemoteFile({ tags: ['hope'] })

      const { conflict } = await conflictResolver.record(USER, DATE, local, remote, 'iPad')
      expect(conflict.kinds).toContain('tags')
    })

    it('no tags kind when both tag lists are identical', async () => {
      // conflictResolver is statically imported above
      const local = makeFile({ tags: ['faith', 'hope'] })
      const remote = makeRemoteFile({ tags: ['faith', 'hope'] })

      const { conflict } = await conflictResolver.record(USER, DATE, local, remote, 'iPad')
      expect(conflict.kinds).not.toContain('tags')
    })

    it('returns existing record without re-recording when backupStatus is saved', async () => {
      // conflictResolver is statically imported above
      const existing: ConflictRecordStore = {
        date: DATE,
        detectedAt: 1000,
        remoteDevice: 'iPad',
        kinds: ['content'],
        proposedFile: makeFile(),
        localFile: makeFile(),
        remoteFile: makeRemoteFile(),
        backupRef: 'existing-backup-id',
        backupStatus: 'saved',
      }
      mockGetConflict.mockResolvedValue(existing)

      await conflictResolver.record(USER, DATE, makeFile(), makeRemoteFile(), 'NewDevice')

      expect(mockSaveConflictBackup).not.toHaveBeenCalled()
      expect(mockSetConflict).not.toHaveBeenCalled()
    })

    it('re-records when existing backupStatus is failed', async () => {
      // conflictResolver is statically imported above
      const existing: ConflictRecordStore = {
        date: DATE,
        detectedAt: 1000,
        remoteDevice: 'iPad',
        kinds: ['content'],
        proposedFile: makeFile(),
        localFile: makeFile(),
        remoteFile: makeRemoteFile(),
        backupRef: null,
        backupStatus: 'failed',
      }
      mockGetConflict.mockResolvedValue(existing)
      mockSaveConflictBackup.mockResolvedValue('retry-backup-id')

      const { conflict } = await conflictResolver.record(
        USER,
        DATE,
        makeFile(),
        makeRemoteFile(),
        'NewDevice',
      )

      expect(conflict.backupStatus).toBe('saved')
      expect(mockSetConflict).toHaveBeenCalled()
    })

    it('persists conflict record with detectedAt timestamp', async () => {
      // conflictResolver is statically imported above
      const before = Date.now()
      await conflictResolver.record(USER, DATE, makeFile(), makeRemoteFile(), 'iPad')
      const after = Date.now()

      const [, store] = mockSetConflict.mock.calls[0] as unknown as [string, ConflictRecordStore]
      expect(store.detectedAt).toBeGreaterThanOrEqual(before)
      expect(store.detectedAt).toBeLessThanOrEqual(after)
    })
  })

  describe('resolve()', () => {
    function makeStore(overrides: Partial<ConflictRecordStore> = {}): ConflictRecordStore {
      return {
        date: DATE,
        detectedAt: 1000,
        remoteDevice: 'iPad',
        kinds: ['content'],
        proposedFile: makeFile({ content: { type: 'doc', content: [] }, searchText: 'Merged' }),
        localFile: makeFile(),
        remoteFile: makeRemoteFile(),
        backupRef: 'backup-123',
        backupStatus: 'saved',
        ...overrides,
      }
    }

    it('throws when no conflict record exists for date', async () => {
      // conflictResolver is statically imported above
      mockGetConflict.mockResolvedValue(null)

      await expect(
        conflictResolver.resolve(USER, DATE, { kind: 'accept-proposed' }),
      ).rejects.toThrow(/No conflict record/)
    })

    it('throws when backup not saved (backupRef null)', async () => {
      // conflictResolver is statically imported above
      mockGetConflict.mockResolvedValue(makeStore({ backupRef: null, backupStatus: 'failed' }))

      await expect(
        conflictResolver.resolve(USER, DATE, { kind: 'accept-proposed' }),
      ).rejects.toThrow(/resolve blocked/)
    })

    it('accept-proposed throws when proposed.mood is null and mood conflict exists', async () => {
      // conflictResolver is statically imported above
      mockGetConflict.mockResolvedValue(
        makeStore({
          kinds: ['content', 'mood'],
          proposedFile: makeFile({ mood: null }),
        }),
      )

      await expect(
        conflictResolver.resolve(USER, DATE, { kind: 'accept-proposed' }),
      ).rejects.toThrow(/Mood conflict/)
    })

    it('accept-proposed succeeds for content-only conflict (mood not in kinds)', async () => {
      // conflictResolver is statically imported above
      mockGetConflict.mockResolvedValue(
        makeStore({
          kinds: ['content'],
          proposedFile: makeFile({ mood: null }),
        }),
      )

      await expect(
        conflictResolver.resolve(USER, DATE, { kind: 'accept-proposed' }),
      ).resolves.toBeUndefined()
      expect(mockSaveEntry).toHaveBeenCalled()
      expect(mockDeleteConflict).toHaveBeenCalledWith(USER, DATE)
    })

    it('keep-local writes local entry to cache', async () => {
      // conflictResolver is statically imported above
      const store = makeStore()
      mockGetConflict.mockResolvedValue(store)

      await conflictResolver.resolve(USER, DATE, { kind: 'keep-local' })

      const [, savedEntry] = mockSaveEntry.mock.calls[0] as unknown as [string, EntryFile]
      expect(savedEntry.content).toEqual(store.localFile.content)
    })

    it('keep-remote writes remote entry to cache', async () => {
      // conflictResolver is statically imported above
      const store = makeStore()
      mockGetConflict.mockResolvedValue(store)

      await conflictResolver.resolve(USER, DATE, { kind: 'keep-remote' })

      const [, savedEntry] = mockSaveEntry.mock.calls[0] as unknown as [string, EntryFile]
      expect(savedEntry.content).toEqual(store.remoteFile.content)
    })

    it('custom resolution applies provided entry mood onto proposed content', async () => {
      // conflictResolver is statically imported above
      mockGetConflict.mockResolvedValue(
        makeStore({
          kinds: ['content', 'mood'],
          proposedFile: makeFile({ mood: null, moodLabel: null }),
        }),
      )

      await conflictResolver.resolve(USER, DATE, {
        kind: 'custom',
        entry: {
          date: DATE,
          content: { type: 'doc', content: [] },
          contentText: '',
          searchText: '',
          mood: 4,
          moodLabel: 'grateful',
          tags: [],
          scriptureRefs: [],
          wordCount: 0,
          deleted: false,
          deletedAt: null,
          createdAt: '2026-05-01T08:00:00.000Z',
          updatedAt: '2026-05-01T09:00:00.000Z',
        },
      })

      const [, savedEntry] = mockSaveEntry.mock.calls[0] as unknown as [string, EntryFile]
      expect(savedEntry.mood).toBe(4)
      expect(savedEntry.moodLabel).toBe('grateful')
    })

    it('resolve saves entry as sync-pending and deletes conflict record', async () => {
      // conflictResolver is statically imported above
      mockGetConflict.mockResolvedValue(makeStore())

      await conflictResolver.resolve(USER, DATE, { kind: 'keep-local' })

      const [, , status] = mockSaveEntry.mock.calls[0] as unknown as [string, EntryFile, string]
      expect(status).toBe('sync-pending')
      expect(mockDeleteConflict).toHaveBeenCalledWith(USER, DATE)
    })

    it('resolve clears moodConflict in metadata patch', async () => {
      // conflictResolver is statically imported above
      mockGetConflict.mockResolvedValue(makeStore())

      await conflictResolver.resolve(USER, DATE, { kind: 'keep-local' })

      const [, , , patch] = mockSaveEntry.mock.calls[0] as unknown as [
        string,
        EntryFile,
        string,
        Record<string, unknown>,
      ]
      expect(patch.moodConflict).toBeNull()
    })
  })

  describe('pending()', () => {
    it('returns empty array when no conflicts', async () => {
      // conflictResolver is statically imported above
      mockListConflicts.mockResolvedValue([])

      const result = await conflictResolver.pending(USER)
      expect(result).toEqual([])
    })

    it('maps ConflictRecordStore to public ConflictRecord', async () => {
      // conflictResolver is statically imported above
      const store: ConflictRecordStore = {
        date: DATE,
        detectedAt: 1234,
        remoteDevice: 'iPad',
        kinds: ['content'],
        proposedFile: makeFile(),
        localFile: makeFile(),
        remoteFile: makeRemoteFile(),
        backupRef: 'bkp-1',
        backupStatus: 'saved',
      }
      mockListConflicts.mockResolvedValue([store])

      const [record] = await conflictResolver.pending(USER)
      expect(record.date).toBe(DATE)
      expect(record.detectedAt).toBe(1234)
      expect(record.backupStatus).toBe('saved')
      // proposed is Entry (has contentText), not EntryFile
      expect('contentText' in record.proposed).toBe(true)
    })
  })

  describe('subscribe()', () => {
    it('calls listener immediately with current pending records', async () => {
      // conflictResolver is statically imported above
      mockListConflicts.mockResolvedValue([])

      const listener = vi.fn()
      const unsub = conflictResolver.subscribe(USER, listener)

      await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([]))
      unsub()
    })

    it('notifies subscribers after record() completes', async () => {
      // conflictResolver is statically imported above

      const listener = vi.fn()
      const unsub = conflictResolver.subscribe(USER, listener)

      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
      listener.mockClear()

      mockListConflicts.mockResolvedValue([
        {
          date: DATE,
          detectedAt: 1,
          remoteDevice: 'iPad',
          kinds: ['content'],
          proposedFile: makeFile(),
          localFile: makeFile(),
          remoteFile: makeRemoteFile(),
          backupRef: 'bkp-1',
          backupStatus: 'saved',
        },
      ])

      await conflictResolver.record(USER, DATE, makeFile(), makeRemoteFile(), 'iPad')
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))

      unsub()
    })

    it('unsub removes listener', async () => {
      // conflictResolver is statically imported above
      const listener = vi.fn()
      const unsub = conflictResolver.subscribe(USER, listener)

      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
      unsub()
      listener.mockClear()

      await conflictResolver.record(USER, DATE, makeFile(), makeRemoteFile(), 'iPad')
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
