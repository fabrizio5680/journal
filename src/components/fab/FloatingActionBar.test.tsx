import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import FloatingActionBar from './FloatingActionBar'

function renderFAB(overrides = {}) {
  const props = {
    wordCount: 42,
    fontSize: 'medium' as const,
    onFontSizeChange: vi.fn(),
    ...overrides,
  }
  return { ...render(<FloatingActionBar {...props} />), props }
}

describe('FloatingActionBar — font size cycle', () => {
  it('renders cycle button when onFontSizeChange is provided', () => {
    renderFAB()
    expect(screen.getByRole('button', { name: /text size: medium/i })).toBeInTheDocument()
  })

  it('does not render cycle button when onFontSizeChange is omitted', () => {
    render(<FloatingActionBar wordCount={0} />)
    expect(screen.queryByRole('button', { name: /text size/i })).not.toBeInTheDocument()
  })

  it('clicking cycle button calls onFontSizeChange with next size', async () => {
    const { props } = renderFAB({ fontSize: 'small' })
    await userEvent.click(screen.getByRole('button', { name: /text size: small/i }))
    expect(props.onFontSizeChange).toHaveBeenCalledWith('medium')
  })

  it('wraps from large back to small', async () => {
    const { props } = renderFAB({ fontSize: 'large' })
    await userEvent.click(screen.getByRole('button', { name: /text size: large/i }))
    expect(props.onFontSizeChange).toHaveBeenCalledWith('small')
  })

  it('cycles medium → large', async () => {
    const { props } = renderFAB({ fontSize: 'medium' })
    await userEvent.click(screen.getByRole('button', { name: /text size: medium/i }))
    expect(props.onFontSizeChange).toHaveBeenCalledWith('large')
  })
})

describe('FloatingActionBar — word count', () => {
  it('shows plural word count', () => {
    renderFAB({ wordCount: 42 })
    expect(screen.getByText('42 words')).toBeInTheDocument()
  })

  it('shows singular for count of 1', () => {
    renderFAB({ wordCount: 1 })
    expect(screen.getByText('1 word')).toBeInTheDocument()
  })

  it('shows zero words', () => {
    renderFAB({ wordCount: 0 })
    expect(screen.getByText('0 words')).toBeInTheDocument()
  })
})

describe('FloatingActionBar — dictation', () => {
  it('renders dictate button when isSupported', () => {
    renderFAB({
      dictation: {
        isSupported: true,
        state: 'idle',
        errorMessage: null,
        onStart: vi.fn(),
        onStop: vi.fn(),
      },
    })
    expect(screen.getByRole('button', { name: /dictate/i })).toBeInTheDocument()
  })

  it('does not render dictate button when not supported', () => {
    renderFAB({
      dictation: {
        isSupported: false,
        state: 'idle',
        errorMessage: null,
        onStart: vi.fn(),
        onStop: vi.fn(),
      },
    })
    expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument()
  })

  it('shows stop label when listening', () => {
    renderFAB({
      dictation: {
        isSupported: true,
        state: 'listening',
        errorMessage: null,
        onStart: vi.fn(),
        onStop: vi.fn(),
      },
    })
    expect(screen.getByRole('button', { name: /stop dictation/i })).toBeInTheDocument()
  })

  it('calls onStop when listening and button is clicked', async () => {
    const onStop = vi.fn()
    renderFAB({
      dictation: {
        isSupported: true,
        state: 'listening',
        errorMessage: null,
        onStart: vi.fn(),
        onStop,
      },
    })
    await userEvent.click(screen.getByRole('button', { name: /stop dictation/i }))
    expect(onStop).toHaveBeenCalled()
  })
})
