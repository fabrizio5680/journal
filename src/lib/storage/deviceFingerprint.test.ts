import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type StoredRecord = Record<string, unknown> & { key: string }

function createRequest<T>(): IDBRequest<T> {
  return {
    onsuccess: null,
    onerror: null,
    result: undefined as T,
    error: null,
  } as IDBRequest<T>
}

function createFakeIndexedDb(): IDBFactory {
  const stores = new Map<string, Map<string, StoredRecord>>()
  let currentVersion = 0

  return {
    open: vi.fn((name: string, version?: number) => {
      void name
      const request = createRequest<IDBDatabase>() as IDBOpenDBRequest
      const requestedVersion = version ?? 1
      const oldVersion = currentVersion
      currentVersion = Math.max(currentVersion, requestedVersion)

      const db = {
        objectStoreNames: {
          contains: (storeName: string) => stores.has(storeName),
        },
        createObjectStore: (storeName: string) => {
          if (!stores.has(storeName)) stores.set(storeName, new Map())
          return { createIndex: vi.fn() }
        },
        transaction: (storeNames: string | string[]) => {
          void storeNames
          const tx: {
            error: DOMException | null
            oncomplete: ((event: Event) => void) | null
            onerror: ((event: Event) => void) | null
            onabort: ((event: Event) => void) | null
            objectStore: (storeName: string) => {
              get: (key: string) => IDBRequest<StoredRecord | undefined>
              add: (record: StoredRecord) => IDBRequest<unknown>
              put: (record: StoredRecord) => IDBRequest<unknown>
            }
          } = {
            error: null as DOMException | null,
            oncomplete: null as (() => void) | null,
            onerror: null as (() => void) | null,
            onabort: null as (() => void) | null,
            objectStore: (storeName: string) => {
              const store = stores.get(storeName) ?? new Map<string, StoredRecord>()
              stores.set(storeName, store)
              return {
                get: (key: string) => {
                  const getRequest = createRequest<StoredRecord | undefined>()
                  queueMicrotask(() => {
                    Object.defineProperty(getRequest, 'result', {
                      value: store.get(key),
                      configurable: true,
                    })
                    getRequest.onsuccess?.({} as Event)
                  })
                  return getRequest
                },
                add: (record: StoredRecord) => {
                  if (store.has(record.key)) {
                    tx.error = new DOMException('ConstraintError', 'ConstraintError')
                    queueMicrotask(() => tx.onabort?.({} as Event))
                    return createRequest<unknown>()
                  }
                  store.set(record.key, record)
                  return createRequest<unknown>()
                },
                put: (record: StoredRecord) => {
                  store.set(record.key, record)
                  return createRequest<unknown>()
                },
              }
            },
          }

          queueMicrotask(() => {
            if (!tx.error) tx.oncomplete?.({} as Event)
          })
          return tx as IDBTransaction
        },
        close: vi.fn(),
      } as unknown as IDBDatabase

      queueMicrotask(() => {
        Object.defineProperty(request, 'result', { value: db, configurable: true })
        if (requestedVersion > oldVersion) {
          request.onupgradeneeded?.({ oldVersion } as IDBVersionChangeEvent)
        }
        request.onsuccess?.({} as Event)
      })

      return request
    }),
  } as unknown as IDBFactory
}

function setUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value,
    configurable: true,
  })
}

describe('DeviceFingerprint', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', createFakeIndexedDb())
    localStorage.clear()
    vi.resetModules()
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    )
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the same deviceId for the same user and browser after localStorage is cleared', async () => {
    const { getDeviceFingerprint } = await import('./deviceFingerprint')

    const first = await getDeviceFingerprint('uid-1')
    localStorage.clear()
    const second = await getDeviceFingerprint('uid-1')

    expect(second.deviceId).toBe(first.deviceId)
    expect(second.deviceLabel).toBe('Mac · Chrome')
  })

  it('uses a different deviceId when the user changes on the same browser', async () => {
    const { getDeviceFingerprint } = await import('./deviceFingerprint')

    const first = await getDeviceFingerprint('uid-1')
    const second = await getDeviceFingerprint('uid-2')

    expect(second.deviceId).not.toBe(first.deviceId)
  })

  it('uses a different deviceId when the browser fingerprint changes', async () => {
    const { getDeviceFingerprint } = await import('./deviceFingerprint')

    const first = await getDeviceFingerprint('uid-1')
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    )
    const second = await getDeviceFingerprint('uid-1')

    expect(second.deviceId).not.toBe(first.deviceId)
    expect(second.deviceLabel).toBe('Mac · Safari')
  })

  it('coalesces concurrent first calls for the same user and browser', async () => {
    const { getDeviceFingerprint } = await import('./deviceFingerprint')

    const [first, second] = await Promise.all([
      getDeviceFingerprint('uid-1'),
      getDeviceFingerprint('uid-1'),
    ])

    expect(second.deviceId).toBe(first.deviceId)
  })

  it('refreshes the human-readable label without changing deviceId', async () => {
    const { getDeviceFingerprint, refreshDeviceLabel } = await import('./deviceFingerprint')

    const first = await getDeviceFingerprint('uid-1')
    const refreshed = await refreshDeviceLabel('uid-1', "Fabrizio's MacBook")

    expect(refreshed.deviceId).toBe(first.deviceId)
    expect(refreshed.deviceLabel).toBe("Fabrizio's MacBook · Chrome")
  })
})
