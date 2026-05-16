import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGetRedirectResult = vi.fn().mockResolvedValue(null)
const mockOnAuthStateChanged = vi.fn((_auth: unknown, _callback: unknown) => vi.fn())
const mockSignInWithPopup = vi.fn()
const mockSignInWithRedirect = vi.fn()
const mockAuthStateReady = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  getRedirectResult: (auth: unknown) => mockGetRedirectResult(auth),
  onAuthStateChanged: (auth: unknown, callback: unknown) => mockOnAuthStateChanged(auth, callback),
  signInWithPopup: (auth: unknown, provider: unknown) => mockSignInWithPopup(auth, provider),
  signInWithRedirect: (auth: unknown, provider: unknown) => mockSignInWithRedirect(auth, provider),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: null,
    authStateReady: () => mockAuthStateReady(),
  },
}))

import LoginPage from './LoginPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRedirectResult.mockResolvedValue(null)
    mockAuthStateReady.mockResolvedValue(undefined)
  })

  it('shows local-first storage wording and public legal links', () => {
    renderPage()

    expect(
      screen.getByText(/Your entries stay on this device and your own Google Drive/i),
    ).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Account deletion' })).toHaveAttribute(
      'href',
      '/account-deletion',
    )
  })
})
