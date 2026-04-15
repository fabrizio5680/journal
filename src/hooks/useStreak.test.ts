import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { format, subDays } from 'date-fns'

// --- Firebase mocks ---
let snapshotCallback: ((snap: unknown) => void) | null = null
const mockUnsub = vi.fn()
const mockCollection = vi.fn().mockReturnValue({ id: 'mock-collection' })
const mockQuery = vi.fn().mockReturnValue({ id: 'mock-query' })
const mockWhere = vi.fn().mockReturnValue({ id: 'mock-where' })
const mockOrderBy = vi.fn().mockReturnValue({ id: 'mock-order' })
const mockLimit = vi.fn().mockReturnValue({ id: 'mock-limit' })
const mockOnSnapshot = vi.fn((_, cb: (snap: unknown) => void) => {
  snapshotCallback = cb
  return mockUnsub
})

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}))

let authCallback: ((user: { uid: string } | null) => void) | null = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: (user: { uid: string } | null) => void) => {
    authCallback = cb
    return vi.fn()
  },
}))

import { useStreak } from './useStreak'

const FAKE_NOW = new Date('2026-04-15T12:00:00Z')
const TODAY = '2026-04-15'

function fireAuth(uid: string | null = 'test-uid') {
  act(() => {
    authCallback?.(uid ? { uid } : null)
  })
}

function fireSnapshot(dates: string[]) {
  act(() => {
    snapshotCallback?.({
      docs: dates.map((id) => ({ id })),
    })
  })
}

describe('useStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FAKE_NOW)
    vi.clearAllMocks()
    snapshotCallback = null
    authCallback = null
    mockOnSnapshot.mockImplementation((_, cb: (snap: unknown) => void) => {
      snapshotCallback = cb
      return mockUnsub
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns { current: 0, longest: 0 } when no entries', async () => {
    const { result } = renderHook(() => useStreak())
    fireAuth()
    fireSnapshot([])

    await waitFor(() => {
      expect(result.current).toEqual({ current: 0, longest: 0 })
    })
  })

  it('consecutive dates from today return correct current streak', async () => {
    const { result } = renderHook(() => useStreak())
    fireAuth()

    const dates = [
      TODAY,
      format(subDays(FAKE_NOW, 1), 'yyyy-MM-dd'),
      format(subDays(FAKE_NOW, 2), 'yyyy-MM-dd'),
    ]
    fireSnapshot(dates)

    await waitFor(() => {
      expect(result.current.current).toBe(3)
    })
  })

  it('streak broken by a missing day resets current to days since last gap', async () => {
    const { result } = renderHook(() => useStreak())
    fireAuth()

    // Today is present, yesterday is missing, two days ago is present
    const dates = [
      TODAY,
      format(subDays(FAKE_NOW, 2), 'yyyy-MM-dd'),
      format(subDays(FAKE_NOW, 3), 'yyyy-MM-dd'),
    ]
    fireSnapshot(dates)

    await waitFor(() => {
      expect(result.current.current).toBe(1) // only today
    })
  })

  it('longest streak tracks the maximum consecutive run across all entries', async () => {
    const { result } = renderHook(() => useStreak())
    fireAuth()

    // 5-day run starting 20 days ago
    const longRun = Array.from({ length: 5 }, (_, i) =>
      format(subDays(FAKE_NOW, 20 + i), 'yyyy-MM-dd'),
    )
    // 2-day run now (today + yesterday)
    const recentRun = [TODAY, format(subDays(FAKE_NOW, 1), 'yyyy-MM-dd')]

    fireSnapshot([...recentRun, ...longRun])

    await waitFor(() => {
      expect(result.current.longest).toBe(5)
      expect(result.current.current).toBe(2)
    })
  })

  it('entries from the future do not extend the current streak', async () => {
    const { result } = renderHook(() => useStreak())
    fireAuth()

    const tomorrow = format(subDays(FAKE_NOW, -1), 'yyyy-MM-dd')
    // Future entry plus today — current streak should still anchor at today
    fireSnapshot([tomorrow, TODAY])

    await waitFor(() => {
      // current: starts at today (in set), yesterday not in set → current = 1
      expect(result.current.current).toBe(1)
    })
  })
})
