import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Firebase mocks ---
let snapshotCallback: ((snap: unknown) => void) | null = null
const mockUnsub = vi.fn()
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn().mockReturnValue({ id: 'mock-ref' })
const mockOnSnapshot = vi.fn((_, cb: (snap: unknown) => void) => {
  snapshotCallback = cb
  return mockUnsub
})

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...(args as [unknown, ...unknown[]])),
  onSnapshot: (ref: unknown, cb: (snap: unknown) => void) => mockOnSnapshot(ref, cb),
  setDoc: (...args: unknown[]) => mockSetDoc(...(args as [unknown, ...unknown[]])),
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

import { useEntry } from './useEntry'

function fireAuth(uid: string | null = 'test-uid') {
  act(() => {
    authCallback?.(uid ? { uid } : null)
  })
}

function fireSnapshot(data: Record<string, unknown> | null) {
  act(() => {
    snapshotCallback?.({
      exists: () => data !== null,
      data: () => data,
    })
  })
}

describe('useEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    authCallback = null
    mockSetDoc.mockResolvedValue(undefined)
  })

  it('returns isLoading: true and entry: null before snapshot fires', () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    expect(result.current.isLoading).toBe(true)
    expect(result.current.entry).toBe(null)
  })

  it('returns entry data after snapshot fires', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()

    const entryData = {
      date: '2026-04-13',
      contentText: 'Hello',
      wordCount: 1,
      mood: null,
      tags: [],
    }
    fireSnapshot(entryData)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.entry).toMatchObject(entryData)
    })
  })

  it('returns entry: null when snapshot doc does not exist', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    fireSnapshot(null)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.entry).toBe(null)
    })
  })

  it('isDirty becomes true after markDirty(), false after save()', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    fireSnapshot(null)

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDirty).toBe(false)

    act(() => result.current.markDirty())
    expect(result.current.isDirty).toBe(true)

    await act(async () => {
      await result.current.save({ contentText: 'hi', wordCount: 1 })
    })
    expect(result.current.isDirty).toBe(false)
  })

  it('save() calls setDoc with correct fields', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    fireSnapshot(null)

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save({
        contentText: 'Hello world',
        wordCount: 2,
        content: { type: 'doc' },
      })
    })

    expect(mockSetDoc).toHaveBeenCalledOnce()
    const [, payload, options] = mockSetDoc.mock.calls[0]
    expect(payload).toMatchObject({
      date: '2026-04-13',
      contentText: 'Hello world',
      wordCount: 2,
      updatedAt: 'SERVER_TIMESTAMP',
      createdAt: 'SERVER_TIMESTAMP', // new doc
    })
    expect(options).toEqual({ merge: true })
  })

  it('remote snapshot is ignored when isDirty is true', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()

    // Load initial entry
    fireSnapshot({ date: '2026-04-13', contentText: 'original', wordCount: 5 })
    await waitFor(() => expect(result.current.entry?.contentText).toBe('original'))

    // Mark dirty (user is typing)
    act(() => result.current.markDirty())

    // Remote snapshot arrives with different data
    fireSnapshot({ date: '2026-04-13', contentText: 'from server', wordCount: 10 })

    // Entry should NOT be updated
    expect(result.current.entry?.contentText).toBe('original')
  })

  it('save() uses merge: true so existing fields are preserved', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()

    // Simulate existing entry
    fireSnapshot({ date: '2026-04-13', contentText: 'existing', wordCount: 1, mood: 3 })
    await waitFor(() => expect(result.current.entry).not.toBeNull())

    await act(async () => {
      await result.current.save({ contentText: 'updated', wordCount: 1 })
    })

    const [, , options] = mockSetDoc.mock.calls[0]
    expect(options).toEqual({ merge: true })
    // createdAt should NOT be in payload (doc already exists)
    const [, payload] = mockSetDoc.mock.calls[0]
    expect(payload).not.toHaveProperty('createdAt')
  })

  it('deleteEntry() calls setDoc with deleted: true and deletedAt: serverTimestamp()', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    fireSnapshot({ date: '2026-04-13', contentText: 'hello', wordCount: 1, deleted: false })
    await waitFor(() => expect(result.current.entry).not.toBeNull())

    await act(async () => {
      await result.current.deleteEntry()
    })

    expect(mockSetDoc).toHaveBeenCalledOnce()
    const [, payload, options] = mockSetDoc.mock.calls[0]
    expect(payload).toEqual({ deleted: true, deletedAt: 'SERVER_TIMESTAMP' })
    expect(options).toEqual({ merge: true })
  })

  it('restoreEntry() calls setDoc with deleted: false and deletedAt: null', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    fireSnapshot(null)
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.restoreEntry()
    })

    expect(mockSetDoc).toHaveBeenCalledOnce()
    const [, payload, options] = mockSetDoc.mock.calls[0]
    expect(payload).toEqual({ deleted: false, deletedAt: null })
    expect(options).toEqual({ merge: true })
  })

  it('entry is null when snapshot has deleted: true', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    fireSnapshot({ date: '2026-04-13', contentText: 'deleted entry', wordCount: 1, deleted: true })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.entry).toBe(null)
  })

  it('entry is null when snapshot date does not match requested date', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    fireSnapshot({ date: '2026-04-12', contentText: 'wrong day', wordCount: 2, deleted: false })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.entry).toBe(null)
  })

  it('save() ignores caller-provided date and writes requested date', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    fireSnapshot(null)

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save({
        date: '1999-01-01',
        contentText: 'today only',
        wordCount: 2,
      })
    })

    const [, payload] = mockSetDoc.mock.calls[0]
    expect(payload).toMatchObject({
      date: '2026-04-13',
      contentText: 'today only',
      wordCount: 2,
    })
  })
})
