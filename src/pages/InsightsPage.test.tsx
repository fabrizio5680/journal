import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'

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
const { mockListMetadata, mockSubscribe } = vi.hoisted(() => ({
  mockListMetadata: vi.fn().mockResolvedValue([]),
  mockSubscribe: vi.fn(() => vi.fn()),
}))

vi.mock('@/lib/storage/entryRepository', () => ({
  EntryRepository: {
    listMetadata: (...args: unknown[]) => mockListMetadata(...args),
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}))

// ── Mock SaveStatusContext ──────────────────────────────────────────────────
const { mockUseSaveStatus } = vi.hoisted(() => ({
  mockUseSaveStatus: vi.fn(),
}))

vi.mock('@/context/SaveStatusContext', () => ({
  useSaveStatus: () => mockUseSaveStatus(),
}))

// ── Mock useStreak ──────────────────────────────────────────────────────────
vi.mock('@/hooks/useStreak', () => ({
  useStreak: () => ({ current: 0, longest: 0 }),
}))

// ── Mock usePageTitle ───────────────────────────────────────────────────────
vi.mock('@/hooks/usePageTitle', () => ({
  usePageTitle: () => undefined,
}))

// ── Mock Recharts (used by MoodSparkline and TopTags) ───────────────────────
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  LabelList: () => null,
}))

import InsightsPage from './InsightsPage'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMetadataRow(date: string, mood: 1 | 2 | 3 | 4 | 5 | null = 3) {
  return {
    date,
    mood,
    moodLabel: mood != null ? 'peaceful' : null,
    tags: ['faith'],
    wordCount: 10,
    hasContent: true,
    updatedAt: `${date}T10:00:00.000Z`,
    lastSeenRevisionId: null,
    syncStatus: 'synced' as const,
    deletedAt: null,
  }
}

function renderInsightsPage() {
  return render(
    <MemoryRouter>
      <InsightsPage />
    </MemoryRouter>,
  )
}

function fireAuth(uid: string | null = 'test-uid') {
  act(() => {
    authCallback?.(uid ? { uid } : null)
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('InsightsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authCallback = null
    mockListMetadata.mockResolvedValue([])
    mockSubscribe.mockReturnValue(vi.fn())
    // Default: Drive connected
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'synced',
      driveLoadProgress: null,
    })
  })

  it('shows skeleton before insights load', async () => {
    mockListMetadata.mockImplementation(() => new Promise(() => undefined))

    renderInsightsPage()
    fireAuth()

    await waitFor(() => {
      expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    })
  })

  it('shows Drive-not-connected card when totalEntries === 0 and Drive disconnected', async () => {
    // saved-local = Drive not connected
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'saved-local',
      driveLoadProgress: null,
    })
    mockListMetadata.mockResolvedValue([])

    renderInsightsPage()
    fireAuth()

    await waitFor(() => {
      expect(
        screen.getByText(/Connect Google Drive to see your history across devices/i),
      ).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: /Go to Settings/i })).toBeTruthy()
  })

  it('does NOT show Drive-not-connected card when Drive IS connected (even with 0 entries)', async () => {
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'synced',
      driveLoadProgress: null,
    })
    mockListMetadata.mockResolvedValue([])

    renderInsightsPage()
    fireAuth()

    await waitFor(() => {
      expect(
        screen.queryByText(/Connect Google Drive to see your history across devices/i),
      ).toBeNull()
    })
  })

  it('shows Write a few more card when Drive IS connected and entry count is 1', async () => {
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'synced',
      driveLoadProgress: null,
    })
    // 1 entry — below MIN_ENTRIES_FOR_INSIGHTS (3)
    mockListMetadata.mockResolvedValue([makeMetadataRow('2026-05-01')])

    renderInsightsPage()
    fireAuth()

    await waitFor(() => {
      expect(screen.getByText(/Write a few more to see patterns/i)).toBeTruthy()
    })
    // Drive-not-connected card should NOT appear
    expect(
      screen.queryByText(/Connect Google Drive to see your history across devices/i),
    ).toBeNull()
  })

  it('shows Write a few more card when Drive IS connected and entry count is 2', async () => {
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'synced',
      driveLoadProgress: null,
    })
    mockListMetadata.mockResolvedValue([
      makeMetadataRow('2026-05-01'),
      makeMetadataRow('2026-05-02'),
    ])

    renderInsightsPage()
    fireAuth()

    await waitFor(() => {
      expect(screen.getByText(/Write a few more to see patterns/i)).toBeTruthy()
    })
  })

  it('shows normal insights (stats) when entries >= 3', async () => {
    mockListMetadata.mockResolvedValue([
      makeMetadataRow('2026-05-01', 3),
      makeMetadataRow('2026-05-02', 4),
      makeMetadataRow('2026-05-03', 5),
    ])

    renderInsightsPage()
    fireAuth()

    await waitFor(() => {
      // "3 entries written" stat card
      expect(screen.getByText('3')).toBeTruthy()
      expect(screen.getByText('entries written')).toBeTruthy()
    })
    // Neither empty-state card should appear
    expect(
      screen.queryByText(/Connect Google Drive to see your history across devices/i),
    ).toBeNull()
    expect(screen.queryByText(/Write a few more to see patterns/i)).toBeNull()
  })

  it('shows Drive-not-connected card when Drive disconnected with 0 entries but NOT when 1+ entry exists', async () => {
    // First render: 0 entries, disconnected
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'saved-local',
      driveLoadProgress: null,
    })
    mockListMetadata.mockResolvedValue([])

    const { unmount } = renderInsightsPage()
    fireAuth()

    await waitFor(() => {
      expect(
        screen.getByText(/Connect Google Drive to see your history across devices/i),
      ).toBeTruthy()
    })

    unmount()

    // Second render: 1 entry, disconnected → "Write a few more" (not Drive prompt)
    vi.clearAllMocks()
    authCallback = null
    mockSubscribe.mockReturnValue(vi.fn())
    mockUseSaveStatus.mockReturnValue({
      syncStatus: 'saved-local',
      driveLoadProgress: null,
    })
    mockListMetadata.mockResolvedValue([makeMetadataRow('2026-05-01')])

    renderInsightsPage()
    fireAuth()

    await waitFor(() => {
      expect(screen.getByText(/Write a few more to see patterns/i)).toBeTruthy()
    })
    expect(
      screen.queryByText(/Connect Google Drive to see your history across devices/i),
    ).toBeNull()
  })
})
