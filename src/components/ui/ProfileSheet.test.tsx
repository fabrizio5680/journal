import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'

const mockSignOut = vi.fn().mockResolvedValue(undefined)
vi.mock('firebase/auth', () => ({ signOut: (...args: unknown[]) => mockSignOut(...args) }))
vi.mock('@/lib/firebase', () => ({ auth: {} }))

import ProfileSheet from './ProfileSheet'

const mockUser = {
  displayName: 'Jane Doe',
  photoURL: null,
  email: 'jane@example.com',
} as unknown as User

function renderSheet(isOpen = true) {
  const onClose = vi.fn()
  render(
    <BrowserRouter>
      <ProfileSheet user={mockUser} isOpen={isOpen} onClose={onClose} />
    </BrowserRouter>,
  )
  return { onClose }
}

describe('ProfileSheet', () => {
  it('renders user display name', () => {
    renderSheet()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('renders History, Insights and Settings links', () => {
    renderSheet()
    expect(screen.getByRole('link', { name: /history/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /insights/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('renders Sign out button', () => {
    renderSheet()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const { onClose } = renderSheet()
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when a nav link is clicked', async () => {
    const { onClose } = renderSheet()
    await userEvent.click(screen.getByRole('link', { name: /history/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls signOut and onClose when Sign out is clicked', async () => {
    const { onClose } = renderSheet()
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(mockSignOut).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('renders avatar placeholder when photoURL is null', () => {
    renderSheet()
    expect(screen.getByText('person')).toBeInTheDocument()
  })

  it('renders avatar image when photoURL is provided', () => {
    const userWithPhoto = {
      ...mockUser,
      photoURL: 'https://example.com/photo.jpg',
    } as unknown as User
    render(
      <BrowserRouter>
        <ProfileSheet user={userWithPhoto} isOpen={true} onClose={vi.fn()} />
      </BrowserRouter>,
    )
    expect(screen.getByRole('img', { name: /jane doe/i })).toBeInTheDocument()
  })
})
