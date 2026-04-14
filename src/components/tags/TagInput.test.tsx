import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import TagInput from './TagInput'

describe('TagInput', () => {
  const defaultProps = {
    tags: ['gratitude'],
    vocabulary: ['gratitude', 'morning', 'prayer'],
    onChange: vi.fn(),
  }

  it('renders existing tags as chips with remove buttons', () => {
    render(<TagInput {...defaultProps} />)
    expect(screen.getByText('gratitude')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove gratitude')).toBeInTheDocument()
  })

  it('typing filters vocabulary suggestions', async () => {
    render(<TagInput {...defaultProps} tags={[]} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'mor')
    expect(screen.getByText('morning')).toBeInTheDocument()
    expect(screen.queryByText('prayer')).not.toBeInTheDocument()
  })

  it('clicking a suggestion calls onChange with tag added', async () => {
    const onChange = vi.fn()
    render(<TagInput {...defaultProps} tags={[]} onChange={onChange} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'mor')
    fireEvent.pointerDown(screen.getByText('morning'))
    expect(onChange).toHaveBeenCalledWith(['morning'])
  })

  it('pressing Enter with new value creates tag and calls onChange', async () => {
    const onChange = vi.fn()
    render(<TagInput {...defaultProps} tags={[]} onChange={onChange} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'newfaith{Enter}')
    expect(onChange).toHaveBeenCalledWith(['newfaith'])
  })

  it('clicking × on a chip removes it and calls onChange', () => {
    const onChange = vi.fn()
    render(<TagInput {...defaultProps} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Remove gratitude'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("shows 'Create tag: {value}' when input doesn't match vocabulary", async () => {
    render(<TagInput {...defaultProps} tags={[]} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'sunset')
    expect(screen.getByText('Create tag: sunset')).toBeInTheDocument()
  })
})
