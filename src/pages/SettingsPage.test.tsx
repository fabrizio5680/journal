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

const {
  mockConnectGoogleDriveProvider,
  mockDisconnectGoogleDriveProvider,
  mockBackfillGoogleDriveMetadata,
  mockGetStorageUsage,
} = vi.hoisted(() => ({
  mockConnectGoogleDriveProvider: vi.fn().mockResolvedValue(undefined),
  mockDisconnectGoogleDriveProvider: vi.fn().mockResolvedValue(undefined),
  mockBackfillGoogleDriveMetadata: vi.fn().mockResolvedValue(undefined),
  mockGetStorageUsage: vi.fn(),
}))

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

vi.mock('@/lib/storage/providerConnection', () => ({
  connectGoogleDriveProvider: (...args: unknown[]) => mockConnectGoogleDriveProvider(...args),
  disconnectGoogleDriveProvider: (...args: unknown[]) => mockDisconnectGoogleDriveProvider(...args),
  backfillGoogleDriveMetadata: (...args: unknown[]) => mockBackfillGoogleDriveMetadata(...args),
  getDeviceProviderState: (_userId: string, metadata: Record<string, unknown>) => {
    if (metadata.activeStorageProvider !== 'googleDrive') {
      return { status: 'disconnected', deviceConnected: false }
    }
    return {
      ...metadata,
      status: metadata.storageTokenStatus === 'reconnect' ? 'reconnect' : 'connected',
      deviceConnected: metadata.storageTokenStatus !== 'reconnect',
    }
  },
}))

vi.mock('@/lib/storage/providers/googleDriveAdapter', () => ({
  GoogleDriveAdapter: class {
    constructor(public userId: string) {}
    getStorageUsage(...args: unknown[]) {
      return mockGetStorageUsage(...args)
    }
  },
}))

// --- UserPreferencesContext mock ---
const mockUpdateEditorFontSize = vi.fn().mockResolvedValue(undefined)
const mockUpdateSpellcheck = vi.fn()
const mockPrefs = {
  scriptureTranslation: 'NLT' as const,
  editorFontSize: 'medium' as const,
  spellcheckEnabled: true,
  updateEditorFontSize: mockUpdateEditorFontSize,
  updateSpellcheck: mockUpdateSpellcheck,
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
    mockConnectGoogleDriveProvider.mockResolvedValue(undefined)
    mockDisconnectGoogleDriveProvider.mockResolvedValue(undefined)
    mockBackfillGoogleDriveMetadata.mockResolvedValue(undefined)
    mockGetStorageUsage.mockResolvedValue({
      folderBytes: 1_258_291, // ≈ 1.2 MB
      driveUsage: 4_617_089_843, // ≈ 4.3 GB
      driveLimit: 16_106_127_360, // 15 GB
    })
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

  it('renders disconnected Google Drive storage state', () => {
    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false })

    expect(screen.getByText('Storage')).toBeInTheDocument()
    expect(screen.getByText(/Drive connection follows your account/i)).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect google drive/i })).toBeInTheDocument()
  })

  it('renders connected Google Drive storage account when emails match', () => {
    renderPage()
    fireAuth()
    fireSnapshot({
      reminderEnabled: false,
      activeStorageProvider: 'googleDrive',
      storageAccountEmail: 'test@example.com',
      storageRootFolderId: 'drive-root',
    })

    expect(screen.getByText(/Google Drive · test@example.com · connected/i)).toBeInTheDocument()
    expect(screen.queryByText(/differs from app account/i)).not.toBeInTheDocument()
  })

  it('shows the Drive account clearly when it differs from the app account', () => {
    renderPage()
    fireAuth()
    fireSnapshot({
      reminderEnabled: false,
      activeStorageProvider: 'googleDrive',
      storageAccountEmail: 'drive@example.com',
      storageRootFolderId: 'drive-root',
    })

    expect(screen.getByText(/Google Drive · drive@example.com · connected/i)).toBeInTheDocument()
    expect(screen.getByText(/Drive account differs from app account/i)).toBeInTheDocument()
  })

  it('renders reconnect state for Google Drive', () => {
    renderPage()
    fireAuth()
    fireSnapshot({
      reminderEnabled: false,
      activeStorageProvider: 'googleDrive',
      storageAccountEmail: 'drive@example.com',
      storageRootFolderId: 'reconnect-root',
      storageTokenStatus: 'reconnect',
    })

    expect(screen.getByText(/Google Drive · reconnect needed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reconnect google drive/i })).toBeInTheDocument()
  })

  it('connect action starts Google Drive provider connection for the current user', async () => {
    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false })

    await userEvent.click(screen.getByRole('button', { name: /connect google drive/i }))

    await waitFor(() => {
      expect(mockConnectGoogleDriveProvider).toHaveBeenCalledWith('test-uid', 'test@example.com')
    })
  })

  it('disconnect action confirms and disconnects Google Drive only on this device', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage()
    fireAuth()
    fireSnapshot({
      reminderEnabled: false,
      activeStorageProvider: 'googleDrive',
      storageAccountEmail: 'test@example.com',
      storageRootFolderId: 'drive-root',
    })

    await userEvent.click(screen.getByRole('button', { name: /disconnect google drive/i }))

    await waitFor(() => {
      expect(mockDisconnectGoogleDriveProvider).toHaveBeenCalledWith('test-uid')
    })
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/on this device/i))
    confirmSpy.mockRestore()
  })

  it('"Sync from Drive" button is visible when storage status is connected', () => {
    renderPage()
    fireAuth()
    fireSnapshot({
      reminderEnabled: false,
      activeStorageProvider: 'googleDrive',
      storageAccountEmail: 'test@example.com',
      storageRootFolderId: 'drive-root',
    })

    expect(screen.getByRole('button', { name: /sync from drive/i })).toBeInTheDocument()
  })

  it('"Sync from Drive" button is NOT visible when storage status is disconnected', () => {
    renderPage()
    fireAuth()
    fireSnapshot({ reminderEnabled: false })

    expect(screen.queryByRole('button', { name: /sync from drive/i })).not.toBeInTheDocument()
  })

  it('clicking "Sync from Drive" calls backfillGoogleDriveMetadata and shows "Syncing..." during the call', async () => {
    let resolveBackfill!: () => void
    mockBackfillGoogleDriveMetadata.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveBackfill = resolve
      }),
    )

    renderPage()
    fireAuth()
    fireSnapshot({
      reminderEnabled: false,
      activeStorageProvider: 'googleDrive',
      storageAccountEmail: 'test@example.com',
      storageRootFolderId: 'drive-root',
    })

    await userEvent.click(screen.getByRole('button', { name: /sync from drive/i }))

    // While the promise is pending the button should read "Syncing..."
    expect(screen.getByRole('button', { name: /syncing\.\.\./i })).toBeInTheDocument()
    expect(mockBackfillGoogleDriveMetadata).toHaveBeenCalledWith('test-uid')

    // Resolve the backfill and check the button returns to its idle label
    resolveBackfill()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sync from drive/i })).toBeInTheDocument()
    })
  })

  it('error from backfillGoogleDriveMetadata is shown to the user', async () => {
    mockBackfillGoogleDriveMetadata.mockRejectedValue(new Error('Drive sync failed'))

    renderPage()
    fireAuth()
    fireSnapshot({
      reminderEnabled: false,
      activeStorageProvider: 'googleDrive',
      storageAccountEmail: 'test@example.com',
      storageRootFolderId: 'drive-root',
    })

    await userEvent.click(screen.getByRole('button', { name: /sync from drive/i }))

    await screen.findByText('Drive sync failed')
  })

  describe('Drive usage row', () => {
    it('renders "Drive usage" row with placeholder while fetching, then the formatted string when Drive is connected', async () => {
      let resolveUsage!: (value: {
        folderBytes: number
        driveUsage: number | null
        driveLimit: number | null
      }) => void
      mockGetStorageUsage.mockReturnValue(
        new Promise((resolve) => {
          resolveUsage = resolve
        }),
      )

      renderPage()
      fireAuth()
      fireSnapshot({
        reminderEnabled: false,
        activeStorageProvider: 'googleDrive',
        storageAccountEmail: 'test@example.com',
        storageRootFolderId: 'drive-root',
      })

      // Row label is present
      expect(screen.getByText('Drive usage')).toBeInTheDocument()
      // While loading the value is "—"
      expect(screen.getByText('—')).toBeInTheDocument()

      // Resolve the adapter promise — formatted string should appear
      resolveUsage({
        folderBytes: 1_258_291, // ≈ 1.2 MB
        driveUsage: 4_617_089_843, // ≈ 4.3 GB
        driveLimit: 16_106_127_360, // 15 GB
      })

      const formatted = await screen.findByText(/Drive used/i)
      expect(formatted.textContent).toMatch(/of\s+\S+\s+GB\s+Drive used/i)
      // Folder portion uses MB; total uses GB
      expect(formatted.textContent).toMatch(/MB/)
      expect(formatted.textContent).toMatch(/GB/)
    })

    it('does NOT render the "Drive usage" row when Drive is disconnected', () => {
      renderPage()
      fireAuth()
      fireSnapshot({ reminderEnabled: false })

      expect(screen.queryByText('Drive usage')).not.toBeInTheDocument()
      expect(mockGetStorageUsage).not.toHaveBeenCalled()
    })

    it('on adapter throw, the row stays at the dash placeholder and emits console.warn (no error text shown)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockGetStorageUsage.mockRejectedValue(new Error('quota fetch failed'))

      renderPage()
      fireAuth()
      fireSnapshot({
        reminderEnabled: false,
        activeStorageProvider: 'googleDrive',
        storageAccountEmail: 'test@example.com',
        storageRootFolderId: 'drive-root',
      })

      // Row label still present — error path keeps the dash placeholder
      expect(screen.getByText('Drive usage')).toBeInTheDocument()

      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalled()
      })

      // Error text from the adapter must NOT be visible to the user
      expect(screen.queryByText('quota fetch failed')).not.toBeInTheDocument()
      // The placeholder dash should still be the displayed value
      expect(screen.getByText('—')).toBeInTheDocument()

      warnSpy.mockRestore()
    })

    it('format check: omits "of … Drive used" suffix when driveLimit is null', async () => {
      mockGetStorageUsage.mockResolvedValue({
        folderBytes: 1_258_291, // ≈ 1.2 MB
        driveUsage: null,
        driveLimit: null,
      })

      renderPage()
      fireAuth()
      fireSnapshot({
        reminderEnabled: false,
        activeStorageProvider: 'googleDrive',
        storageAccountEmail: 'test@example.com',
        storageRootFolderId: 'drive-root',
      })

      // Should eventually show only the folder bytes, not the Drive total
      await waitFor(() => {
        expect(screen.queryByText('—')).not.toBeInTheDocument()
      })

      // Find the Drive usage value cell — should contain MB but NOT "Drive used"
      expect(screen.queryByText(/Drive used/i)).not.toBeInTheDocument()
      // A bytes value (e.g. "1.2 MB") should be present near the Drive usage label
      const driveUsageRow = screen.getByText('Drive usage').parentElement?.parentElement
      expect(driveUsageRow?.textContent ?? '').toMatch(/MB/)
    })

    it('format check: includes "of X GB Drive used" suffix when driveLimit is present', async () => {
      mockGetStorageUsage.mockResolvedValue({
        folderBytes: 1_258_291,
        driveUsage: 4_617_089_843,
        driveLimit: 16_106_127_360, // 15 GB
      })

      renderPage()
      fireAuth()
      fireSnapshot({
        reminderEnabled: false,
        activeStorageProvider: 'googleDrive',
        storageAccountEmail: 'test@example.com',
        storageRootFolderId: 'drive-root',
      })

      const formatted = await screen.findByText(/of\s+\S+\s+GB\s+Drive used/i)
      expect(formatted).toBeInTheDocument()
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

  describe('FCM token rotation', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    afterEach(() => {
      localStorage.clear()
    })

    it('swaps tokens in Firestore and updates localStorage when token rotates on mount', async () => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') },
        writable: true,
        configurable: true,
      })
      mockGetToken.mockResolvedValue('new-token')
      localStorage.setItem('fcm_device_token_test-uid', 'old-token')

      renderPage()
      fireAuth()
      fireSnapshot({ reminderEnabled: true, reminderTime: '09:00', fcmTokens: ['new-token'] })

      // arrayUnion('new-token') called
      await waitFor(() => {
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ fcmTokens: expect.objectContaining({ _type: 'arrayUnion' }) }),
        )
      })

      // arrayRemove('old-token') called
      await waitFor(() => {
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ fcmTokens: expect.objectContaining({ _type: 'arrayRemove' }) }),
        )
      })

      // Verify the exact values passed to arrayUnion and arrayRemove
      expect(mockArrayUnion).toHaveBeenCalledWith('new-token')
      expect(mockArrayRemove).toHaveBeenCalledWith('old-token')

      // localStorage updated to new token
      expect(localStorage.getItem('fcm_device_token_test-uid')).toBe('new-token')

      // Toggle shows ON (currentDeviceToken is 'new-token', fcmTokens includes 'new-token')
      await waitFor(() => {
        expect(screen.getByRole('switch', { name: /reminder/i })).toHaveAttribute(
          'aria-checked',
          'true',
        )
      })
    })

    it('does not call updateDoc for token swap when token is unchanged on mount', async () => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') },
        writable: true,
        configurable: true,
      })
      mockGetToken.mockResolvedValue('same-token')
      localStorage.setItem('fcm_device_token_test-uid', 'same-token')

      renderPage()
      fireAuth()
      fireSnapshot({ reminderEnabled: true, reminderTime: '09:00', fcmTokens: ['same-token'] })

      // Wait for mount effect to resolve
      await waitFor(() => {
        expect(screen.getByRole('switch', { name: /reminder/i })).toHaveAttribute(
          'aria-checked',
          'true',
        )
      })

      // No arrayUnion/arrayRemove swap calls should have been made
      expect(mockArrayUnion).not.toHaveBeenCalled()
      expect(mockArrayRemove).not.toHaveBeenCalled()
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('writes FCM token to localStorage when reminder is enabled', async () => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') },
        writable: true,
        configurable: true,
      })
      mockGetToken.mockResolvedValue('mock-fcm-token')

      renderPage()
      fireAuth()
      fireSnapshot({ reminderEnabled: false, reminderTime: '20:00', fcmTokens: [] })

      await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

      await waitFor(() => {
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ reminderEnabled: true }),
        )
      })

      expect(localStorage.getItem('fcm_device_token_test-uid')).toBe('mock-fcm-token')
    })

    it('removes FCM token from localStorage when reminder is disabled', async () => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') },
        writable: true,
        configurable: true,
      })
      mockGetToken.mockResolvedValue('mock-fcm-token')
      localStorage.setItem('fcm_device_token_test-uid', 'mock-fcm-token')
      mockGetDoc.mockResolvedValue({ data: () => ({ fcmTokens: [] }) })

      renderPage()
      fireAuth()
      fireSnapshot({ reminderEnabled: true, reminderTime: '09:00', fcmTokens: ['mock-fcm-token'] })

      // Wait for toggle to show ON
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

      expect(localStorage.getItem('fcm_device_token_test-uid')).toBeNull()
    })
  })
})
