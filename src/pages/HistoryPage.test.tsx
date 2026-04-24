import { render, screen, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// --- Firebase auth mock ---
let authCallback: ((user: { uid: string } | null) => void) | null = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: (user: { uid: string } | null) => void) => {
    authCallback = cb
    return vi.fn()
  },
}))

// --- Firebase firestore mock ---
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
  endOfMonth: vi.fn(),
}))

// --- useEntryDates mock (returns stable empty Set) ---
vi.mock('@/hooks/useEntryDates', () => ({
  useEntryDates: () => new Set<string>(),
}))

// firebase.ts mock is already in setup.ts

import HistoryPage from './HistoryPage'

import type { Entry } from '@/types'

function makeEntry(date: string): Entry {
  return {
    date,
    content: {},
    contentText: `Entry for ${date}`,
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 10,
    deleted: false,
    deletedAt: null,
    createdAt: {} as Entry['createdAt'],
    updatedAt: {} as Entry['updatedAt'],
  }
}

function makeSnap(docs: Entry[], fromCache: boolean) {
  return {
    forEach: (cb: (doc: { data: () => Entry }) => void) => {
      docs.forEach((entry) => cb({ data: () => entry }))
    },
    metadata: { fromCache },
  }
}

function fireAuth(uid: string | null = 'test-uid') {
  act(() => {
    authCallback?.(uid ? { uid } : null)
  })
}

function fireSnap(docs: Entry[], fromCache: boolean) {
  act(() => {
    snapshotCallback?.(makeSnap(docs, fromCache))
  })
}

function renderHistoryPage() {
  return render(
    <MemoryRouter>
      <HistoryPage />
    </MemoryRouter>,
  )
}

describe('HistoryPage — snapshot rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    authCallback = null
    mockOnSnapshot.mockImplementation(
      (_, cb: (snap: unknown) => void, _errCb?: (err: unknown) => void) => {
        snapshotCallback = cb
        return mockUnsub
      },
    )
  })

  it('shows skeleton before any snapshot fires', async () => {
    renderHistoryPage()
    fireAuth()

    // No snapshot fired yet — skeleton should be visible
    await waitFor(() => {
      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  it('shows empty state immediately when cache snapshot is empty', async () => {
    renderHistoryPage()
    fireAuth()

    // Empty cache snapshot — loading clears, empty state shows
    fireSnap([], true)

    await waitFor(() => {
      expect(screen.getByText(/No entries for this month/)).toBeInTheDocument()
    })

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBe(0)
  })

  it('shows entries when snapshot fires with data', async () => {
    renderHistoryPage()
    fireAuth()

    fireSnap([makeEntry('2026-04-10'), makeEntry('2026-04-15')], false)

    await waitFor(() => {
      expect(screen.getAllByText('Entry for 2026-04-10').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Entry for 2026-04-15').length).toBeGreaterThan(0)
    })

    expect(screen.queryByText(/No entries for this month/)).not.toBeInTheDocument()
  })

  it('shows empty state when server confirms no entries', async () => {
    renderHistoryPage()
    fireAuth()

    fireSnap([], false)

    await waitFor(() => {
      expect(screen.getByText(/No entries for this month/)).toBeInTheDocument()
    })

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBe(0)
  })

  it('includes orderBy date desc in query to match composite index', async () => {
    renderHistoryPage()
    fireAuth()

    await waitFor(() => expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc'))
  })
})
