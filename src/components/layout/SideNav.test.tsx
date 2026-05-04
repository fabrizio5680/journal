import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { format } from 'date-fns'

import { FocusModeProvider } from '@/context/FocusModeContext'
import { SearchProvider } from '@/context/SearchContext'

// --- Firebase auth mock ---
let authCallback: ((user: { uid: string } | null) => void) | null = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: (user: { uid: string } | null) => void) => {
    authCallback = cb
    return vi.fn()
  },
}))

// --- Firebase firestore mock (required by useStreak used inside SideNav) ---
vi.mock('firebase/firestore', () => ({
  collection: vi.fn().mockReturnValue({ id: 'mock-collection' }),
  query: vi.fn().mockReturnValue({ id: 'mock-query' }),
  where: vi.fn().mockReturnValue({ id: 'mock-where' }),
  orderBy: vi.fn().mockReturnValue({ id: 'mock-order' }),
  limit: vi.fn().mockReturnValue({ id: 'mock-limit' }),
  onSnapshot: vi.fn(() => vi.fn()),
}))

import SideNav from './SideNav'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <FocusModeProvider>
        <SearchProvider>{children}</SearchProvider>
      </FocusModeProvider>
    </BrowserRouter>
  )
}

describe('SideNav', () => {
  it('displays today\'s date using useToday (not a stale module-level value)', () => {
    const FAKE_NOW = new Date('2026-03-20T10:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FAKE_NOW)

    render(
      <Wrapper>
        <SideNav />
      </Wrapper>,
    )

    // The SideNav renders day-of-week, month+day, and year from useToday
    expect(screen.getByText(format(FAKE_NOW, 'EEEE'))).toBeInTheDocument()
    expect(screen.getByText(format(FAKE_NOW, 'MMMM d'))).toBeInTheDocument()
    expect(screen.getByText(format(FAKE_NOW, 'yyyy'))).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('updates displayed date when visibilitychange fires after midnight', () => {
    const DAY_ONE = new Date('2026-03-20T23:59:00Z')
    const DAY_TWO = new Date('2026-03-21T00:01:00Z')

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(DAY_ONE)

    render(
      <Wrapper>
        <SideNav />
      </Wrapper>,
    )

    expect(screen.getByText(format(DAY_ONE, 'MMMM d'))).toBeInTheDocument()

    // Simulate the app being brought back to foreground the next day
    vi.setSystemTime(DAY_TWO)

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByText(format(DAY_TWO, 'MMMM d'))).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('renders Today button that triggers navigation', () => {
    render(
      <Wrapper>
        <SideNav />
      </Wrapper>,
    )

    expect(screen.getByRole('button', { name: /today/i })).toBeInTheDocument()
  })

  it('renders navigation links for Journal, History, Insights, Settings', () => {
    render(
      <Wrapper>
        <SideNav />
      </Wrapper>,
    )

    expect(screen.getByRole('link', { name: /journal/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /history/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /insights/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('does not render user avatar section when not authenticated', () => {
    render(
      <Wrapper>
        <SideNav />
      </Wrapper>,
    )

    act(() => {
      authCallback?.(null)
    })

    // No user photo or display name should be visible
    expect(screen.queryByRole('img', { name: /user/i })).not.toBeInTheDocument()
  })
})
