import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Firebase mocks ---
let snapshotCallback: ((snap: unknown) => void) | null = null
const mockUnsub = vi.fn()
const mockCollection = vi.fn().mockReturnValue({ id: 'mock-collection' })
const mockQuery = vi.fn().mockReturnValue({ id: 'mock-query' })
const mockWhere = vi.fn().mockReturnValue({ id: 'mock-where' })
const mockOrderBy = vi.fn().mockReturnValue({ id: 'mock-orderby' })
const mockOnSnapshot = vi.fn((_, cb: (snap: unknown) => void, _errCb?: (err: unknown) => void) => {
  snapshotCallback = cb
  return mockUnsub
})

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...(args as [unknown, ...unknown[]])),
  query: (...args: unknown[]) => mockQuery(...(args as [unknown, ...unknown[]])),
  where: (...args: unknown[]) => mockWhere(...(args as [unknown, ...unknown[]])),
  orderBy: (...args: unknown[]) => mockOrderBy(...(args as [unknown, ...unknown[]])),
  onSnapshot: (ref: unknown, cb: (snap: unknown) => void, errCb?: (err: unknown) => void) =>
    mockOnSnapshot(ref, cb, errCb),
}))

// firebase.ts mock is already in setup.ts

import { useEntryDates } from './useEntryDates'

function makeDoc(id: string) {
  return { id }
}

function fireSnapshot(docs: Array<{ id: string }>, fromCache = false) {
  act(() => {
    snapshotCallback?.({
      forEach: (cb: (doc: { id: string }) => void) => docs.forEach(cb),
      metadata: { fromCache },
    })
  })
}

describe('useEntryDates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    mockOnSnapshot.mockImplementation(
      (_, cb: (snap: unknown) => void, _errCb?: (err: unknown) => void) => {
        snapshotCallback = cb
        return mockUnsub
      },
    )
  })

  it('returns empty set when no entries', async () => {
    const { result } = renderHook(() => useEntryDates('test-uid', 2026, 4))
    fireSnapshot([])

    await waitFor(() => {
      expect(result.current.size).toBe(0)
    })
  })

  it('maps Firestore snapshot docs to Set of date strings correctly', async () => {
    const { result } = renderHook(() => useEntryDates('test-uid', 2026, 4))

    fireSnapshot([makeDoc('2026-04-01'), makeDoc('2026-04-10'), makeDoc('2026-04-15')])

    await waitFor(() => {
      expect(result.current.size).toBe(3)
      expect(result.current.has('2026-04-01')).toBe(true)
      expect(result.current.has('2026-04-10')).toBe(true)
      expect(result.current.has('2026-04-15')).toBe(true)
    })
  })

  it('excludes deleted entries (filter applied via Firestore query)', () => {
    renderHook(() => useEntryDates('test-uid', 2026, 4))

    // Verify the query was called with a `deleted == false` where clause
    expect(mockWhere).toHaveBeenCalledWith('deleted', '==', false)
  })

  it('updates when new entry added to snapshot', async () => {
    const { result } = renderHook(() => useEntryDates('test-uid', 2026, 4))

    fireSnapshot([makeDoc('2026-04-01')])
    await waitFor(() => expect(result.current.size).toBe(1))

    fireSnapshot([makeDoc('2026-04-01'), makeDoc('2026-04-20')])
    await waitFor(() => {
      expect(result.current.size).toBe(2)
      expect(result.current.has('2026-04-20')).toBe(true)
    })
  })

  it('returns empty set when userId is empty string', () => {
    const { result } = renderHook(() => useEntryDates('', 2026, 4))
    expect(result.current.size).toBe(0)
    // onSnapshot should not be called when userId is empty
    expect(mockOnSnapshot).not.toHaveBeenCalled()
  })

  it('queries correct date range for a 31-day month (March)', () => {
    renderHook(() => useEntryDates('test-uid', 2026, 3))

    expect(mockWhere).toHaveBeenCalledWith('date', '>=', '2026-03-01')
    expect(mockWhere).toHaveBeenCalledWith('date', '<=', '2026-03-31')
  })

  it('queries correct date range for a 30-day month (April)', () => {
    renderHook(() => useEntryDates('test-uid', 2026, 4))

    expect(mockWhere).toHaveBeenCalledWith('date', '>=', '2026-04-01')
    expect(mockWhere).toHaveBeenCalledWith('date', '<=', '2026-04-30')
  })

  it('queries correct date range for February in a non-leap year (2026)', () => {
    renderHook(() => useEntryDates('test-uid', 2026, 2))

    expect(mockWhere).toHaveBeenCalledWith('date', '>=', '2026-02-01')
    expect(mockWhere).toHaveBeenCalledWith('date', '<=', '2026-02-28')
  })

  it('queries correct date range for February in a leap year (2028)', () => {
    renderHook(() => useEntryDates('test-uid', 2028, 2))

    expect(mockWhere).toHaveBeenCalledWith('date', '>=', '2028-02-01')
    expect(mockWhere).toHaveBeenCalledWith('date', '<=', '2028-02-29')
  })

  it('queries correct date range for December (31 days)', () => {
    renderHook(() => useEntryDates('test-uid', 2026, 12))

    expect(mockWhere).toHaveBeenCalledWith('date', '>=', '2026-12-01')
    expect(mockWhere).toHaveBeenCalledWith('date', '<=', '2026-12-31')
  })

  it('cleans up snapshot listener on unmount', () => {
    const { unmount } = renderHook(() => useEntryDates('test-uid', 2026, 4))
    unmount()
    expect(mockUnsub).toHaveBeenCalled()
  })

  it('updates dates even when empty snapshot is from cache', async () => {
    const { result } = renderHook(() => useEntryDates('test-uid', 2026, 4))

    fireSnapshot([], true) // fromCache = true, empty

    await waitFor(() => {
      expect(result.current.size).toBe(0)
    })

    // Subsequent snapshot with entries still updates correctly
    fireSnapshot([makeDoc('2026-04-10')], false)
    await waitFor(() => {
      expect(result.current.size).toBe(1)
      expect(result.current.has('2026-04-10')).toBe(true)
    })
  })

  it('includes orderBy date desc in query to match composite index', () => {
    renderHook(() => useEntryDates('test-uid', 2026, 4))
    expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
  })

  it('does update dates when from-cache snapshot has entries', async () => {
    const { result } = renderHook(() => useEntryDates('test-uid', 2026, 4))

    fireSnapshot([makeDoc('2026-04-01'), makeDoc('2026-04-15')], true) // fromCache = true, non-empty

    await waitFor(() => {
      expect(result.current.size).toBe(2)
      expect(result.current.has('2026-04-01')).toBe(true)
    })
  })
})
