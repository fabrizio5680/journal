import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Firebase mocks ---
const mockGetDocs = vi.fn()
const mockCollection = vi.fn().mockReturnValue({ id: 'mock-collection' })
const mockQuery = vi.fn().mockReturnValue({ id: 'mock-query' })
const mockWhere = vi.fn().mockReturnValue({ id: 'mock-where' })
const mockOrderBy = vi.fn().mockReturnValue({ id: 'mock-order' })
const mockLimit = vi.fn().mockReturnValue({ id: 'mock-limit' })

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}))

let authCallback: ((user: { uid: string } | null) => void) | null = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: (user: { uid: string } | null) => void) => {
    authCallback = cb
    return vi.fn()
  },
}))

import { useInsights } from './useInsights'

type EntryData = {
  date: string
  mood?: number | null
  tags?: string[]
  wordCount?: number
}

function makeSnapshot(entries: EntryData[]) {
  return {
    docs: entries.map((data) => ({ data: () => data })),
  }
}

function fireAuth(uid: string | null = 'test-uid') {
  act(() => {
    authCallback?.(uid ? { uid } : null)
  })
}

describe('useInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authCallback = null
  })

  it('moodByDate excludes entries with mood === null', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnapshot([
        { date: '2026-04-10', mood: 3, tags: [], wordCount: 10 },
        { date: '2026-04-11', mood: null, tags: [], wordCount: 5 },
        { date: '2026-04-12', mood: 5, tags: [], wordCount: 20 },
      ]),
    )

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      expect(result.current.moodByDate).toHaveLength(2)
      expect(result.current.moodByDate.map((m) => m.date)).toEqual(['2026-04-10', '2026-04-12'])
    })
  })

  it('moodByDate is ordered by date ASC for chart display', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnapshot([
        { date: '2026-04-15', mood: 4, tags: [], wordCount: 10 },
        { date: '2026-04-13', mood: 2, tags: [], wordCount: 8 },
        { date: '2026-04-14', mood: 3, tags: [], wordCount: 6 },
      ]),
    )

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      const dates = result.current.moodByDate.map((m) => m.date)
      expect(dates).toEqual(['2026-04-13', '2026-04-14', '2026-04-15'])
    })
  })

  it('topTags returns top 10 by count, sorted DESC', async () => {
    const entries: EntryData[] = [
      { date: '2026-04-01', mood: 3, tags: ['prayer', 'gratitude', 'faith'], wordCount: 10 },
      { date: '2026-04-02', mood: 4, tags: ['prayer', 'gratitude', 'hope'], wordCount: 20 },
      { date: '2026-04-03', mood: 5, tags: ['prayer', 'joy'], wordCount: 15 },
      // Add 8 more unique tags to ensure we cap at 10
      { date: '2026-04-04', mood: 3, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], wordCount: 5 },
    ]

    mockGetDocs.mockResolvedValue(makeSnapshot(entries))

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      expect(result.current.topTags.length).toBeLessThanOrEqual(10)
      // prayer should be first (3 occurrences)
      expect(result.current.topTags[0]).toEqual({ tag: 'prayer', count: 3 })
      // gratitude second (2 occurrences)
      expect(result.current.topTags[1]).toEqual({ tag: 'gratitude', count: 2 })
    })
  })

  it('tags with equal count are ordered alphabetically', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnapshot([
        { date: '2026-04-01', mood: 3, tags: ['zebra', 'apple', 'mango'], wordCount: 10 },
        { date: '2026-04-02', mood: 4, tags: ['zebra', 'apple', 'mango'], wordCount: 10 },
      ]),
    )

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      const tags = result.current.topTags.map((t) => t.tag)
      // All have count 2 — should be alphabetical
      expect(tags).toEqual(['apple', 'mango', 'zebra'])
    })
  })

  it('totalEntries and totalWords are summed correctly', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnapshot([
        { date: '2026-04-01', mood: 3, tags: [], wordCount: 100 },
        { date: '2026-04-02', mood: null, tags: [], wordCount: 250 },
        { date: '2026-04-03', mood: 5, tags: [], wordCount: 75 },
      ]),
    )

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      expect(result.current.totalEntries).toBe(3)
      expect(result.current.totalWords).toBe(425)
    })
  })
})
