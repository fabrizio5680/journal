import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { useInsights } from './useInsights'

type EntryData = {
  date: string
  mood?: 1 | 2 | 3 | 4 | 5 | null
  moodLabel?: string | null
  tags?: string[]
  wordCount?: number
}

function metadata(entry: EntryData) {
  return {
    date: entry.date,
    mood: entry.mood ?? null,
    moodLabel: entry.moodLabel ?? null,
    tags: entry.tags ?? [],
    wordCount: entry.wordCount ?? 0,
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

describe('useInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authCallback = null
    mockListMetadata.mockResolvedValue([])
  })

  it('moodByDate excludes entries with mood === null', async () => {
    mockListMetadata.mockResolvedValue([
      metadata({ date: '2026-04-10', mood: 3, wordCount: 10 }),
      metadata({ date: '2026-04-11', mood: null, wordCount: 5 }),
      metadata({ date: '2026-04-12', mood: 5, wordCount: 20 }),
    ])

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      expect(result.current.moodByDate).toHaveLength(2)
      expect(result.current.moodByDate.map((m) => m.date)).toEqual(['2026-04-10', '2026-04-12'])
    })
  })

  it('moodByDate is ordered by date ASC for chart display', async () => {
    mockListMetadata.mockResolvedValue([
      metadata({ date: '2026-04-15', mood: 4 }),
      metadata({ date: '2026-04-13', mood: 2 }),
      metadata({ date: '2026-04-14', mood: 3 }),
    ])

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      expect(result.current.moodByDate.map((m) => m.date)).toEqual([
        '2026-04-13',
        '2026-04-14',
        '2026-04-15',
      ])
    })
  })

  it('topTags returns top 10 by count, sorted DESC', async () => {
    mockListMetadata.mockResolvedValue([
      metadata({ date: '2026-04-01', tags: ['prayer', 'gratitude', 'faith'] }),
      metadata({ date: '2026-04-02', tags: ['prayer', 'gratitude', 'hope'] }),
      metadata({ date: '2026-04-03', tags: ['prayer', 'joy'] }),
      metadata({ date: '2026-04-04', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }),
    ])

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      expect(result.current.topTags.length).toBeLessThanOrEqual(10)
      expect(result.current.topTags[0]).toEqual({ tag: 'prayer', count: 3 })
      expect(result.current.topTags[1]).toEqual({ tag: 'gratitude', count: 2 })
    })
  })

  it('tags with equal count are ordered alphabetically', async () => {
    mockListMetadata.mockResolvedValue([
      metadata({ date: '2026-04-01', tags: ['zebra', 'apple', 'mango'] }),
      metadata({ date: '2026-04-02', tags: ['zebra', 'apple', 'mango'] }),
    ])

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      expect(result.current.topTags.map((tag) => tag.tag)).toEqual(['apple', 'mango', 'zebra'])
    })
  })

  it('totalEntries and totalWords are summed correctly', async () => {
    mockListMetadata.mockResolvedValue([
      metadata({ date: '2026-04-01', wordCount: 100 }),
      metadata({ date: '2026-04-02', wordCount: 250 }),
      metadata({ date: '2026-04-03', wordCount: 75 }),
    ])

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      expect(result.current.totalEntries).toBe(3)
      expect(result.current.totalWords).toBe(425)
    })
  })

  it('totalEntries and totalWords reflect all entries', async () => {
    mockListMetadata.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) =>
        metadata({
          date: `2025-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
          mood: 3,
          wordCount: 50,
        }),
      ),
    )

    const { result } = renderHook(() => useInsights())
    fireAuth()

    await waitFor(() => {
      expect(result.current.totalEntries).toBe(100)
      expect(result.current.totalWords).toBe(5000)
    })
  })
})
