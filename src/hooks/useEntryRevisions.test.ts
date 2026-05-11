import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Firebase mocks ---
let snapshotCallback: ((snap: unknown) => void) | null = null
const mockUnsub = vi.fn()
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-rev-id' })
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockCollection = vi.fn().mockReturnValue({ id: 'mock-collection-ref' })
const mockDoc = vi.fn().mockReturnValue({ id: 'mock-doc-ref' })
const mockQuery = vi.fn().mockReturnValue({ id: 'mock-query' })
const mockOrderBy = vi.fn().mockReturnValue({ id: 'mock-orderby' })

// getDocs returns a snapshot with the docs we control per-test
let getDocsResult: Array<{ id: string; data: () => Record<string, unknown> }> = []
const mockGetDocs = vi.fn().mockImplementation(() =>
  Promise.resolve({
    docs: getDocsResult,
  }),
)

const mockOnSnapshot = vi.fn((_, cb: (snap: unknown) => void, _errCb?: (err: unknown) => void) => {
  snapshotCallback = cb
  return mockUnsub
})

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...(args as [unknown, ...unknown[]])),
  doc: (...args: unknown[]) => mockDoc(...(args as [unknown, ...unknown[]])),
  query: (...args: unknown[]) => mockQuery(...(args as [unknown, ...unknown[]])),
  orderBy: (...args: unknown[]) => mockOrderBy(...(args as [unknown, ...unknown[]])),
  onSnapshot: (ref: unknown, cb: (snap: unknown) => void, errCb?: (err: unknown) => void) =>
    mockOnSnapshot(ref, cb, errCb),
  addDoc: (...args: unknown[]) => mockAddDoc(...(args as [unknown, ...unknown[]])),
  getDocs: (...args: unknown[]) => mockGetDocs(...(args as [unknown, ...unknown[]])),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...(args as [unknown, ...unknown[]])),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}))

let authCallback: ((user: { uid: string } | null) => void) | null = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: (user: { uid: string } | null) => void) => {
    authCallback = cb
    return vi.fn()
  },
}))

// firebase.ts mock is already in setup.ts

vi.mock('@/context/EncryptionContext', () => ({
  useEncryption: () => ({
    isEnabled: false,
    isUnlocked: false,
    isLoading: false,
    encryptFields: (content: object, contentText: string) =>
      Promise.resolve({ content, contentText, contentEncrypted: false }),
    decryptFields: (doc: { content: object; contentText: string }) =>
      Promise.resolve({ content: doc.content, contentText: doc.contentText }),
    unlock: () => Promise.resolve(false),
    unlockWithRecovery: () => Promise.resolve(false),
    lock: () => undefined,
    enable: () => Promise.resolve({ recoveryCode: '' }),
    disable: () => Promise.resolve(),
  }),
  EncryptionLockedError: class EncryptionLockedError extends Error {
    constructor() {
      super('locked')
      this.name = 'EncryptionLockedError'
    }
  },
}))

import { useEntryRevisions } from './useEntryRevisions'

import type { Entry } from '@/types'

function fireAuth(uid: string | null = 'test-uid') {
  act(() => {
    authCallback?.(uid ? { uid } : null)
  })
}

function makeRevisionDoc(id: string, savedAtMs: number) {
  return {
    id,
    data: () => ({
      savedAt: { toDate: () => new Date(savedAtMs) },
      content: { type: 'doc', content: [] },
      contentText: `Content of ${id}`,
      mood: null,
      moodLabel: null,
      tags: [],
      scriptureRefs: [],
      wordCount: 3,
    }),
  }
}

function fireSnapshot(docs: Array<ReturnType<typeof makeRevisionDoc>>) {
  act(() => {
    snapshotCallback?.({
      docs: docs.map((d) => ({
        id: d.id,
        data: d.data,
      })),
    })
  })
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    date: '2026-05-07',
    content: { type: 'doc', content: [] },
    contentText: 'Hello world',
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: 2,
    deleted: false,
    deletedAt: null,
    createdAt: 'SERVER_TIMESTAMP' as unknown as import('firebase/firestore').Timestamp,
    updatedAt: 'SERVER_TIMESTAMP' as unknown as import('firebase/firestore').Timestamp,
    ...overrides,
  }
}

describe('useEntryRevisions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    authCallback = null
    getDocsResult = []
    mockAddDoc.mockResolvedValue({ id: 'new-rev-id' })
    mockDeleteDoc.mockResolvedValue(undefined)
    mockGetDocs.mockImplementation(() => Promise.resolve({ docs: getDocsResult }))
  })

  // ── Test 1: saveRevision writes correct fields ────────────────────────────
  it('saveRevision writes a doc to the revisions subcollection with correct fields', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()
    fireSnapshot([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const entry = makeEntry({
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      contentText: 'My journal entry',
      mood: 3,
      moodLabel: 'Calm',
      tags: ['faith'],
      wordCount: 3,
    })

    await act(async () => {
      await result.current.saveRevision(entry)
    })

    expect(mockAddDoc).toHaveBeenCalledOnce()
    const [, payload] = mockAddDoc.mock.calls[0]
    expect(payload).toMatchObject({
      savedAt: 'SERVER_TIMESTAMP',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      contentText: 'My journal entry',
      mood: 3,
      moodLabel: 'Calm',
      tags: ['faith'],
      scriptureRefs: [],
      wordCount: 3,
    })
  })

  // ── Test 2: saveRevision prunes to 10 when 10 already exist ──────────────
  it('saveRevision prunes oldest revision when 10 revisions already exist', async () => {
    // Set up getDocs to return 11 docs after the new write (10 + 1 new = 11, so excess = 1)
    const existingDocs = Array.from({ length: 11 }, (_, i) =>
      makeRevisionDoc(`rev-${i}`, Date.now() + i * 1000),
    )
    getDocsResult = existingDocs

    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()
    fireSnapshot([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.saveRevision(makeEntry())
    })

    // getDocs should have been called to check for excess revisions
    expect(mockGetDocs).toHaveBeenCalledOnce()

    // excess = 11 - 10 = 1, so oldest doc (rev-0) should be deleted
    expect(mockDeleteDoc).toHaveBeenCalledOnce()
    // doc() was called with the collection ref and the oldest doc id
    expect(mockDoc).toHaveBeenCalledWith({ id: 'mock-collection-ref' }, 'rev-0')
  })

  // ── Test 3: saveRevision does NOT prune when <10 revisions ───────────────
  it('saveRevision does NOT prune when fewer than 10 revisions exist', async () => {
    // 9 docs after the write (9 < 10 — no excess)
    getDocsResult = Array.from({ length: 9 }, (_, i) =>
      makeRevisionDoc(`rev-${i}`, Date.now() + i * 1000),
    )

    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()
    fireSnapshot([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.saveRevision(makeEntry())
    })

    expect(mockGetDocs).toHaveBeenCalledOnce()
    expect(mockDeleteDoc).not.toHaveBeenCalled()
  })

  // ── Test 4: revisions returned ordered by savedAt desc ───────────────────
  it('returns revisions ordered by savedAt desc as provided by the snapshot', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()

    // Firestore query uses orderBy('savedAt', 'desc'), so we simulate docs
    // arriving newest-first, which is the Firestore ordering.
    const docs = [
      makeRevisionDoc('rev-newest', 3000),
      makeRevisionDoc('rev-middle', 2000),
      makeRevisionDoc('rev-oldest', 1000),
    ]
    fireSnapshot(docs)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.revisions).toHaveLength(3)
    })

    // The hook preserves the ordering the snapshot delivers
    expect(result.current.revisions[0].id).toBe('rev-newest')
    expect(result.current.revisions[1].id).toBe('rev-middle')
    expect(result.current.revisions[2].id).toBe('rev-oldest')
  })

  // ── Additional: isLoading transitions ────────────────────────────────────
  it('returns isLoading: true before snapshot fires, false after', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()

    expect(result.current.isLoading).toBe(true)

    fireSnapshot([])

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('saveRevision is a no-op when user is not authenticated', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth(null) // sign out

    await act(async () => {
      await result.current.saveRevision(makeEntry())
    })

    expect(mockAddDoc).not.toHaveBeenCalled()
  })

  it('uses correct Firestore path: users/{uid}/entries/{date}/revisions', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth('my-uid')
    fireSnapshot([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.saveRevision(makeEntry())
    })

    // collection() is called by revisionsCollection() with (db, 'users', uid, 'entries', date, 'revisions')
    expect(mockCollection).toHaveBeenCalledWith(
      {},
      'users',
      'my-uid',
      'entries',
      '2026-05-07',
      'revisions',
    )
  })

  it('maps snapshot docs to EntryRevision objects with id from doc.id', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()

    fireSnapshot([makeRevisionDoc('abc-123', Date.now())])

    await waitFor(() => {
      expect(result.current.revisions).toHaveLength(1)
      expect(result.current.revisions[0].id).toBe('abc-123')
      expect(result.current.revisions[0].contentText).toBe('Content of abc-123')
    })
  })
})

// ── scheduleRevision / cancelRevision tests (fake timers) ────────────────────
// Strategy: set up hook state with real timers first (fireAuth, fireSnapshot,
// waitFor), then switch to fake timers only for the part that tests setTimeout.

describe('useEntryRevisions — scheduleRevision / cancelRevision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    authCallback = null
    getDocsResult = []
    mockAddDoc.mockResolvedValue({ id: 'new-rev-id' })
    mockDeleteDoc.mockResolvedValue(undefined)
    mockGetDocs.mockImplementation(() => Promise.resolve({ docs: getDocsResult }))
    // Start with real timers — switch to fake per test after state is set up
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── scheduleRevision skips when isLoading is true ─────────────────────────
  it('scheduleRevision skips when isLoading is true', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    // Fire auth but NOT the snapshot — keeps isLoading true
    fireAuth()

    // isLoading should still be true (snapshot hasn't fired)
    expect(result.current.isLoading).toBe(true)

    // Now switch to fake timers for the setTimeout portion
    vi.useFakeTimers()

    const entry = makeEntry({ contentText: 'Some text' })

    act(() => {
      result.current.scheduleRevision('Some text', entry)
    })

    // Advance past the 30s debounce
    await act(async () => {
      vi.advanceTimersByTime(31_000)
    })

    // No revision should have been saved because isLoading was true
    expect(mockAddDoc).not.toHaveBeenCalled()
  })

  // ── scheduleRevision saves when revisions is empty ────────────────────────
  it('scheduleRevision saves when revisions is empty (first ever revision)', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()
    // Fire snapshot with empty revisions list → isLoading becomes false
    fireSnapshot([])

    // Use real timers for waitFor
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Switch to fake timers now that state is stable
    vi.useFakeTimers()

    const entry = makeEntry({ contentText: 'New entry text' })

    act(() => {
      result.current.scheduleRevision('New entry text', entry)
    })

    // Advance past the 30s debounce
    await act(async () => {
      vi.advanceTimersByTime(31_000)
      // Flush resulting microtasks (Promise chains from saveRevision)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockAddDoc).toHaveBeenCalledOnce()
  })

  // ── scheduleRevision saves when contentText differs from revisions[0] ──────
  it('scheduleRevision saves when contentText differs from latest revision', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()
    // Seed one existing revision with known contentText
    fireSnapshot([makeRevisionDoc('rev-old', Date.now())])

    await waitFor(() => expect(result.current.revisions).toHaveLength(1))

    vi.useFakeTimers()

    // The existing revision has contentText "Content of rev-old" (from makeRevisionDoc)
    const differentText = 'Something completely different'
    const entry = makeEntry({ contentText: differentText })

    act(() => {
      result.current.scheduleRevision(differentText, entry)
    })

    await act(async () => {
      vi.advanceTimersByTime(31_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockAddDoc).toHaveBeenCalledOnce()
  })

  // ── scheduleRevision skips when contentText matches revisions[0] ──────────
  it('scheduleRevision skips when contentText matches latest revision', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()
    // makeRevisionDoc sets contentText to "Content of rev-abc"
    fireSnapshot([makeRevisionDoc('rev-abc', Date.now())])

    await waitFor(() => expect(result.current.revisions).toHaveLength(1))

    vi.useFakeTimers()

    // Use the exact same text that makeRevisionDoc puts in contentText
    const sameText = 'Content of rev-abc'
    const entry = makeEntry({ contentText: sameText })

    act(() => {
      result.current.scheduleRevision(sameText, entry)
    })

    await act(async () => {
      vi.advanceTimersByTime(31_000)
      await Promise.resolve()
    })

    // No save — content is unchanged
    expect(mockAddDoc).not.toHaveBeenCalled()
  })

  // ── cancelRevision clears pending timer ───────────────────────────────────
  it('cancelRevision prevents saveRevision from being called after cancel', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()
    fireSnapshot([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.useFakeTimers()

    const entry = makeEntry({ contentText: 'Will be cancelled' })

    act(() => {
      result.current.scheduleRevision('Will be cancelled', entry)
    })

    // Cancel before the 30s debounce fires
    act(() => {
      result.current.cancelRevision()
    })

    // Advance past the debounce — timer was cleared, so no save
    await act(async () => {
      vi.advanceTimersByTime(31_000)
      await Promise.resolve()
    })

    expect(mockAddDoc).not.toHaveBeenCalled()
  })

  // ── Debounce: rapid calls result in only one save (last call wins) ─────────
  it('rapid scheduleRevision calls result in only one save (last call wins)', async () => {
    const { result } = renderHook(() => useEntryRevisions('2026-05-07'))
    fireAuth()
    fireSnapshot([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.useFakeTimers()

    const entry1 = makeEntry({ contentText: 'Call 1' })
    const entry2 = makeEntry({ contentText: 'Call 2' })
    const entry3 = makeEntry({ contentText: 'Call 3' })

    act(() => {
      result.current.scheduleRevision('Call 1', entry1)
    })

    // 5s later — still within the 30s window
    act(() => {
      vi.advanceTimersByTime(5_000)
      result.current.scheduleRevision('Call 2', entry2)
    })

    // 5s later — still within the 30s window
    act(() => {
      vi.advanceTimersByTime(5_000)
      result.current.scheduleRevision('Call 3', entry3)
    })

    // Advance past the 30s debounce from the LAST call
    await act(async () => {
      vi.advanceTimersByTime(31_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    // Only one addDoc call for the final entry
    expect(mockAddDoc).toHaveBeenCalledOnce()
    const [, payload] = mockAddDoc.mock.calls[0]
    expect(payload.contentText).toBe('Call 3')
  })
})
