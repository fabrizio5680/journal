import { renderHook, waitFor } from '@testing-library/react'
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

import { useEntryDates } from './useEntryDates'

function metadata(date: string) {
  return {
    date,
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 0,
    hasContent: false,
    updatedAt: '2026-04-01T00:00:00.000Z',
    lastSeenRevisionId: null,
    syncStatus: 'saved-local',
    deletedAt: null,
  }
}

describe('useEntryDates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListMetadata.mockResolvedValue([])
  })

  it('returns empty set when no user id', () => {
    const { result } = renderHook(() => useEntryDates('', 2026, 4))
    expect(result.current.size).toBe(0)
    expect(mockListMetadata).not.toHaveBeenCalled()
  })

  it('maps repository metadata to Set of date strings', async () => {
    mockListMetadata.mockResolvedValue([
      metadata('2026-04-01'),
      metadata('2026-04-10'),
      metadata('2026-04-30'),
    ])

    const { result } = renderHook(() => useEntryDates('test-uid', 2026, 4))

    await waitFor(() => {
      expect(result.current.size).toBe(3)
      expect(result.current.has('2026-04-10')).toBe(true)
    })
  })

  it('queries correct date range for a 30-day month', async () => {
    renderHook(() => useEntryDates('test-uid', 2026, 4))

    await waitFor(() => {
      expect(mockListMetadata).toHaveBeenCalledWith('test-uid', {
        from: '2026-04-01',
        to: '2026-04-30',
      })
    })
  })

  it('queries correct date range for February in a leap year', async () => {
    renderHook(() => useEntryDates('test-uid', 2028, 2))

    await waitFor(() => {
      expect(mockListMetadata).toHaveBeenCalledWith('test-uid', {
        from: '2028-02-01',
        to: '2028-02-29',
      })
    })
  })

  it('subscribes to repository updates and cleans up', () => {
    const unsubscribe = vi.fn()
    mockSubscribe.mockReturnValue(unsubscribe)

    const { unmount } = renderHook(() => useEntryDates('test-uid', 2026, 4))

    expect(mockSubscribe).toHaveBeenCalledWith('test-uid', expect.any(Function))
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
