import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import FloatingActionBar from './FloatingActionBar'

function renderFAB(overrides = {}) {
  const props = {
    wordCount: 42,
    isDirty: false,
    onSave: vi.fn(),
    fontSize: 'medium' as const,
    onFontSizeChange: vi.fn(),
    ...overrides,
  }
  return { ...render(<FloatingActionBar {...props} />), props }
}

describe('FloatingActionBar — font size controls', () => {
  it('renders A− and A+ buttons when onFontSizeChange is provided', () => {
    renderFAB()
    expect(screen.getByRole('button', { name: /decrease text size/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /increase text size/i })).toBeInTheDocument()
  })

  it('does not render font size buttons when onFontSizeChange is omitted', () => {
    render(<FloatingActionBar wordCount={0} isDirty={false} onSave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /decrease text size/i })).not.toBeInTheDocument()
  })

  it('A− is disabled at minimum size (small)', () => {
    renderFAB({ fontSize: 'small' })
    expect(screen.getByRole('button', { name: /decrease text size/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /increase text size/i })).toBeEnabled()
  })

  it('A+ is disabled at maximum size (large)', () => {
    renderFAB({ fontSize: 'large' })
    expect(screen.getByRole('button', { name: /increase text size/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /decrease text size/i })).toBeEnabled()
  })

  it('both buttons are enabled at medium size', () => {
    renderFAB({ fontSize: 'medium' })
    expect(screen.getByRole('button', { name: /decrease text size/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /increase text size/i })).toBeEnabled()
  })

  it('clicking A+ calls onFontSizeChange with next size', async () => {
    const { props } = renderFAB({ fontSize: 'small' })
    await userEvent.click(screen.getByRole('button', { name: /increase text size/i }))
    expect(props.onFontSizeChange).toHaveBeenCalledWith('medium')
  })

  it('clicking A− calls onFontSizeChange with previous size', async () => {
    const { props } = renderFAB({ fontSize: 'large' })
    await userEvent.click(screen.getByRole('button', { name: /decrease text size/i }))
    expect(props.onFontSizeChange).toHaveBeenCalledWith('medium')
  })

  it('clicking disabled A− does not call onFontSizeChange', async () => {
    const { props } = renderFAB({ fontSize: 'small' })
    await userEvent.click(screen.getByRole('button', { name: /decrease text size/i }))
    expect(props.onFontSizeChange).not.toHaveBeenCalled()
  })
})
