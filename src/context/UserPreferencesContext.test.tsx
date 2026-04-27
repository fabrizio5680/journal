import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

// --- Firestore mocks ---
let snapshotCallback: ((snap: unknown) => void) | null = null
const mockUnsub = vi.fn()
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn().mockReturnValue({ id: 'mock-user-ref' })
const mockOnSnapshot = vi.fn((_: unknown, cb: (snap: unknown) => void) => {
  snapshotCallback = cb
  return mockUnsub
})

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...(args as [unknown, ...unknown[]])),
  onSnapshot: (ref: unknown, cb: (snap: unknown) => void) => mockOnSnapshot(ref, cb),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...(args as [unknown, ...unknown[]])),
}))

// --- Auth mocks ---
let authCallback: ((user: { uid: string } | null) => void) | null = null

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: typeof authCallback) => {
    authCallback = cb
    return vi.fn()
  },
}))

// --- firebase.ts mock ---
vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}))

import { UserPreferencesProvider, useUserPreferences } from './UserPreferencesContext'

const TEST_USER = { uid: 'test-uid' }

function fireAuth(user = TEST_USER) {
  act(() => {
    authCallback?.(user)
  })
}

function fireSnapshot(data: Record<string, unknown> = {}) {
  act(() => {
    snapshotCallback?.({ data: () => data })
  })
}

function renderProvider() {
  return render(
    <UserPreferencesProvider>
      <div />
    </UserPreferencesProvider>,
  )
}

// Helper that renders provider and exposes context value via renderHook
function renderProviderWithCapture() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UserPreferencesProvider>{children}</UserPreferencesProvider>
  )
  const { result } = renderHook(() => useUserPreferences(), { wrapper })
  return () => result.current
}

describe('UserPreferencesContext — timezone refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    authCallback = null
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('calls updateDoc with detected timezone when reminderEnabled is true and timezone is stale', () => {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const staleTz = detectedTz === 'America/New_York' ? 'Europe/London' : 'America/New_York'

    renderProvider()
    fireAuth()
    fireSnapshot({
      reminderEnabled: true,
      reminderTimezone: staleTz,
    })

    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { reminderTimezone: detectedTz })
  })

  it('does NOT call updateDoc for timezone when reminderEnabled is false', () => {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const staleTz = detectedTz === 'America/New_York' ? 'Europe/London' : 'America/New_York'

    renderProvider()
    fireAuth()
    fireSnapshot({
      reminderEnabled: false,
      reminderTimezone: staleTz,
    })

    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })

  it('does NOT call updateDoc for timezone when reminderEnabled is true but timezone already matches', () => {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone

    renderProvider()
    fireAuth()
    fireSnapshot({
      reminderEnabled: true,
      reminderTimezone: detectedTz,
    })

    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })

  it('does NOT call updateDoc for timezone when reminderEnabled is undefined', () => {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const staleTz = detectedTz === 'America/New_York' ? 'Europe/London' : 'America/New_York'

    renderProvider()
    fireAuth()
    fireSnapshot({
      reminderTimezone: staleTz,
      // reminderEnabled omitted — simulates user doc without the field
    })

    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })
})

describe('UserPreferencesContext — spellcheckEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    authCallback = null
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults spellcheckEnabled to true when localStorage has no pref_spellcheck', () => {
    const getCapture = renderProviderWithCapture()
    expect(getCapture()?.spellcheckEnabled).toBe(true)
  })

  it('reads spellcheckEnabled as false when localStorage has pref_spellcheck = "false"', () => {
    localStorage.setItem('pref_spellcheck', 'false')
    const getCapture = renderProviderWithCapture()
    expect(getCapture()?.spellcheckEnabled).toBe(false)
  })

  it('updateSpellcheck(false) writes "false" to localStorage and updates state', async () => {
    const getCapture = renderProviderWithCapture()

    await act(async () => {
      getCapture()?.updateSpellcheck(false)
    })

    expect(localStorage.getItem('pref_spellcheck')).toBe('false')
    expect(getCapture()?.spellcheckEnabled).toBe(false)
  })

  it('updateSpellcheck(true) writes "true" to localStorage and updates state', async () => {
    localStorage.setItem('pref_spellcheck', 'false')
    const getCapture = renderProviderWithCapture()

    await act(async () => {
      getCapture()?.updateSpellcheck(true)
    })

    expect(localStorage.getItem('pref_spellcheck')).toBe('true')
    expect(getCapture()?.spellcheckEnabled).toBe(true)
  })
})

describe('UserPreferencesContext — editorFontSize localStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    authCallback = null
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('initializes editorFontSize from localStorage when an entry already exists', () => {
    localStorage.setItem('pref_editor_font_size', 'large')

    const getCapture = renderProviderWithCapture()
    expect(getCapture()?.editorFontSize).toBe('large')
  })

  it('defaults editorFontSize to medium when no localStorage entry exists', () => {
    const getCapture = renderProviderWithCapture()
    expect(getCapture()?.editorFontSize).toBe('medium')
  })

  it('seeds localStorage from Firestore value on first snapshot when no local entry exists', () => {
    const getCapture = renderProviderWithCapture()
    fireAuth()
    fireSnapshot({ editorFontSize: 'small' })

    expect(localStorage.getItem('pref_editor_font_size')).toBe('small')
    expect(getCapture()?.editorFontSize).toBe('small')
  })

  it('does NOT overwrite localStorage with Firestore value when a local entry already exists', () => {
    localStorage.setItem('pref_editor_font_size', 'large')

    const getCapture = renderProviderWithCapture()
    fireAuth()
    fireSnapshot({ editorFontSize: 'small' })

    // localStorage must still be 'large', not overwritten by Firestore
    expect(localStorage.getItem('pref_editor_font_size')).toBe('large')
    // Context keeps the local value
    expect(getCapture()?.editorFontSize).toBe('large')
  })

  it('updateEditorFontSize writes to localStorage and does NOT call Firestore updateDoc', async () => {
    const getCapture = renderProviderWithCapture()
    fireAuth()
    fireSnapshot({})

    await act(async () => {
      await getCapture()?.updateEditorFontSize('small')
    })

    expect(localStorage.getItem('pref_editor_font_size')).toBe('small')
    // updateDoc must NOT have been called for font size — only the timezone call is allowed
    const fontSizeUpdateCalls = mockUpdateDoc.mock.calls.filter(([, fields]) => {
      const f = fields as Record<string, unknown>
      return 'editorFontSize' in f
    })
    expect(fontSizeUpdateCalls).toHaveLength(0)
  })

  it('updateEditorFontSize updates the context state immediately', async () => {
    const getCapture = renderProviderWithCapture()
    fireAuth()
    fireSnapshot({})

    await act(async () => {
      await getCapture()?.updateEditorFontSize('large')
    })

    expect(getCapture()?.editorFontSize).toBe('large')
  })
})
