import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import MoodPicker from './MoodPicker'

describe('MoodPicker', () => {
  it('renders 5 mood chips', () => {
    render(<MoodPicker value={null} onChange={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('clicking a mood chip calls onChange with correct value and label', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('🙂 Calm'))
    expect(onChange).toHaveBeenCalledWith(3, 'Calm')
  })

  it('clicking the already-selected mood calls onChange with (null, null)', () => {
    const onChange = vi.fn()
    render(<MoodPicker value={3} onChange={onChange} />)
    fireEvent.click(screen.getByText('🙂 Calm'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('selected chip has active styles', () => {
    render(<MoodPicker value={3} onChange={vi.fn()} />)
    const selectedButton = screen.getByText('🙂 Calm')
    expect(selectedButton).toHaveClass('bg-primary-container')
  })
})
