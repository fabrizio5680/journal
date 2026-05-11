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

  describe('midnight timer', () => {
    beforeEach(() => {
      // Override outer beforeEach: fake both Date AND setTimeout/clearTimeout.
      // Compute "1 minute before local midnight" dynamically so tests pass in any timezone.
      vi.useFakeTimers()
      const now = new Date()
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      vi.setSystemTime(new Date(midnight.getTime() - 60_000))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('updates date when midnight setTimeout fires', async () => {
      const { useToday } = await import('./useToday')
      const { result } = renderHook(() => useToday())

      const initialDate = result.current

      await act(async () => {
        vi.advanceTimersByTime(61_000) // 61 s — past midnight
      })

      expect(result.current).not.toBe(initialDate)
    })

    it('re-schedules after midnight so a second day rollover also fires', async () => {
      const { useToday } = await import('./useToday')
      const { result } = renderHook(() => useToday())

      const day0 = result.current

      // Cross first midnight
      await act(async () => {
        vi.advanceTimersByTime(61_000)
      })
      const day1 = result.current
      expect(day1).not.toBe(day0)

      // Cross second midnight (24 h later)
      await act(async () => {
        vi.advanceTimersByTime(24 * 60 * 60 * 1000)
      })
      expect(result.current).not.toBe(day1)
    })

    it('clears the midnight timer on unmount', async () => {
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
      const { useToday } = await import('./useToday')
      const { unmount } = renderHook(() => useToday())

      unmount()

      expect(clearSpy).toHaveBeenCalled()
      clearSpy.mockRestore()
    })
  })
})
