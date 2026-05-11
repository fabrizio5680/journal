import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { format, subDays } from 'date-fns'

const { mockListMetadata, mockSubscribe } = vi.hoisted(() => ({
  mockListMetadata: vi.fn(),
  mockSubscribe: vi.fn(() => vi.fn()),
}))

vi.mock('@/lib/storage/entryRepository', () => ({
  EntryRepository: {
    listMetadata: mockListMetadata,
    subscribe: mockSubscribe,
  },
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

function metadata(date: string) {
  return {
    date,
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 0,
    hasContent: true,
    updatedAt: '2026-04-01T00:00:00.000Z',
    lastSeenRevisionId: null,
    syncStatus: 'saved-local',
    deletedAt: null,
  }
}

function fireAuth(uid: string | null = 'test-uid') {
  act(() => {
    authCallback?.(uid ? { uid } : null)
  })
}

describe('useStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FAKE_NOW)
    vi.clearAllMocks()
    authCallback = null
    mockListMetadata.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns { current: 0, longest: 0 } when no entries', async () => {
    const { result } = renderHook(() => useStreak())
    fireAuth()

    await waitFor(() => {
      expect(result.current).toEqual({ current: 0, longest: 0 })
    })
  })

  it('consecutive dates from today return correct current streak', async () => {
    mockListMetadata.mockResolvedValue([
      metadata(TODAY),
      metadata(format(subDays(FAKE_NOW, 1), 'yyyy-MM-dd')),
      metadata(format(subDays(FAKE_NOW, 2), 'yyyy-MM-dd')),
    ])

    const { result } = renderHook(() => useStreak())
    fireAuth()

    await waitFor(() => {
      expect(result.current.current).toBe(3)
    })
  })

  it('streak broken by a missing day resets current to days since last gap', async () => {
    mockListMetadata.mockResolvedValue([
      metadata(TODAY),
      metadata(format(subDays(FAKE_NOW, 2), 'yyyy-MM-dd')),
      metadata(format(subDays(FAKE_NOW, 3), 'yyyy-MM-dd')),
    ])

    const { result } = renderHook(() => useStreak())
    fireAuth()

    await waitFor(() => {
      expect(result.current.current).toBe(1)
    })
  })

  it('longest streak tracks the maximum consecutive run across all entries', async () => {
    const longRun = Array.from({ length: 5 }, (_, i) =>
      metadata(format(subDays(FAKE_NOW, 20 + i), 'yyyy-MM-dd')),
    )
    const recentRun = [metadata(TODAY), metadata(format(subDays(FAKE_NOW, 1), 'yyyy-MM-dd'))]
    mockListMetadata.mockResolvedValue([...recentRun, ...longRun])

    const { result } = renderHook(() => useStreak())
    fireAuth()

    await waitFor(() => {
      expect(result.current.longest).toBe(5)
      expect(result.current.current).toBe(2)
    })
  })

  it('entries from the future do not extend the current streak', async () => {
    const tomorrow = format(subDays(FAKE_NOW, -1), 'yyyy-MM-dd')
    mockListMetadata.mockResolvedValue([metadata(tomorrow), metadata(TODAY)])

    const { result } = renderHook(() => useStreak())
    fireAuth()

    await waitFor(() => {
      expect(result.current.current).toBe(1)
    })
  })
})
