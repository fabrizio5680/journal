import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import MiniCalendar from './MiniCalendar'

// Pin date to a known month for deterministic tests
// April 2026: April 1 is a Wednesday (day index 3)
const FIXED_DATE = new Date(2026, 3, 14) // April 14 2026

beforeEach(() => {
  // Only fake Date, not setTimeout/Promise — so userEvent async operations still work
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXED_DATE)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MiniCalendar', () => {
  it('renders the current month and year in the header', () => {
    renderWithProviders(<MiniCalendar onDateSelect={vi.fn()} />)
    expect(screen.getByText('April 2026')).toBeTruthy()
  })

  it('renders correct number of day cells for April 2026', () => {
    renderWithProviders(<MiniCalendar onDateSelect={vi.fn()} />)
    // April 2026: starts Wed (3), ends Thu (4)
    // Grid: Mar 29(Sun)–May 2(Sat) = 35 cells
    const cells = screen.getAllByRole('button', { name: /^\w+ \d+, \d{4}$/ })
    expect(cells.length).toBe(35)
  })

  it("applies today styles to today's date", () => {
    renderWithProviders(<MiniCalendar onDateSelect={vi.fn()} />)
    const todayButton = screen.getByRole('button', { name: 'April 14, 2026' })
    expect(todayButton.className).toContain('bg-primary-container')
  })

  it('shows entry dot indicators for dates with entries', () => {
    const entryDates = new Set(['2026-04-05', '2026-04-14'])
    renderWithProviders(<MiniCalendar onDateSelect={vi.fn()} entryDates={entryDates} />)
    // Each date with an entry should have a dot — rendered as a child span
    const apr5 = screen.getByRole('button', { name: 'April 5, 2026' })
    expect(apr5.querySelector('.bg-primary.rounded-full')).toBeTruthy()
  })

  it('calls onDateSelect with correct YYYY-MM-DD when a date is clicked', async () => {
    const user = userEvent.setup()
    const onDateSelect = vi.fn()
    renderWithProviders(<MiniCalendar onDateSelect={onDateSelect} />)

    await user.click(screen.getByRole('button', { name: 'April 10, 2026' }))
    expect(onDateSelect).toHaveBeenCalledWith('2026-04-10')
  })

  it('advances to next month when next chevron is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MiniCalendar onDateSelect={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('May 2026')).toBeTruthy()
  })

  it('goes back to previous month when prev chevron is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MiniCalendar onDateSelect={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('March 2026')).toBeTruthy()
  })

  it('calls onMonthChange with correct year/month when navigating', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    renderWithProviders(<MiniCalendar onDateSelect={vi.fn()} onMonthChange={onMonthChange} />)

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 5)
  })

  it('dims out-of-month dates', () => {
    renderWithProviders(<MiniCalendar onDateSelect={vi.fn()} />)
    // March 29 is a leading out-of-month day in April 2026 grid
    const outOfMonth = screen.getByRole('button', { name: 'March 29, 2026' })
    expect(outOfMonth.className).toContain('opacity-30')
  })

  it('applies selected styles to the selectedDate', () => {
    renderWithProviders(<MiniCalendar onDateSelect={vi.fn()} selectedDate="2026-04-07" />)
    const selected = screen.getByRole('button', { name: 'April 7, 2026' })
    expect(selected.className).toContain('bg-primary')
  })

  it('does not call onDateSelect when clicking an out-of-month date', async () => {
    const user = userEvent.setup()
    const onDateSelect = vi.fn()
    renderWithProviders(<MiniCalendar onDateSelect={onDateSelect} />)

    // March 29 is an out-of-month leading day
    const outOfMonth = screen.getByRole('button', { name: 'March 29, 2026' })
    await user.click(outOfMonth)
    expect(onDateSelect).not.toHaveBeenCalled()
  })
})
