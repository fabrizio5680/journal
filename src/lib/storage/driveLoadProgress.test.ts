import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  setDriveLoadProgress,
  subscribeDriveLoadProgress,
  type DriveLoadProgress,
} from './driveLoadProgress'

beforeEach(() => {
  setDriveLoadProgress(null)
})

describe('driveLoadProgress', () => {
  it('notifies subscriber immediately with current value on subscribe', () => {
    setDriveLoadProgress({ loaded: 3, total: 10 })
    const listener = vi.fn()
    const unsub = subscribeDriveLoadProgress(listener)
    expect(listener).toHaveBeenCalledWith({ loaded: 3, total: 10 })
    unsub()
  })

  it('notifies subscriber with null when no progress is active', () => {
    const listener = vi.fn()
    const unsub = subscribeDriveLoadProgress(listener)
    expect(listener).toHaveBeenCalledWith(null)
    unsub()
  })

  it('broadcasts updates to all active subscribers', () => {
    const a = vi.fn<[DriveLoadProgress | null], void>()
    const b = vi.fn<[DriveLoadProgress | null], void>()
    const unsubA = subscribeDriveLoadProgress(a)
    const unsubB = subscribeDriveLoadProgress(b)
    a.mockClear()
    b.mockClear()

    setDriveLoadProgress({ loaded: 1, total: 5 })
    expect(a).toHaveBeenCalledWith({ loaded: 1, total: 5 })
    expect(b).toHaveBeenCalledWith({ loaded: 1, total: 5 })

    unsubA()
    unsubB()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = subscribeDriveLoadProgress(listener)
    listener.mockClear()
    unsub()

    setDriveLoadProgress({ loaded: 2, total: 4 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('clears progress with null', () => {
    setDriveLoadProgress({ loaded: 5, total: 5 })
    const listener = vi.fn()
    const unsub = subscribeDriveLoadProgress(listener)
    listener.mockClear()

    setDriveLoadProgress(null)
    expect(listener).toHaveBeenCalledWith(null)
    unsub()
  })

  it('tracks listing phase with total === 0', () => {
    const listener = vi.fn()
    const unsub = subscribeDriveLoadProgress(listener)
    listener.mockClear()

    setDriveLoadProgress({ loaded: 0, total: 0 })
    expect(listener).toHaveBeenCalledWith({ loaded: 0, total: 0 })
    unsub()
  })
})
