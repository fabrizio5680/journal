import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useEntry } from './useEntry'

import type { Entry } from '@/types'

let authCallback: ((user: { uid: string } | null) => void) | null = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: (user: { uid: string } | null) => void) => {
    authCallback = cb
    return vi.fn()
  },
}))

const { repositoryListeners, mockGetEntry, mockListMetadata, mockSaveEntry, mockSubscribe } =
  vi.hoisted(() => {
    const listeners = new Map<string, () => void>()
    return {
      repositoryListeners: listeners,
      mockGetEntry: vi.fn(),
      mockListMetadata: vi.fn(),
      mockSaveEntry: vi.fn(),
      mockSubscribe: vi.fn((uid: string, listener: () => void) => {
        listeners.set(uid, listener)
        return vi.fn()
      }),
    }
  })

vi.mock('@/lib/storage/entryRepository', () => ({
  EntryRepository: {
    getEntry: mockGetEntry,
    listMetadata: mockListMetadata,
    saveEntry: mockSaveEntry,
    subscribe: mockSubscribe,
  },
}))

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    date: '2026-04-13',
    content: { type: 'doc', content: [] },
    contentText: 'Hello',
    searchText: 'Hello',
    mood: null,
    moodLabel: null,
    tags: [],
    scriptureRefs: [],
    wordCount: 1,
    deleted: false,
    deletedAt: null,
    createdAt: '2026-04-13T00:00:00.000Z',
    updatedAt: '2026-04-13T00:00:00.000Z',
    ...overrides,
  }
}

function fireAuth(uid: string | null = 'test-uid') {
  act(() => {
    authCallback?.(uid ? { uid } : null)
  })
}

describe('useEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authCallback = null
    repositoryListeners.clear()
    mockGetEntry.mockResolvedValue(null)
    mockListMetadata.mockResolvedValue([])
    mockSaveEntry.mockResolvedValue({ entry: makeEntry({ contentText: 'saved' }), metadata: {} })
  })

  it('returns isLoading: true and entry: null before repository load finishes', () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    expect(result.current.isLoading).toBe(true)
    expect(result.current.entry).toBe(null)
  })

  it('loads entry data from the repository', async () => {
    const entry = makeEntry({ contentText: 'Loaded locally' })
    mockGetEntry.mockResolvedValue(entry)

    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.entry).toMatchObject(entry)
    })
  })

  it('returns entry: null when the repository has no entry', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.entry).toBe(null)
    })
  })

  it('isDirty becomes true after markDirty(), false after save()', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.markDirty())
    expect(result.current.isDirty).toBe(true)

    await act(async () => {
      await result.current.save({ contentText: 'hi', wordCount: 1 })
    })

    expect(result.current.isDirty).toBe(false)
  })

  it('save() writes through the repository using requested date', async () => {
    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.save({
        date: '1999-01-01',
        contentText: 'today only',
        wordCount: 2,
      })
    })

    expect(mockSaveEntry).toHaveBeenCalledWith(
      'test-uid',
      '2026-04-13',
      expect.objectContaining({ contentText: 'today only', wordCount: 2 }),
    )
    expect(mockSaveEntry.mock.calls[0][2]).not.toHaveProperty('date')
  })

  it('repository refresh is ignored while the user is typing', async () => {
    mockGetEntry.mockResolvedValueOnce(makeEntry({ contentText: 'original' }))

    const { result } = renderHook(() => useEntry('2026-04-13'))
    fireAuth()
    await waitFor(() => expect(result.current.entry?.contentText).toBe('original'))

    act(() => result.current.markDirty())
    mockGetEntry.mockResolvedValueOnce(makeEntry({ contentText: 'from repository' }))

    await act(async () => {
      await repositoryListeners.get('test-uid')?.()
    })

    expect(result.current.entry?.contentText).toBe('original')
  })
})
