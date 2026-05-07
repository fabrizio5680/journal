import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
  selectedMoods: [] as string[],
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

  it('selected mood buttons have active styles (string label API)', () => {
    render(<SearchFilters {...defaultProps} selectedMoods={['Sorrowful', 'Peaceful']} />)
    const sorrowful = screen.getByRole('button', { name: 'Sorrowful' })
    const peaceful = screen.getByRole('button', { name: 'Peaceful' })
    expect(sorrowful.className).toContain('bg-primary')
    expect(peaceful.className).toContain('bg-primary')
  })

  it('unselected mood buttons do not have primary active styles', () => {
    render(<SearchFilters {...defaultProps} selectedMoods={[]} />)
    const hopeful = screen.getByRole('button', { name: 'Hopeful' })
    expect(hopeful.className).not.toContain('bg-primary text-on-primary')
  })

  it('clicking a mood button calls onToggleMood with its label string', async () => {
    const onToggleMood = vi.fn()
    render(<SearchFilters {...defaultProps} onToggleMood={onToggleMood} />)

    await userEvent.click(screen.getByRole('button', { name: 'Hopeful' }))

    expect(onToggleMood).toHaveBeenCalledOnce()
    expect(onToggleMood).toHaveBeenCalledWith('Hopeful')
    // Ensure it is a string label, not a numeric value
    expect(typeof onToggleMood.mock.calls[0][0]).toBe('string')
  })

  it('passes label string (not numeric value) when clicking value=1 mood', async () => {
    const onToggleMood = vi.fn()
    render(<SearchFilters {...defaultProps} onToggleMood={onToggleMood} />)

    await userEvent.click(screen.getByRole('button', { name: 'Sorrowful' }))

    expect(onToggleMood).toHaveBeenCalledWith('Sorrowful')
    expect(onToggleMood).not.toHaveBeenCalledWith(1)
  })

  it('two moods sharing the same numeric value can be selected independently', () => {
    // Sorrowful and Weary both have value=1 but distinct labels.
    // Selecting only 'Sorrowful' must not style 'Weary' as active.
    render(<SearchFilters {...defaultProps} selectedMoods={['Sorrowful']} />)

    const sorrowful = screen.getByRole('button', { name: 'Sorrowful' })
    const weary = screen.getByRole('button', { name: 'Weary' })

    expect(sorrowful.className).toContain('bg-primary')
    expect(weary.className).not.toContain('bg-primary text-on-primary')
  })

  it('selecting Weary independently does not activate Sorrowful', () => {
    render(<SearchFilters {...defaultProps} selectedMoods={['Weary']} />)

    const sorrowful = screen.getByRole('button', { name: 'Sorrowful' })
    const weary = screen.getByRole('button', { name: 'Weary' })

    expect(weary.className).toContain('bg-primary')
    expect(sorrowful.className).not.toContain('bg-primary text-on-primary')
  })

  it('both value=1 moods can be independently selected at the same time', () => {
    render(<SearchFilters {...defaultProps} selectedMoods={['Sorrowful', 'Weary']} />)

    const sorrowful = screen.getByRole('button', { name: 'Sorrowful' })
    const weary = screen.getByRole('button', { name: 'Weary' })

    expect(sorrowful.className).toContain('bg-primary')
    expect(weary.className).toContain('bg-primary')
  })

  it('deselecting a mood removes only that label — other selected moods stay active', async () => {
    const onToggleMood = vi.fn()
    // 'Joyful' and 'Overflowing' are both selected; clicking 'Joyful' should call
    // onToggleMood('Joyful') only — the parent handles the actual state update.
    render(
      <SearchFilters
        {...defaultProps}
        selectedMoods={['Joyful', 'Overflowing']}
        onToggleMood={onToggleMood}
      />,
    )

    // Both should show as active before the click
    expect(screen.getByRole('button', { name: 'Joyful' }).className).toContain('bg-primary')
    expect(screen.getByRole('button', { name: 'Overflowing' }).className).toContain('bg-primary')

    await userEvent.click(screen.getByRole('button', { name: 'Joyful' }))

    // onToggleMood is called with the specific label being deselected
    expect(onToggleMood).toHaveBeenCalledWith('Joyful')
    expect(onToggleMood).not.toHaveBeenCalledWith('Overflowing')
  })

  it('unselected mood does not carry bg-primary class', () => {
    render(<SearchFilters {...defaultProps} selectedMoods={['Joyful']} />)

    // 'Anxious' is not selected
    const anxious = screen.getByRole('button', { name: 'Anxious' })
    expect(anxious.className).not.toContain('bg-primary')
  })
})
