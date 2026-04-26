import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ScriptureRefInput from './ScriptureRefInput'

import type { ScriptureRef } from '@/types'

// ---- fetch mock helpers ----

function mockFetchSuccess(reference: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data: { reference } }),
  } as unknown as Response)
}

function mockFetchError(status = 500) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as unknown as Response)
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubEnv('VITE_BIBLE_API_KEY', 'test-api-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ScriptureRefInput', () => {
  it('renders the input with correct placeholder text', () => {
    render(<ScriptureRefInput translation="NLT" onAdd={vi.fn()} />)
    expect(screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')).toBeInTheDocument()
  })

  it('shows inline error for unknown book on Enter', async () => {
    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={vi.fn()} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.type(input, 'Hezekiah 3:16{Enter}')

    await waitFor(() => {
      const errorEl = screen.getByText(/Unknown book/i)
      expect(errorEl).toBeInTheDocument()
    })
  })

  it('shows inline error for bad format (no chapter:verse)', async () => {
    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={vi.fn()} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.type(input, 'notaverse{Enter}')

    await waitFor(() => {
      const errorEl = screen.getByText(/format/i)
      expect(errorEl).toBeInTheDocument()
    })
  })

  it('shows error when API key is not configured', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_BIBLE_API_KEY', '')
    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={vi.fn()} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.type(input, 'John 3:16{Enter}')

    await waitFor(() => {
      expect(screen.getByText('Bible API key not configured.')).toBeInTheDocument()
    })
  })

  it('calls onAdd with correct { reference, passageId } on valid input + successful API response', async () => {
    const onAdd = vi.fn()
    mockFetchSuccess('John 3:16')
    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={onAdd} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.type(input, 'John 3:16{Enter}')

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({
        reference: 'John 3:16',
        passageId: 'JHN.3.16',
      } satisfies ScriptureRef)
    })
  })

  it('clears the input after a successful submission', async () => {
    const onAdd = vi.fn()
    mockFetchSuccess('John 3:16')
    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={onAdd} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.type(input, 'John 3:16{Enter}')

    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())

    expect(input).toHaveValue('')
  })

  it('shows validation error when API call fails', async () => {
    mockFetchError(404)
    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={vi.fn()} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.type(input, 'John 3:16{Enter}')

    await waitFor(() => {
      expect(screen.getByText(/Could not validate reference/i)).toBeInTheDocument()
    })
  })

  it('does not call onAdd when input is empty', async () => {
    const onAdd = vi.fn()
    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={onAdd} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.click(input)
    await user.keyboard('{Enter}')

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('clears error and value when Escape is pressed', async () => {
    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={vi.fn()} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.type(input, 'Hezekiah 3:16{Enter}')

    await waitFor(() => {
      expect(screen.getByText(/Unknown book/i)).toBeInTheDocument()
    })

    await user.keyboard('{Escape}')

    expect(input).toHaveValue('')
    expect(screen.queryByText(/Unknown book/i)).not.toBeInTheDocument()
  })

  it('clears error message when user starts typing again', async () => {
    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={vi.fn()} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.type(input, 'Hezekiah 3:16{Enter}')

    await waitFor(() => {
      expect(screen.getByText(/Unknown book/i)).toBeInTheDocument()
    })

    await user.type(input, 'J')

    expect(screen.queryByText(/Unknown book/i)).not.toBeInTheDocument()
  })

  it('input is disabled while loading', async () => {
    // Delay the fetch response so we can check loading state
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              json: () => Promise.resolve({ data: { reference: 'John 3:16' } }),
            } as unknown as Response),
          200,
        ),
      ),
    )

    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={vi.fn()} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.type(input, 'John 3:16')
    await user.keyboard('{Enter}')

    // Input should be disabled while loading
    expect(input).toBeDisabled()
  })

  it('passes the correct passageId for a verse range', async () => {
    const onAdd = vi.fn()
    mockFetchSuccess('Psalm 23:1-4')
    const user = userEvent.setup()
    render(<ScriptureRefInput translation="NLT" onAdd={onAdd} />)

    const input = screen.getByPlaceholderText('e.g. John 3:16 or Psalm 23:1-4')
    await user.type(input, 'Psalm 23:1-4{Enter}')

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({
        reference: 'Psalm 23:1-4',
        passageId: 'PSA.23.1-PSA.23.4',
      } satisfies ScriptureRef)
    })
  })
})
