import { render, screen, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

let authCallback: ((user: { uid: string } | null) => void) | null = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: (user: { uid: string } | null) => void) => {
    authCallback = cb
    return vi.fn()
  },
}))

vi.mock('@/hooks/useEntryDates', () => ({
  useEntryDates: () => new Set<string>(),
}))

const { mockListEntries, mockSubscribe } = vi.hoisted(() => ({
  mockListEntries: vi.fn(),
  mockSubscribe: vi.fn(() => vi.fn()),
}))

vi.mock('@/lib/storage/entryRepository', () => ({
  EntryRepository: {
    listEntries: mockListEntries,
    subscribe: mockSubscribe,
  },
}))

import HistoryPage from './HistoryPage'

import type { Entry } from '@/types'

function makeEntry(date: string): Entry {
  return {
    date,
    content: {},
    contentText: `Entry for ${date}`,
    searchText: `Entry for ${date}`,
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 10,
    deleted: false,
    deletedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  }
}

function fireAuth(uid: string | null = 'test-uid') {
  act(() => {
    authCallback?.(uid ? { uid } : null)
  })
}

function renderHistoryPage() {
  return render(
    <MemoryRouter>
      <HistoryPage />
    </MemoryRouter>,
  )
}

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authCallback = null
    mockListEntries.mockResolvedValue([])
  })

  it('shows skeleton before repository entries load', async () => {
    mockListEntries.mockImplementation(() => new Promise(() => undefined))

    renderHistoryPage()
    fireAuth()

    await waitFor(() => {
      expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    })
  })

  it('shows entries returned by the repository', async () => {
    mockListEntries.mockResolvedValue([makeEntry('2026-05-10'), makeEntry('2026-05-15')])

    renderHistoryPage()
    fireAuth()

    await waitFor(() => {
      expect(screen.getAllByText('Entry for 2026-05-10').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Entry for 2026-05-15').length).toBeGreaterThan(0)
    })

    expect(screen.queryByText(/No entries for this month/)).not.toBeInTheDocument()
  })

  it('shows empty state when repository has no entries', async () => {
    renderHistoryPage()
    fireAuth()

    await waitFor(() => {
      expect(screen.getByText(/No entries for this month/)).toBeInTheDocument()
    })
  })

  it('queries the current month range against the repository', async () => {
    renderHistoryPage()
    fireAuth()

    await waitFor(() => {
      expect(mockListEntries).toHaveBeenCalledWith('test-uid', {
        from: '2026-05-01',
        to: '2026-05-31',
      })
    })
  })
})
