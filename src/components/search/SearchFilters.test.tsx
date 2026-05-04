import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import SearchFilters from './SearchFilters'

import { MOODS } from '@/lib/moods'

// TagFilter inside SearchFilters uses useRefinementList which requires Algolia context.
// We mock react-instantsearch at the module level so the hook returns an empty list,
// letting us render SearchFilters without a real Algolia provider.
vi.mock('react-instantsearch', () => ({
  useRefinementList: () => ({ items: [], refine: vi.fn() }),
}))

const defaultProps = {
  dateFrom: '',
  dateTo: '',
  onDateChange: vi.fn(),
  selectedMoods: [],
  onToggleMood: vi.fn(),
}

describe('SearchFilters — MoodFilter', () => {
  it('renders all 10 mood buttons', () => {
    render(<SearchFilters {...defaultProps} />)
    MOODS.forEach((m) => {
      expect(screen.getByRole('button', { name: m.label })).toBeTruthy()
    })
  })

  it('renders both pair members for value=1 (Sorrowful and Weary)', () => {
    render(<SearchFilters {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Sorrowful' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Weary' })).toBeTruthy()
  })

  it('renders both pair members for value=4 (Peaceful and Grateful)', () => {
    render(<SearchFilters {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Peaceful' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Grateful' })).toBeTruthy()
  })

  it('selected mood buttons have active styles', () => {
    render(<SearchFilters {...defaultProps} selectedMoods={[1, 4]} />)
    // value=1 buttons (Sorrowful, Weary) should be styled as selected
    const sorrowful = screen.getByRole('button', { name: 'Sorrowful' })
    const weary = screen.getByRole('button', { name: 'Weary' })
    expect(sorrowful.className).toContain('bg-primary')
    expect(weary.className).toContain('bg-primary')
    // value=4 (Peaceful, Grateful) also selected
    const peaceful = screen.getByRole('button', { name: 'Peaceful' })
    expect(peaceful.className).toContain('bg-primary')
  })

  it('unselected mood buttons do not have primary active styles', () => {
    render(<SearchFilters {...defaultProps} selectedMoods={[]} />)
    const hopeful = screen.getByRole('button', { name: 'Hopeful' })
    expect(hopeful.className).not.toContain('bg-primary text-on-primary')
  })
})
