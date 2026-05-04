import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('useToday', () => {
  const FAKE_NOW = new Date('2026-04-15T12:00:00Z')
  const TODAY = '2026-04-15'
  const TOMORROW = '2026-04-16'

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FAKE_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns current date string in yyyy-MM-dd format on mount', async () => {
    const { useToday } = await import('./useToday')
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe(TODAY)
  })

  it('updates when visibilitychange fires with visible state and date has changed', async () => {
    const { useToday } = await import('./useToday')
    const { result } = renderHook(() => useToday())

    expect(result.current).toBe(TODAY)

    // Advance time to the next day
    vi.setSystemTime(new Date('2026-04-16T00:01:00Z'))

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current).toBe(TOMORROW)
  })

  it('does not update when visibilitychange fires but date has not changed', async () => {
    const { useToday } = await import('./useToday')
    const { result } = renderHook(() => useToday())

    expect(result.current).toBe(TODAY)

    // Time hasn't advanced — still same date
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current).toBe(TODAY)
  })

  it('does not update when visibilitychange fires with hidden state', async () => {
    const { useToday } = await import('./useToday')
    const { result } = renderHook(() => useToday())

    expect(result.current).toBe(TODAY)

    // Advance time to the next day but fire hidden event
    vi.setSystemTime(new Date('2026-04-16T00:01:00Z'))

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Should still be old date — handler only acts on 'visible'
    expect(result.current).toBe(TODAY)
  })

  it('removes visibilitychange event listener on unmount', async () => {
    const { useToday } = await import('./useToday')
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = renderHook(() => useToday())

    const addedCount = addSpy.mock.calls.filter((c) => c[0] === 'visibilitychange').length
    expect(addedCount).toBeGreaterThanOrEqual(1)

    unmount()

    const removedCount = removeSpy.mock.calls.filter((c) => c[0] === 'visibilitychange').length
    expect(removedCount).toBeGreaterThanOrEqual(1)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
