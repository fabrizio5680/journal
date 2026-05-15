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
    expect(screen.getByText('#gratitude')).toBeInTheDocument()
    // aria-label is built from children which renders as "#" + tag text nodes
    expect(screen.getByLabelText('Remove #,gratitude')).toBeInTheDocument()
  })

  it('selected tag chips display # prefix', () => {
    render(<TagInput {...defaultProps} tags={['work', 'faith']} />)
    expect(screen.getByText('#work')).toBeInTheDocument()
    expect(screen.getByText('#faith')).toBeInTheDocument()
  })

  it('typing filters vocabulary suggestions', async () => {
    render(<TagInput {...defaultProps} tags={[]} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'mor')
    expect(screen.getByText('#morning')).toBeInTheDocument()
    expect(screen.queryByText('#prayer')).not.toBeInTheDocument()
  })

  it('dropdown suggestions show # prefix', async () => {
    render(<TagInput {...defaultProps} tags={[]} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'pray')
    expect(screen.getByText('#prayer')).toBeInTheDocument()
  })

  it('typing #tag in input adds tag without # in stored value', async () => {
    const onChange = vi.fn()
    render(<TagInput {...defaultProps} tags={[]} onChange={onChange} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, '#work{Enter}')
    expect(onChange).toHaveBeenCalledWith(['work'])
  })

  it('clicking a suggestion calls onChange with tag added', async () => {
    const onChange = vi.fn()
    render(<TagInput {...defaultProps} tags={[]} onChange={onChange} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'mor')
    fireEvent.pointerDown(screen.getByText('#morning'))
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
    // aria-label is built from children: "#" + tag text nodes joined with comma
    fireEvent.click(screen.getByLabelText('Remove #,gratitude'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("shows 'Create tag: #{value}' when input doesn't match vocabulary", async () => {
    render(<TagInput {...defaultProps} tags={[]} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'sunset')
    expect(screen.getByText('Create tag: #sunset')).toBeInTheDocument()
  })

  it('input has spellCheck=true (always-on)', () => {
    render(<TagInput {...defaultProps} tags={[]} />)
    const input = screen.getByPlaceholderText('Add tag…')
    // React maps spellCheck={true} to the "spellcheck" HTML attribute as "true"
    expect(input.getAttribute('spellcheck')).toBe('true')
  })

  // --- Phase 2: dropdown opens upward ---

  it('dropdown container has bottom-full class (opens upward)', async () => {
    render(<TagInput {...defaultProps} tags={[]} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'mor')

    // Dropdown should be visible
    expect(screen.getByText('#morning')).toBeInTheDocument()

    // Find the dropdown container — it wraps the suggestion buttons
    const suggestion = screen.getByText('#morning')
    const dropdown = suggestion.closest('div')
    expect(dropdown).toHaveClass('bottom-full')
  })

  it('dropdown container does not have mt-1 class (does not open downward)', async () => {
    render(<TagInput {...defaultProps} tags={[]} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'mor')

    expect(screen.getByText('#morning')).toBeInTheDocument()

    const suggestion = screen.getByText('#morning')
    const dropdown = suggestion.closest('div')
    expect(dropdown).not.toHaveClass('mt-1')
  })

  it('dropdown has mb-1 class for upward spacing gap', async () => {
    render(<TagInput {...defaultProps} tags={[]} />)
    const input = screen.getByPlaceholderText('Add tag…')
    await userEvent.type(input, 'mor')

    expect(screen.getByText('#morning')).toBeInTheDocument()

    const suggestion = screen.getByText('#morning')
    const dropdown = suggestion.closest('div')
    expect(dropdown).toHaveClass('mb-1')
  })
})
