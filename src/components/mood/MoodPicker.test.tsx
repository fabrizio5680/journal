import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import MoodPicker from './MoodPicker'

describe('MoodPicker', () => {
  it('renders 10 mood chips', () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(10)
  })

  it('clicking a mood chip calls onChange with correct value and label', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} label={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('🌱 Hopeful'))
    expect(onChange).toHaveBeenCalledWith(3, 'Hopeful')
  })

  it('clicking the already-selected mood calls onChange with (null, null)', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={3} label="Hopeful" onChange={onChange} />)
    fireEvent.click(screen.getByText('🌱 Hopeful'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('selected chip has active styles', () => {
    render(<MoodPicker value={3} label="Hopeful" onChange={vi.fn()} />)
    const selectedButton = screen.getByText('🌱 Hopeful')
    expect(selectedButton).toHaveClass('bg-primary-container')
  })

  // --- Pair-member selection tests ---

  it('onChange receives correct (value, label) for first pair member — Sorrowful', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} label={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('😢 Sorrowful'))
    expect(onChange).toHaveBeenCalledWith(1, 'Sorrowful')
  })

  it('onChange receives correct (value, label) for second pair member — Weary', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} label={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('😮‍💨 Weary'))
    expect(onChange).toHaveBeenCalledWith(1, 'Weary')
  })

  it('onChange receives correct (value, label) for second pair member — Grateful (value=4)', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} label={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('🙏 Grateful'))
    expect(onChange).toHaveBeenCalledWith(4, 'Grateful')
  })

  // --- Label-based selection (new behavior after Phase 2 fix) ---

  it('when value=1 and label="Sorrowful", only Sorrowful chip is highlighted (not Weary)', () => {
    render(<MoodPicker value={1} label="Sorrowful" onChange={vi.fn()} />)
    const sorrowful = screen.getByText('😢 Sorrowful')
    const weary = screen.getByText('😮‍💨 Weary')
    expect(sorrowful).toHaveClass('bg-primary-container')
    expect(weary).not.toHaveClass('bg-primary-container')
  })

  it('when value=1 and label="Weary", only Weary chip is highlighted (not Sorrowful)', () => {
    render(<MoodPicker value={1} label="Weary" onChange={vi.fn()} />)
    const sorrowful = screen.getByText('😢 Sorrowful')
    const weary = screen.getByText('😮‍💨 Weary')
    expect(weary).toHaveClass('bg-primary-container')
    expect(sorrowful).not.toHaveClass('bg-primary-container')
  })

  it('when label=null and value=1, both pair chips are highlighted (backward compat for old entries)', () => {
    render(<MoodPicker value={1} label={null} onChange={vi.fn()} />)
    const sorrowful = screen.getByText('😢 Sorrowful')
    const weary = screen.getByText('😮‍💨 Weary')
    expect(sorrowful).toHaveClass('bg-primary-container')
    expect(weary).toHaveClass('bg-primary-container')
  })

  it('clicking Weary when label="Sorrowful" selects Weary (does not deselect)', () => {
    // With label="Sorrowful", Weary is NOT selected — clicking it should call onChange(1, "Weary")
    const onChange = vi.fn()
    render(<MoodPicker value={1} label="Sorrowful" onChange={onChange} />)
    fireEvent.click(screen.getByText('😮‍💨 Weary'))
    expect(onChange).toHaveBeenCalledWith(1, 'Weary')
  })

  it('clicking the already-selected Sorrowful (via label) deselects it', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={1} label="Sorrowful" onChange={onChange} />)
    fireEvent.click(screen.getByText('😢 Sorrowful'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('clicking the second pair member when its value is already selected (no label) calls onChange with (null, null)', () => {
    // When value=1 and label=null (old entry), both are "selected"; clicking Weary deselects.
    const onChange = vi.fn()
    render(<MoodPicker value={1} label={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('😮‍💨 Weary'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('deselecting a mood by clicking it again calls onChange with (null, null)', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={4} label="Peaceful" onChange={onChange} />)
    // Peaceful (first member of value=4 pair) — clicking deselects
    fireEvent.click(screen.getByText('😌 Peaceful'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('unselected mood chips do not have active styles', () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} />)
    const button = screen.getByText('😢 Sorrowful')
    expect(button).not.toHaveClass('bg-primary-container')
  })

  // --- Phase 2: horizontal scrollable row layout ---

  it('all mood buttons render inside a single flex container (not a grid)', () => {
    const { container } = render(<MoodPicker value={null} label={null} onChange={vi.fn()} />)
    // The wrapper div should have flex and flex-nowrap
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('flex')
    expect(wrapper).toHaveClass('flex-nowrap')
  })

  it('container has overflow-x-auto class for horizontal scrolling', () => {
    const { container } = render(<MoodPicker value={null} label={null} onChange={vi.fn()} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('overflow-x-auto')
  })

  it('each mood button has shrink-0 class to prevent squishing', () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(10)
    buttons.forEach((btn) => {
      expect(btn).toHaveClass('shrink-0')
    })
  })
})

// ── Dropdown variant ──────────────────────────────────────────────────────────

describe('MoodPicker — variant="dropdown"', () => {
  it('does NOT render 10 pill buttons when variant is dropdown', () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} variant="dropdown" />)
    // Only the trigger button should be visible (listbox is closed)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('renders a trigger button (not pill list)', () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} variant="dropdown" />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows placeholder "How are you feeling?" when no mood selected', () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} variant="dropdown" />)
    expect(screen.getByText('How are you feeling?')).toBeInTheDocument()
  })

  it('shows emoji+label when mood is selected — "😌 Peaceful"', () => {
    render(<MoodPicker value={4} label="Peaceful" onChange={vi.fn()} variant="dropdown" />)
    expect(screen.getByText('😌 Peaceful')).toBeInTheDocument()
    expect(screen.queryByText('How are you feeling?')).not.toBeInTheDocument()
  })

  it('clicking trigger opens the listbox', async () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} variant="dropdown" />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('"— No mood" option is present in open list', async () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} variant="dropdown" />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText('— No mood')).toBeInTheDocument()
  })

  it('clicking "— No mood" calls onChange(null, null)', async () => {
    const onChange = vi.fn()
    render(<MoodPicker value={3} label="Hopeful" onChange={onChange} variant="dropdown" />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.click(screen.getByText('— No mood'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('clicking a mood option calls onChange with correct value and label', async () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} label={null} onChange={onChange} variant="dropdown" />)
    await userEvent.click(screen.getByRole('button'))
    // Find the option in the open listbox
    const options = screen.getAllByRole('option')
    const hopefulOption = options.find((o) => o.textContent === '🌱 Hopeful')
    expect(hopefulOption).toBeDefined()
    await userEvent.click(hopefulOption!)
    expect(onChange).toHaveBeenCalledWith(3, 'Hopeful')
  })

  it('pressing Escape closes the listbox', async () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} variant="dropdown" />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('clicking outside closes the listbox', async () => {
    render(
      <div>
        <MoodPicker value={null} label={null} onChange={vi.fn()} variant="dropdown" />
        <div data-testid="outside">outside</div>
      </div>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('trigger has aria-haspopup="listbox"', () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} variant="dropdown" />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-haspopup', 'listbox')
  })

  it('selected option has aria-selected="true" in open list', async () => {
    render(<MoodPicker value={4} label="Peaceful" onChange={vi.fn()} variant="dropdown" />)
    await userEvent.click(screen.getByRole('button'))
    const selectedOption = screen
      .getAllByRole('option')
      .find((o) => o.textContent === '😌 Peaceful')
    expect(selectedOption).toHaveAttribute('aria-selected', 'true')
  })

  it('all 10 moods are present in the open listbox', async () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} variant="dropdown" />)
    await userEvent.click(screen.getByRole('button'))
    // 10 mood options + 1 "None" option = 11 total listbox items
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(11)
  })

  it('listbox closes after selecting a mood', async () => {
    render(<MoodPicker value={null} label={null} onChange={vi.fn()} variant="dropdown" />)
    await userEvent.click(screen.getByRole('button'))
    const options = screen.getAllByRole('option')
    const hopefulOption = options.find((o) => o.textContent === '🌱 Hopeful')
    await userEvent.click(hopefulOption!)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
