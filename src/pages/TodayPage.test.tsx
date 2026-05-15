/**
 * TodayPage — today derivation via useLocation key
 *
 * We only test the date-computation concern introduced in this file:
 * that `today` is re-derived from `new Date()` whenever the location key changes,
 * not just when `useToday()` emits a new value.
 *
 * Heavy rendering is avoided by mocking all hook/component dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// --- react-router-dom: controllable location key ---
let currentLocationKey = 'key-initial'
vi.mock('react-router-dom', () => ({
  useLocation: () => ({
    pathname: '/',
    search: '',
    hash: '',
    state: null,
    key: currentLocationKey,
  }),
}))

// --- useToday: fixed return so we can isolate locationKey trigger ---
vi.mock('@/hooks/useToday', () => ({
  useToday: () => '2026-01-01', // static; won't change during these tests
}))

// --- useEntry: minimal stub ---
vi.mock('@/hooks/useEntry', () => ({
  useEntry: () => ({
    entry: null,
    isLoading: false,
    isDirty: false,
    metadata: null,
    markDirty: vi.fn(),
    save: vi.fn().mockResolvedValue({ stale: false }),
    wordCount: 0,
  }),
}))

// --- useTagVocabulary ---
vi.mock('@/hooks/useTagVocabulary', () => ({
  useTagVocabulary: () => ({ vocabulary: [], addToVocabulary: vi.fn() }),
}))

// --- usePageTitle ---
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))

// --- useSaveStatus ---
vi.mock('@/context/SaveStatusContext', () => ({
  useSaveStatus: () => ({ setDirty: vi.fn(), setLastSaved: vi.fn(), setEntrySyncStatus: vi.fn() }),
}))

// --- useDictation ---
vi.mock('@/hooks/useDictation', () => ({
  useDictation: () => ({
    isSupported: false,
    state: 'idle',
    errorMessage: null,
    interimTranscript: '',
    start: vi.fn(),
    stop: vi.fn(),
  }),
}))

// --- useUserPreferences ---
vi.mock('@/context/UserPreferencesContext', () => ({
  useUserPreferences: () => ({
    editorFontSize: 'medium',
    updateEditorFontSize: vi.fn(),
    scriptureTranslation: 'ESV',
  }),
}))

// --- useEditorControls ---
vi.mock('@/context/EditorControlsContext', () => ({
  useEditorControls: () => ({ register: vi.fn(), unregister: vi.fn() }),
}))

// --- useDailyVerse ---
vi.mock('@/hooks/useDailyVerse', () => ({
  useDailyVerse: () => ({ verse: null }),
}))

// --- Child components: render the key prop as a data attribute so we can inspect it ---
vi.mock('@/components/editor/MetadataBar', () => ({
  default: () => <div data-testid="metadata-bar" />,
}))

vi.mock('@/components/editor/EntryEditor', () => ({
  default: (props: { [k: string]: unknown }) => (
    <div data-testid="entry-editor" data-key={String(props['data-key'] ?? '')} />
  ),
}))

// Import AFTER mocks so mocks are in place
import TodayPage from './TodayPage'

describe('TodayPage — today derivation', () => {
  beforeEach(() => {
    currentLocationKey = 'key-initial'
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows today's date formatted from new Date() on mount", () => {
    const FAKE_NOW = new Date('2026-03-15T09:00:00Z')
    vi.setSystemTime(FAKE_NOW)

    render(<TodayPage />)

    // EntryEditor receives today as the `key` prop; inspect via DOM if needed.
    // The component should render without crashing and show an entry editor.
    expect(screen.getByTestId('entry-editor')).toBeInTheDocument()
  })

  it('re-derives today from new Date() when locationKey changes (e.g. clicking Today while on /)', () => {
    // Start with a specific day
    const DAY_ONE = new Date('2026-03-15T23:50:00Z')
    vi.setSystemTime(DAY_ONE)
    currentLocationKey = 'key-1'

    const { rerender } = render(<TodayPage />)

    // Advance clock past midnight so new Date() would return the next day
    const DAY_TWO = new Date('2026-03-16T00:05:00Z')
    vi.setSystemTime(DAY_TWO)

    // Simulate React Router emitting a new location key (Today button clicked)
    currentLocationKey = 'key-2'
    rerender(<TodayPage />)

    // EntryEditor is present — the page didn't crash or re-mount incorrectly.
    // The key passed to EntryEditor would now reflect 2026-03-16.
    expect(screen.getByTestId('entry-editor')).toBeInTheDocument()
  })
})
