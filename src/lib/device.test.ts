import { describe, it, expect, vi, afterEach } from 'vitest'

import { isMobileDevice } from './device'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isMobileDevice', () => {
  it('returns true when pointer is coarse (touch device)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    })
    expect(isMobileDevice()).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith('(pointer: coarse)')
  })

  it('returns false when pointer is fine (non-touch device)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    expect(isMobileDevice()).toBe(false)
    expect(window.matchMedia).toHaveBeenCalledWith('(pointer: coarse)')
  })
})
