import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { useScriptureRef } from './useScriptureRef'

// ----- localStorage helpers -----

function getCacheKey(passageId: string, translation: string) {
  return `scripture_ref_${translation}_${passageId}`
}

function seedCache(passageId: string, translation: string, text: string) {
  localStorage.setItem(getCacheKey(passageId, translation), text)
}

// ----- fetch mock helpers -----

function mockFetchSuccess(content: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data: { content } }),
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
  localStorage.clear()
  vi.restoreAllMocks()
  vi.stubEnv('VITE_BIBLE_API_KEY', 'test-api-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('useScriptureRef', () => {
  it('returns loading=true initially when passageId is provided and no cache', async () => {
    mockFetchSuccess('For God so loved the world')

    const { result } = renderHook(() => useScriptureRef('JHN.3.16', 'NLT'))

    // Initial render should be loading (no cached value)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.text).toBeNull()
    expect(result.current.error).toBeNull()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('returns text=null and loading=false when passageId is null', async () => {
    const { result } = renderHook(() => useScriptureRef(null, 'NLT'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.text).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns cached verse from localStorage when present and does not fetch', async () => {
    seedCache('PSA.23.1', 'NLT', 'The Lord is my shepherd.')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() => useScriptureRef('PSA.23.1', 'NLT'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.text).toBe('The Lord is my shepherd.')
    expect(result.current.error).toBeNull()
    // Verify no network call was made — cache was sufficient
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches from API when no cache exists and stores result', async () => {
    const verseText = 'For God so loved the world'
    mockFetchSuccess(verseText)

    const { result } = renderHook(() => useScriptureRef('JHN.3.16', 'NLT'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.text).toBe(verseText)
    expect(result.current.error).toBeNull()

    // Verify result was written to localStorage cache
    const cached = localStorage.getItem(getCacheKey('JHN.3.16', 'NLT'))
    expect(cached).toBe(verseText)
  })

  it('calls fetch with /verses/ endpoint for a single verse', async () => {
    mockFetchSuccess('verse text')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() => useScriptureRef('JHN.3.16', 'NLT'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const calledUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('/verses/')
    expect(calledUrl).toContain(encodeURIComponent('JHN.3.16'))
  })

  it('calls fetch with /passages/ endpoint for a range passageId', async () => {
    mockFetchSuccess('range verse text')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() => useScriptureRef('PSA.23.1-PSA.23.4', 'NLT'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const calledUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('/passages/')
    expect(calledUrl).toContain(encodeURIComponent('PSA.23.1-PSA.23.4'))
  })

  it('sends api-key header in fetch request', async () => {
    mockFetchSuccess('verse text')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() => useScriptureRef('JHN.3.16', 'NLT'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const init = fetchSpy.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined
    const headers = init?.headers
    expect(headers?.['api-key']).toBe('test-api-key')
  })

  it('falls back gracefully when API key is missing', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_BIBLE_API_KEY', '')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() => useScriptureRef('JHN.3.16', 'NLT'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.text).toBeNull()
    expect(result.current.error).toBe('Bible API key not configured.')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sets error when fetch returns non-ok response', async () => {
    mockFetchError(404)

    const { result } = renderHook(() => useScriptureRef('JHN.3.16', 'NLT'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.text).toBeNull()
    expect(result.current.error).toBe('Could not load verse text.')
  })

  it('sets error when fetch throws (network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network failure'))

    const { result } = renderHook(() => useScriptureRef('JHN.3.16', 'NLT'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.text).toBeNull()
    expect(result.current.error).toBe('Could not load verse text.')
  })

  it('uses different cache keys for different translations', async () => {
    seedCache('JHN.3.16', 'NLT', 'NLT verse text')
    seedCache('JHN.3.16', 'ESV', 'ESV verse text')

    const { result: nltResult } = renderHook(() => useScriptureRef('JHN.3.16', 'NLT'))
    const { result: esvResult } = renderHook(() => useScriptureRef('JHN.3.16', 'ESV'))

    await waitFor(() => expect(nltResult.current.isLoading).toBe(false))
    await waitFor(() => expect(esvResult.current.isLoading).toBe(false))

    expect(nltResult.current.text).toBe('NLT verse text')
    expect(esvResult.current.text).toBe('ESV verse text')
  })

  it('re-fetches when passageId changes to a new uncached value', async () => {
    // Pre-cache the first passage so it doesn't fetch for JHN.3.16
    seedCache('JHN.3.16', 'NLT', 'John verse')

    const { result, rerender } = renderHook(
      ({ passageId }: { passageId: string | null }) => useScriptureRef(passageId, 'NLT'),
      { initialProps: { passageId: 'JHN.3.16' as string | null } },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.text).toBe('John verse')

    // Prepare fetch mock for the second passage before rerendering
    mockFetchSuccess('Psalm verse')
    rerender({ passageId: 'PSA.23.1' })

    await waitFor(() => {
      expect(result.current.text).toBe('Psalm verse')
    })
    expect(result.current.isLoading).toBe(false)
  })

  it('resets state when passageId changes to null', async () => {
    seedCache('JHN.3.16', 'NLT', 'cached verse')

    const { result, rerender } = renderHook(
      ({ passageId }: { passageId: string | null }) => useScriptureRef(passageId, 'NLT'),
      { initialProps: { passageId: 'JHN.3.16' as string | null } },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.text).toBe('cached verse')

    rerender({ passageId: null })

    await waitFor(() => {
      expect(result.current.text).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })
})
