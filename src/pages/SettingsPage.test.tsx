import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { BrowserRouter } from 'react-router-dom'

// --- Firestore mocks ---
let snapshotCallback: ((snap: unknown) => void) | null = null
const mockUnsub = vi.fn()
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn().mockReturnValue({ id: 'mock-ref' })
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
let authCallback:
  | ((
      user: {
        uid: string
        displayName: string
        email: string
        photoURL: string | null
      } | null,
    ) => void)
  | null = null

const mockSignOut = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: typeof authCallback) => {
    authCallback = cb
    return vi.fn()
  },
  signOut: (...args: unknown[]) => mockSignOut(...args),
}))

// --- FCM mock ---
const mockGetToken = vi.fn().mockResolvedValue('mock-fcm-token')
vi.mock('firebase/messaging', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}))

// --- firebase.ts mock (overrides setup.ts) ---
vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
  messagingPromise: Promise.resolve({ name: 'mock-messaging' }),
  default: {},
}))

// --- UserPreferencesContext mock ---
const mockUpdateEditorFontSize = vi.fn().mockResolvedValue(undefined)
const mockPrefs = {
  grainEnabled: true,
  scriptureTranslation: 'NLT' as const,
  editorFontSize: 'medium' as const,
  updateEditorFontSize: mockUpdateEditorFontSize,
}
vi.mock('@/context/UserPreferencesContext', () => ({
  useUserPreferences: () => mockPrefs,
}))

// --- Router mock ---
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import SettingsPage from './SettingsPage'

const TEST_USER = {
  uid: 'test-uid',
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: null,
}

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

function renderPage() {
  return render(
    <BrowserRouter>
      <SettingsPage />
    </BrowserRouter>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'test-vapid-key')
    snapshotCallback = null
    authCallback = null
    mockUpdateDoc.mockResolvedValue(undefined)
    mockGetToken.mockResolvedValue('mock-fcm-token')
    mockUpdateEditorFontSize.mockResolvedValue(undefined)
    mockPrefs.grainEnabled = true
    mockPrefs.scriptureTranslation = 'NLT'
    mockPrefs.editorFontSize = 'medium'
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders user name and email after auth', () => {
    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false, reminderTime: '20:00' })

    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('toggling reminder OFF saves reminderEnabled: false and fcmToken: null', async () => {
    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: true, reminderTime: '09:00' })

    // Wait for enabled state to appear (reminder time input visible)
    await screen.findByLabelText('Reminder time')

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reminderEnabled: false, fcmToken: null }),
      )
    })
  })

  it('toggling reminder ON requests permission and saves fcmToken + reminderEnabled: true', async () => {
    // Grant notification permission
    Object.defineProperty(window, 'Notification', {
      value: { requestPermission: vi.fn().mockResolvedValue('granted') },
      writable: true,
      configurable: true,
    })

    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false, reminderTime: '20:00' })

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fcmToken: 'mock-fcm-token',
          reminderEnabled: true,
          reminderTime: '20:00',
          reminderTimezone: expect.any(String),
        }),
      )
    })
  })

  it('shows error when notification permission is denied', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { requestPermission: vi.fn().mockResolvedValue('denied') },
      writable: true,
      configurable: true,
    })

    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false, reminderTime: '20:00' })

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    await screen.findByText(/permission denied/i)
    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })

  it('changing reminder time saves reminderTime to user doc', async () => {
    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: true, reminderTime: '20:00' })

    const timeInput = await screen.findByLabelText('Reminder time')
    await userEvent.clear(timeInput)
    await userEvent.type(timeInput, '08:30')

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reminderTime: '08:30' }),
      )
    })
  })

  it('grain toggle saves grainEnabled: false when toggled off', async () => {
    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false })

    await userEvent.click(screen.getByRole('switch', { name: /grain/i }))

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ grainEnabled: false }),
      )
    })
  })

  it('changing translation saves scriptureTranslation and clears localStorage cache', async () => {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(
      `scripture_NLT_${today}`,
      JSON.stringify({ text: 'test', reference: 'Ps 1:1' }),
    )

    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false })

    await userEvent.click(screen.getByRole('button', { name: 'ESV' }))

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ scriptureTranslation: 'ESV' }),
      )
    })

    // Old translation cache cleared
    expect(localStorage.getItem(`scripture_NLT_${today}`)).toBeNull()
  })

  it('clicking a font size button calls updateEditorFontSize', async () => {
    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false })

    await userEvent.click(screen.getByRole('button', { name: /large/i }))

    await waitFor(() => {
      expect(mockUpdateEditorFontSize).toHaveBeenCalledWith('large')
    })
  })

  it('sign out calls signOut and navigates to /login', async () => {
    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false })

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })
})
