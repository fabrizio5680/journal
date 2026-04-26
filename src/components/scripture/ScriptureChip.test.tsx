import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ScriptureChip from './ScriptureChip'

import type { ScriptureRef } from '@/types'

// ---- fetch mock helpers ----

function mockFetchSuccess(content: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data: { content } }),
  } as unknown as Response)
}

function mockFetchError() {
  vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))
}

const sampleRef: ScriptureRef = {
  reference: 'John 3:16',
  passageId: 'JHN.3.16',
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.stubEnv('VITE_BIBLE_API_KEY', 'test-api-key')
  // jsdom doesn't implement getBoundingClientRect — return a fake rect so
  // ScriptureChip can compute popup position via createPortal
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 100,
    left: 50,
    top: 80,
    right: 314,
    width: 264,
    height: 20,
    x: 50,
    y: 80,
    toJSON: () => {},
  } as DOMRect)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ScriptureChip', () => {
  it('renders the reference text in a button', () => {
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)
    expect(screen.getByRole('button', { name: /Show verse: John 3:16/i })).toBeInTheDocument()
    expect(screen.getByText('John 3:16')).toBeInTheDocument()
  })

  it('popover is not visible before chip is clicked', () => {
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  it('shows loading state when chip is clicked', async () => {
    // Use a slow fetch so we can observe the loading state
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              json: () => Promise.resolve({ data: { content: 'For God so loved the world' } }),
            } as unknown as Response),
          200,
        ),
      ),
    )

    const user = userEvent.setup()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)

    await user.click(screen.getByRole('button', { name: /Show verse: John 3:16/i }))

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('displays verse text after successful fetch', async () => {
    const verseText = 'For God so loved the world'
    mockFetchSuccess(verseText)

    const user = userEvent.setup()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)

    await user.click(screen.getByRole('button', { name: /Show verse: John 3:16/i }))

    await waitFor(() => {
      expect(screen.getByText(verseText)).toBeInTheDocument()
    })
  })

  it('shows reference and translation label in the popover', async () => {
    mockFetchSuccess('For God so loved the world')

    const user = userEvent.setup()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)

    await user.click(screen.getByRole('button', { name: /Show verse: John 3:16/i }))

    await waitFor(() => {
      // The footer shows "John 3:16 · NLT" — use exact match on the footer paragraph
      const footerEl = screen.getByText((_, el) => {
        return (
          el?.tagName === 'P' &&
          !!el.textContent?.includes('John 3:16') &&
          !!el.textContent?.includes('NLT')
        )
      })
      expect(footerEl).toBeInTheDocument()
    })
  })

  it('shows error text when fetch fails', async () => {
    mockFetchError()

    // Use a distinct passageId that won't have a cache entry from other tests
    const errorRef: ScriptureRef = { reference: 'Romans 8:28', passageId: 'ROM.8.28' }
    const user = userEvent.setup()
    render(<ScriptureChip ref_={errorRef} translation="NLT" />)

    await user.click(screen.getByRole('button', { name: /Show verse: Romans 8:28/i }))

    await waitFor(() => {
      expect(screen.getByText('Could not load verse text.')).toBeInTheDocument()
    })
  })

  it('uses cached verse without fetching when already in localStorage', async () => {
    const cacheKey = `scripture_ref_NLT_${sampleRef.passageId}`
    localStorage.setItem(cacheKey, 'Cached verse text')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const user = userEvent.setup()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)

    await user.click(screen.getByRole('button', { name: /Show verse: John 3:16/i }))

    await waitFor(() => {
      expect(screen.getByText('Cached verse text')).toBeInTheDocument()
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders a remove button when onRemove is provided', () => {
    const onRemove = vi.fn()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" onRemove={onRemove} />)

    expect(screen.getByRole('button', { name: /Remove John 3:16/i })).toBeInTheDocument()
  })

  it('does not render remove button when onRemove is not provided', () => {
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)
    expect(screen.queryByRole('button', { name: /Remove John 3:16/i })).not.toBeInTheDocument()
  })

  it('calls onRemove when the × button is clicked', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" onRemove={onRemove} />)

    await user.click(screen.getByRole('button', { name: /Remove John 3:16/i }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('toggles popover closed on second click', async () => {
    const verseText = 'For God so loved the world'
    mockFetchSuccess(verseText)

    const user = userEvent.setup()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)

    const chipBtn = screen.getByRole('button', { name: /Show verse: John 3:16/i })

    await user.click(chipBtn)
    await waitFor(() => expect(screen.getByText(verseText)).toBeInTheDocument())

    // Second click closes the popover
    await user.click(chipBtn)
    expect(screen.queryByText(verseText)).not.toBeInTheDocument()
  })

  it('sets aria-expanded correctly on the chip button', async () => {
    mockFetchSuccess('For God so loved the world')
    const user = userEvent.setup()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)

    const chipBtn = screen.getByRole('button', { name: /Show verse: John 3:16/i })
    expect(chipBtn).toHaveAttribute('aria-expanded', 'false')

    await user.click(chipBtn)
    expect(chipBtn).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes popover when clicking outside the chip', async () => {
    const verseText = 'For God so loved the world'
    mockFetchSuccess(verseText)

    const user = userEvent.setup()
    render(
      <div>
        <ScriptureChip ref_={sampleRef} translation="NLT" />
        <button data-testid="outside">Outside</button>
      </div>,
    )

    const chipBtn = screen.getByRole('button', { name: /Show verse: John 3:16/i })
    await user.click(chipBtn)
    await waitFor(() => expect(screen.getByText(verseText)).toBeInTheDocument())

    await user.pointer({ target: screen.getByTestId('outside'), keys: '[MouseLeft]' })
    await waitFor(() => {
      expect(screen.queryByText(verseText)).not.toBeInTheDocument()
    })
  })

  // ---- portal-specific tests ----

  it('renders popup via portal into document.body (not inside chip container)', async () => {
    const verseText = 'For God so loved the world'
    mockFetchSuccess(verseText)

    const user = userEvent.setup()
    const { container } = render(<ScriptureChip ref_={sampleRef} translation="NLT" />)

    await user.click(screen.getByRole('button', { name: /Show verse: John 3:16/i }))

    // Wait for the portal popup div to appear in the DOM
    await waitFor(() => expect(document.body.querySelector('.fixed.z-50')).not.toBeNull())

    const popup = document.body.querySelector('.fixed.z-50')!
    // The popup div is attached to document.body
    expect(document.body.contains(popup)).toBe(true)

    // It must NOT be a descendant of the chip's rendered container
    expect(container.contains(popup)).toBe(false)
  })

  it('positions the popup using inline style from getBoundingClientRect', async () => {
    // getBoundingClientRect is mocked to return bottom:100, left:50 in beforeEach
    const verseText = 'For God so loved the world'
    mockFetchSuccess(verseText)

    const user = userEvent.setup()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)

    await user.click(screen.getByRole('button', { name: /Show verse: John 3:16/i }))
    await waitFor(() => expect(document.body.querySelector('.fixed.z-50')).not.toBeNull())

    const popup = document.body.querySelector<HTMLElement>('.fixed.z-50')!
    // top = rect.bottom + 4 = 100 + 4 = 104; left = rect.left = 50
    expect(popup.style.top).toBe('104px')
    expect(popup.style.left).toBe('50px')
  })

  it('closes popup when window scroll event fires', async () => {
    const cacheKey = `scripture_ref_NLT_${sampleRef.passageId}`
    localStorage.setItem(cacheKey, 'Cached verse text')

    const user = userEvent.setup()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)

    await user.click(screen.getByRole('button', { name: /Show verse: John 3:16/i }))
    await waitFor(() => expect(screen.getByText('Cached verse text')).toBeInTheDocument())

    // Dispatch scroll on window — captured in capture phase by the component
    window.dispatchEvent(new Event('scroll'))

    await waitFor(() => {
      expect(screen.queryByText('Cached verse text')).not.toBeInTheDocument()
    })
  })

  it('keeps popup open when clicking inside the portal popup div', async () => {
    const verseText = 'For God so loved the world'
    mockFetchSuccess(verseText)

    const user = userEvent.setup()
    render(<ScriptureChip ref_={sampleRef} translation="NLT" />)

    await user.click(screen.getByRole('button', { name: /Show verse: John 3:16/i }))
    await waitFor(() => expect(screen.getByText(verseText)).toBeInTheDocument())

    // Click inside the portal popup itself — popup should stay open
    const popup = document.body.querySelector<HTMLElement>('.fixed.z-50')!
    await user.pointer({ target: popup, keys: '[MouseLeft]' })

    // Popup should still be present
    expect(screen.getByText(verseText)).toBeInTheDocument()
  })
})
