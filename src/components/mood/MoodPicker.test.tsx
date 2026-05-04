import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import MoodPicker from './MoodPicker'

describe('MoodPicker', () => {
  it('renders 10 mood chips', () => {
    render(<MoodPicker value={null} onChange={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(10)
  })

  it('clicking a mood chip calls onChange with correct value and label', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('🌱 Hopeful'))
    expect(onChange).toHaveBeenCalledWith(3, 'Hopeful')
  })

  it('clicking the already-selected mood calls onChange with (null, null)', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={3} onChange={onChange} />)
    fireEvent.click(screen.getByText('🌱 Hopeful'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('selected chip has active styles', () => {
    render(<MoodPicker value={3} onChange={vi.fn()} />)
    const selectedButton = screen.getByText('🌱 Hopeful')
    expect(selectedButton).toHaveClass('bg-primary-container')
  })

  // --- Pair-member selection tests ---

  it('onChange receives correct (value, label) for first pair member — Sorrowful', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('😢 Sorrowful'))
    expect(onChange).toHaveBeenCalledWith(1, 'Sorrowful')
  })

  it('onChange receives correct (value, label) for second pair member — Weary', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('😮‍💨 Weary'))
    expect(onChange).toHaveBeenCalledWith(1, 'Weary')
  })

  it('onChange receives correct (value, label) for second pair member — Grateful (value=4)', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('🙏 Grateful'))
    expect(onChange).toHaveBeenCalledWith(4, 'Grateful')
  })

  it('both moods in a pair show as selected when their shared numeric value is active', () => {
    render(<MoodPicker value={1} onChange={vi.fn()} />)
    const sorrowful = screen.getByText('😢 Sorrowful')
    const weary = screen.getByText('😮‍💨 Weary')
    expect(sorrowful).toHaveClass('bg-primary-container')
    expect(weary).toHaveClass('bg-primary-container')
  })

  it('clicking the second pair member when its value is already selected calls onChange with (null, null)', () => {
    // When value=1 is active, both Sorrowful and Weary are "selected" (isSelected = value === mood.value).
    // Clicking "Weary" (the other pair member) triggers deselect since isSelected is true.
    const onChange = vi.fn()
    render(<MoodPicker value={1} onChange={onChange} />)
    fireEvent.click(screen.getByText('😮‍💨 Weary'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('switching between pair members requires deselect then re-select', () => {
    // Step 1: start with Sorrowful selected (value=1)
    // Step 2: click Weary (also value=1) — deselects because both share value=1
    // Step 3: clicking Weary again (now value=null) selects Weary with label
    const onChange = vi.fn()
    const { rerender } = render(<MoodPicker value={1} onChange={onChange} />)

    // Clicking Weary while value=1 → deselects (both share value=1, so isSelected=true)
    fireEvent.click(screen.getByText('😮‍💨 Weary'))
    expect(onChange).toHaveBeenNthCalledWith(1, null, null)

    // After deselect, simulate parent updating value to null
    rerender(<MoodPicker value={null} onChange={onChange} />)

    // Now clicking Weary selects it with its own label
    fireEvent.click(screen.getByText('😮‍💨 Weary'))
    expect(onChange).toHaveBeenNthCalledWith(2, 1, 'Weary')
  })

  it('deselecting a mood by clicking it again calls onChange with (null, null)', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={4} onChange={onChange} />)
    // Peaceful (first member of value=4 pair) — clicking deselects
    fireEvent.click(screen.getByText('😌 Peaceful'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('unselected mood chips do not have active styles', () => {
    render(<MoodPicker value={null} onChange={vi.fn()} />)
    const button = screen.getByText('😢 Sorrowful')
    expect(button).not.toHaveClass('bg-primary-container')
  })
})
