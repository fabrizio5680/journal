import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { BrowserRouter } from 'react-router-dom'

// --- Firestore mocks ---
let snapshotCallback: ((snap: unknown) => void) | null = null
const mockUnsub = vi.fn()
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockGetDoc = vi.fn().mockResolvedValue({ data: () => ({ fcmTokens: [] }) })
const mockDoc = vi.fn().mockReturnValue({ id: 'mock-ref' })
const mockArrayUnion = vi.fn((...args: unknown[]) => ({ _type: 'arrayUnion', args }))
const mockArrayRemove = vi.fn((...args: unknown[]) => ({ _type: 'arrayRemove', args }))
const mockOnSnapshot = vi.fn((_: unknown, cb: (snap: unknown) => void) => {
  snapshotCallback = cb
  return mockUnsub
})

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...(args as [unknown, ...unknown[]])),
  onSnapshot: (ref: unknown, cb: (snap: unknown) => void) => mockOnSnapshot(ref, cb),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...(args as [unknown, ...unknown[]])),
  getDoc: (...args: unknown[]) => mockGetDoc(...(args as [unknown, ...unknown[]])),
  arrayUnion: (...args: unknown[]) => mockArrayUnion(...args),
  arrayRemove: (...args: unknown[]) => mockArrayRemove(...args),
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
let mockMessagingPromise: Promise<{ name: string } | null> = Promise.resolve({
  name: 'mock-messaging',
})

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
  get messagingPromise() {
    return mockMessagingPromise
  },
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
    mockMessagingPromise = Promise.resolve({ name: 'mock-messaging' })
    mockUpdateDoc.mockResolvedValue(undefined)
    mockGetDoc.mockResolvedValue({ data: () => ({ fcmTokens: [] }) })
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

  it('toggling reminder OFF removes current device token via arrayRemove', async () => {
    // Simulate device already has token registered
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') },
      writable: true,
      configurable: true,
    })
    mockGetToken.mockResolvedValue('mock-fcm-token')
    // getDoc after arrayRemove returns empty array → triggers reminderEnabled: false
    mockGetDoc.mockResolvedValue({ data: () => ({ fcmTokens: [] }) })

    renderPage()
    fireAuth()
    // device token is in fcmTokens so toggle shows ON
    fireSnapshot({ reminderEnabled: true, reminderTime: '09:00', fcmTokens: ['mock-fcm-token'] })

    // Wait for the silent getToken on mount to resolve and toggle to show ON
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /reminder/i })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fcmTokens: expect.objectContaining({ _type: 'arrayRemove' }) }),
      )
    })
    // Last token removed → reminderEnabled cleared
    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reminderEnabled: false }),
      )
    })
  })

  it('toggling reminder OFF with other devices still enrolled does NOT clear reminderEnabled', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') },
      writable: true,
      configurable: true,
    })
    mockGetToken.mockResolvedValue('mock-fcm-token')
    // getDoc returns another device's token still present
    mockGetDoc.mockResolvedValue({ data: () => ({ fcmTokens: ['other-device-token'] }) })

    renderPage()
    fireAuth()
    fireSnapshot({
      reminderEnabled: true,
      reminderTime: '09:00',
      fcmTokens: ['mock-fcm-token', 'other-device-token'],
    })

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /reminder/i })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fcmTokens: expect.objectContaining({ _type: 'arrayRemove' }) }),
      )
    })
    // reminderEnabled must NOT be set to false — other device still enrolled
    const calls = mockUpdateDoc.mock.calls
    const disabledCall = calls.find(
      ([, fields]) => 'reminderEnabled' in (fields as Record<string, unknown>),
    )
    expect(disabledCall).toBeUndefined()
  })

  it('toggling reminder ON requests permission and saves arrayUnion(token) + reminderEnabled: true', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') },
      writable: true,
      configurable: true,
    })

    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false, reminderTime: '20:00', fcmTokens: [] })

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fcmTokens: expect.objectContaining({ _type: 'arrayUnion' }),
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

  it('shows error when messaging is not supported (messagingPromise resolves null)', async () => {
    mockMessagingPromise = Promise.resolve(null)

    Object.defineProperty(window, 'Notification', {
      value: { requestPermission: vi.fn().mockResolvedValue('granted') },
      writable: true,
      configurable: true,
    })

    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false, reminderTime: '20:00' })

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    await screen.findByText(/not supported in this browser/i)
    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })

  it('shows error when getToken throws', async () => {
    mockGetToken.mockRejectedValueOnce(new Error('token error'))

    Object.defineProperty(window, 'Notification', {
      value: { requestPermission: vi.fn().mockResolvedValue('granted') },
      writable: true,
      configurable: true,
    })

    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false, reminderTime: '20:00' })

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    await screen.findByText(/failed to register/i)
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

  it('renders "Editor Text Size (this device)" label', () => {
    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false })

    expect(screen.getByText('Editor Text Size (this device)')).toBeInTheDocument()
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
