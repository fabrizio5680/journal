import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We need to reset the module between tests because deviceIdentity uses a module-level cache
// Re-import the function fresh each time by using vi.resetModules and dynamic import

const STORAGE_KEY = 'device_identity'

describe('getDeviceIdentity', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('first call: returns { id, label } where id is a UUID-shaped string', async () => {
    const { getDeviceIdentity } = await import('./deviceIdentity')
    const identity = getDeviceIdentity()

    expect(identity).toHaveProperty('id')
    expect(identity).toHaveProperty('label')
    // UUID v4 pattern
    expect(identity.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('second call returns same id (localStorage persistence)', async () => {
    const { getDeviceIdentity } = await import('./deviceIdentity')
    const first = getDeviceIdentity()
    const second = getDeviceIdentity()

    expect(second.id).toBe(first.id)
  })

  it('label contains recognizable OS or browser substring from userAgent', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    })

    const { getDeviceIdentity } = await import('./deviceIdentity')
    const identity = getDeviceIdentity()

    // Should contain "Mac" and "Chrome"
    expect(identity.label).toMatch(/Mac|Chrome/)
  })

  it('works when localStorage is pre-populated — reads existing, does not overwrite', async () => {
    const existing = {
      id: 'pre-existing-id-1234',
      label: 'Pre-existing Label',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

    const { getDeviceIdentity } = await import('./deviceIdentity')
    const identity = getDeviceIdentity()

    expect(identity.id).toBe('pre-existing-id-1234')
    expect(identity.label).toBe('Pre-existing Label')

    // localStorage should still hold the original value
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { id: string }
    expect(stored.id).toBe('pre-existing-id-1234')
  })

  it('persists new identity to localStorage after first call', async () => {
    const { getDeviceIdentity } = await import('./deviceIdentity')
    const identity = getDeviceIdentity()

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as {
      id: string
      label: string
      createdAt: string
    } | null
    expect(stored).not.toBeNull()
    expect(stored?.id).toBe(identity.id)
    expect(stored?.label).toBe(identity.label)
    expect(stored?.createdAt).toBeTruthy()
  })
})
