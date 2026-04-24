import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'

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

import { UserPreferencesProvider } from './UserPreferencesContext'

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

describe('UserPreferencesContext — timezone refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    authCallback = null
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
