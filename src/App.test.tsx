import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockOnAuthStateChanged = vi.fn((_auth: unknown, _callback: unknown) => vi.fn())

vi.mock('firebase/auth', () => ({
  deleteUser: vi.fn(),
  onAuthStateChanged: (auth: unknown, callback: unknown) => mockOnAuthStateChanged(auth, callback),
  signOut: vi.fn(),
}))

vi.mock('@/hooks/usePWAUpdate', () => ({
  usePWAUpdate: () => ({ needRefresh: false, updateServiceWorker: vi.fn() }),
}))

import App from './App'

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App public legal routes', () => {
  beforeEach(() => {
    mockOnAuthStateChanged.mockClear()
  })

  it.each([
    ['/privacy', /Your journal is local-first/i],
    ['/terms', /Terms for using Quiet Dwelling/i],
    ['/account-deletion', /How to request deletion/i],
  ])('renders %s without requiring auth', async (path, heading) => {
    renderRoute(path)

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(mockOnAuthStateChanged).not.toHaveBeenCalled()
  })
})
