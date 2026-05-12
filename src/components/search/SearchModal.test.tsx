import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import SearchModal from './SearchModal'

// ── Mock firebase auth ──────────────────────────────────────────────────────
let authCallback: ((user: { uid: string } | null) => void) | null = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: (user: { uid: string } | null) => void) => {
    authCallback = cb
    return vi.fn()
  },
}))

vi.mock('@/lib/firebase', () => ({
  auth: {},
}))

// ── Mock EntryRepository ────────────────────────────────────────────────────
const { mockListMetadata, mockSearchEntries, mockSubscribe } = vi.hoisted(() => ({
  mockListMetadata: vi.fn().mockResolvedValue([]),
  mockSearchEntries: vi.fn().mockResolvedValue([]),
  mockSubscribe: vi.fn(() => vi.fn()),
}))

vi.mock('@/lib/storage/entryRepository', () => ({
  EntryRepository: {
    listMetadata: (...args: unknown[]) => mockListMetadata(...args),
    searchEntries: (...args: unknown[]) => mockSearchEntries(...args),
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}))

// ── Mock contexts ───────────────────────────────────────────────────────────
const { mockUseSearch, mockUseSaveStatus } = vi.hoisted(() => ({
  mockUseSearch: vi.fn(),
  mockUseSaveStatus: vi.fn(),
}))

vi.mock('@/context/SearchContext', () => ({
  useSearch: () => mockUseSearch(),
}))

vi.mock('@/context/SaveStatusContext', () => ({
  useSaveStatus: () => mockUseSaveStatus(),
}))

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeHit(date: string, tags: string[] = []) {
  return {
    objectID: `uid_${date}`,
    date,
    excerpt: `Excerpt for ${date}`,
    mood: null,
    moodLabel: null,
    tags,
    wordCount: 5,
  }
}

function makeMetadataRow(date: string, tags: string[]) {
  return {
    date,
    mood: null,
    moodLabel: null,
    tags,
    wordCount: 5,
    hasContent: true,
    updatedAt: `${date}T10:00:00.000Z`,
    lastSeenRevisionId: null,
    syncStatus: 'synced' as const,
    deletedAt: null,
  }
}

function renderSearchModal() {
  return render(
    <MemoryRouter>
      <SearchModal />
    </MemoryRouter>,
  )
}

function fireAuth(uid: string | null = 'test-uid') {
  if (authCallback) authCallback(uid ? { uid } : null)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SearchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authCallback = null
    mockListMetadata.mockResolvedValue([])
    mockSearchEntries.mockResolvedValue([])
    mockSubscribe.mockReturnValue(vi.fn())

    // Default: search open, Drive connected (syncStatus='synced')
    mockUseSearch.mockReturnValue({
      isSearchOpen: true,
      openSearch: vi.fn(),
      closeSearch: vi.fn(),
    })
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'synced',
      driveLoadProgress: null,
    })
  })

  it('renders search input when modal is open', async () => {
    renderSearchModal()
    fireAuth()

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Search entries' })).toBeTruthy()
    })
  })

  it('does not render when isSearchOpen is false', () => {
    mockUseSearch.mockReturnValue({
      isSearchOpen: false,
      openSearch: vi.fn(),
      closeSearch: vi.fn(),
    })
    renderSearchModal()
    expect(screen.queryByRole('textbox', { name: 'Search entries' })).toBeNull()
  })

  it('shows Drive-not-connected notice when Drive is disconnected, no entries, and no query', async () => {
    // saved-local = Drive not connected
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'saved-local',
      driveLoadProgress: null,
    })
    // No metadata / available tags
    mockListMetadata.mockResolvedValue([])

    renderSearchModal()
    fireAuth()

    await waitFor(() => {
      expect(screen.getByText(/Connect Google Drive/i)).toBeTruthy()
    })
  })

  it('does NOT show Drive-not-connected notice when syncStatus is not saved-local', async () => {
    // Drive connected
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'synced',
      driveLoadProgress: null,
    })
    mockListMetadata.mockResolvedValue([])

    renderSearchModal()
    fireAuth()

    // Wait for mount to settle
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Search entries' })).toBeTruthy()
    })
    expect(screen.queryByText(/Connect Google Drive/i)).toBeNull()
  })

  it('does NOT show Drive-not-connected notice when there are entries (available tags)', async () => {
    // saved-local but entries exist (tags were loaded)
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'saved-local',
      driveLoadProgress: null,
    })
    mockListMetadata.mockResolvedValue([makeMetadataRow('2026-05-01', ['faith'])])

    renderSearchModal()
    fireAuth()

    // Wait for tags to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Filter by #faith' })).toBeTruthy()
    })

    expect(screen.queryByText(/Connect Google Drive/i)).toBeNull()
  })

  it('renders tag chips in modal when metadata has tags', async () => {
    mockListMetadata.mockResolvedValue([
      makeMetadataRow('2026-05-01', ['faith', 'morning']),
      makeMetadataRow('2026-05-02', ['morning', 'prayer']),
    ])

    renderSearchModal()
    fireAuth()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Filter by #morning' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Filter by #faith' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Filter by #prayer' })).toBeTruthy()
    })
  })

  it('clicking a tag chip passes tags filter to searchEntries', async () => {
    mockListMetadata.mockResolvedValue([makeMetadataRow('2026-05-01', ['faith'])])
    // Return a result when searching with faith tag
    mockSearchEntries.mockResolvedValue([makeHit('2026-05-01', ['faith'])])

    renderSearchModal()
    fireAuth()

    // Wait for tag chip to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Filter by #faith' })).toBeTruthy()
    })

    // Click the tag chip to select it
    await userEvent.click(screen.getByRole('button', { name: 'Filter by #faith' }))

    // searchEntries should have been called with tags: ['faith']
    await waitFor(() => {
      expect(mockSearchEntries).toHaveBeenCalledWith(
        'test-uid',
        expect.any(String),
        expect.objectContaining({ tags: ['faith'] }),
      )
    })
  })

  it('shows no results message when search finds nothing', async () => {
    mockSearchEntries.mockResolvedValue([])

    renderSearchModal()
    fireAuth()

    const input = screen.getByRole('textbox', { name: 'Search entries' })
    await userEvent.type(input, 'xyzzy')

    await waitFor(() => {
      expect(screen.getByText(/No entries found for/)).toBeTruthy()
    })
  })

  it('shows search results when entries match', async () => {
    mockSearchEntries.mockResolvedValue([makeHit('2026-05-01'), makeHit('2026-05-02')])

    renderSearchModal()
    fireAuth()

    const input = screen.getByRole('textbox', { name: 'Search entries' })
    await userEvent.type(input, 'peace')

    await waitFor(() => {
      // Excerpt text appears in both the title (h3) and excerpt (p), so use getAllByText
      expect(screen.getAllByText('Excerpt for 2026-05-01').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Excerpt for 2026-05-02').length).toBeGreaterThan(0)
    })
  })
})
