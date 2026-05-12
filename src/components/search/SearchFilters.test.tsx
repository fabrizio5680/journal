import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import SearchFilters from './SearchFilters'

import { MOODS } from '@/lib/moods'

const defaultProps = {
  dateFrom: '',
  dateTo: '',
  onDateChange: vi.fn(),
  selectedMoods: [] as string[],
  onToggleMood: vi.fn(),
  availableTags: [] as string[],
  selectedTags: [] as string[],
  onToggleTag: vi.fn(),
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

describe('SearchFilters — TagFilter', () => {
  it('renders no tag chips when availableTags is empty', () => {
    render(<SearchFilters {...defaultProps} availableTags={[]} />)
    // TagFilter returns null when no tags — no tag buttons should exist
    expect(screen.queryByRole('button', { name: /filter by #/i })).toBeNull()
  })

  it('renders tag chips with # prefix for each available tag', () => {
    render(<SearchFilters {...defaultProps} availableTags={['faith', 'morning', 'work']} />)

    expect(screen.getByRole('button', { name: 'Filter by #faith' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filter by #morning' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filter by #work' })).toBeTruthy()
  })

  it('selected tags render with active (bg-primary) styling', () => {
    render(
      <SearchFilters
        {...defaultProps}
        availableTags={['faith', 'morning']}
        selectedTags={['faith']}
      />,
    )

    const faithBtn = screen.getByRole('button', { name: 'Filter by #faith' })
    const morningBtn = screen.getByRole('button', { name: 'Filter by #morning' })

    expect(faithBtn.className).toContain('bg-primary')
    expect(morningBtn.className).not.toContain('bg-primary')
  })

  it('unselected tags do not have active styling', () => {
    render(<SearchFilters {...defaultProps} availableTags={['faith', 'work']} selectedTags={[]} />)

    const faithBtn = screen.getByRole('button', { name: 'Filter by #faith' })
    expect(faithBtn.className).not.toContain('bg-primary')
  })

  it('clicking a tag chip calls onToggleTag with the raw tag (no # prefix)', async () => {
    const onToggleTag = vi.fn()
    render(
      <SearchFilters
        {...defaultProps}
        availableTags={['faith', 'morning']}
        onToggleTag={onToggleTag}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Filter by #faith' }))

    expect(onToggleTag).toHaveBeenCalledOnce()
    expect(onToggleTag).toHaveBeenCalledWith('faith')
    // Verify no '#' prefix is passed to the handler
    expect(onToggleTag.mock.calls[0][0]).toBe('faith')
  })

  it('multiple tags can be selected independently', () => {
    render(
      <SearchFilters
        {...defaultProps}
        availableTags={['faith', 'morning', 'work']}
        selectedTags={['faith', 'work']}
      />,
    )

    const faithBtn = screen.getByRole('button', { name: 'Filter by #faith' })
    const morningBtn = screen.getByRole('button', { name: 'Filter by #morning' })
    const workBtn = screen.getByRole('button', { name: 'Filter by #work' })

    expect(faithBtn.className).toContain('bg-primary')
    expect(morningBtn.className).not.toContain('bg-primary')
    expect(workBtn.className).toContain('bg-primary')
  })
})
