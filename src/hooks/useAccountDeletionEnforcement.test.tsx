import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAccountDeletionEnforcement } from './useAccountDeletionEnforcement'

const mockOnIdTokenChanged = vi.fn()
const mockOnSnapshot = vi.fn()
const mockHasSeenAccountDocument = vi.fn()
const mockMarkAccountDocumentSeen = vi.fn()
const mockSignOutDeletedAccount = vi.fn()

vi.mock('firebase/auth', () => ({
  onIdTokenChanged: (auth: unknown, callback: unknown) => mockOnIdTokenChanged(auth, callback),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...parts: string[]) => parts.join('/')),
  onSnapshot: (ref: unknown, next: unknown, error: unknown) => mockOnSnapshot(ref, next, error),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}))

vi.mock('@/lib/accountCleanup', () => ({
  hasSeenAccountDocument: (userId: string) => mockHasSeenAccountDocument(userId),
  markAccountDocumentSeen: (userId: string) => mockMarkAccountDocumentSeen(userId),
  signOutDeletedAccount: (userId: string) => mockSignOutDeletedAccount(userId),
}))

function Harness() {
  useAccountDeletionEnforcement()
  const location = useLocation()
  return <p>Path: {location.pathname}</p>
}

function renderHookRoute() {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<Harness />} />
        <Route path="/login" element={<p>Login</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('useAccountDeletionEnforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnIdTokenChanged.mockReturnValue(vi.fn())
    mockOnSnapshot.mockReturnValue(vi.fn())
    mockHasSeenAccountDocument.mockReturnValue(false)
    mockSignOutDeletedAccount.mockResolvedValue(undefined)
  })

  it('marks the account document as seen when it exists', () => {
    renderHookRoute()

    const [, authCallback] = mockOnIdTokenChanged.mock.calls[0] as [
      unknown,
      (user: { uid: string; reload: () => Promise<void> } | null) => void,
    ]
    act(() => authCallback({ uid: 'uid-1', reload: vi.fn().mockResolvedValue(undefined) }))

    const [, snapshotCallback] = mockOnSnapshot.mock.calls[0] as [
      unknown,
      (snapshot: { exists: () => boolean }) => void,
      unknown,
    ]
    act(() => snapshotCallback({ exists: () => true }))

    expect(mockMarkAccountDocumentSeen).toHaveBeenCalledWith('uid-1')
    expect(mockSignOutDeletedAccount).not.toHaveBeenCalled()
  })

  it('does not clear first-sign-in devices before an account document has existed', () => {
    renderHookRoute()

    const [, authCallback] = mockOnIdTokenChanged.mock.calls[0] as [
      unknown,
      (user: { uid: string; reload: () => Promise<void> } | null) => void,
    ]
    act(() => authCallback({ uid: 'uid-1', reload: vi.fn().mockResolvedValue(undefined) }))

    const [, snapshotCallback] = mockOnSnapshot.mock.calls[0] as [
      unknown,
      (snapshot: { exists: () => boolean }) => void,
      unknown,
    ]
    act(() => snapshotCallback({ exists: () => false }))

    expect(mockSignOutDeletedAccount).not.toHaveBeenCalled()
    expect(screen.getByText('Path: /settings')).toBeInTheDocument()
  })

  it('clears the device and redirects when a previously seen account document disappears', async () => {
    mockHasSeenAccountDocument.mockReturnValue(true)
    renderHookRoute()

    const [, authCallback] = mockOnIdTokenChanged.mock.calls[0] as [
      unknown,
      (user: { uid: string; reload: () => Promise<void> } | null) => void,
    ]
    act(() => authCallback({ uid: 'uid-1', reload: vi.fn().mockResolvedValue(undefined) }))

    const [, snapshotCallback] = mockOnSnapshot.mock.calls[0] as [
      unknown,
      (snapshot: { exists: () => boolean }) => void,
      unknown,
    ]
    act(() => snapshotCallback({ exists: () => false }))

    await waitFor(() => expect(mockSignOutDeletedAccount).toHaveBeenCalledWith('uid-1'))
    expect(await screen.findByText('Login')).toBeInTheDocument()
  })

  it('clears the device when Firebase Auth reports the user is deleted', async () => {
    renderHookRoute()

    const [, authCallback] = mockOnIdTokenChanged.mock.calls[0] as [
      unknown,
      (user: { uid: string; reload: () => Promise<void> } | null) => void,
    ]
    act(() =>
      authCallback({
        uid: 'uid-1',
        reload: vi.fn().mockRejectedValue({ code: 'auth/user-not-found' }),
      }),
    )

    await waitFor(() => expect(mockSignOutDeletedAccount).toHaveBeenCalledWith('uid-1'))
    expect(await screen.findByText('Login')).toBeInTheDocument()
  })
})
