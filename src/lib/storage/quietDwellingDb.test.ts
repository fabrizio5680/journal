import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression coverage for the cross-module IndexedDB version conflict.
 *
 * Before Phase 2, `localEntryCache` and `deviceFingerprint` each opened the
 * shared `quiet-dwelling` database with their own `DB_VERSION` constant
 * (5 and 3 respectively). When one module upgraded the DB to v5 first and
 * the other then tried to open it with v3, IDB rejected with
 * `VersionError: The requested version (3) is less than the existing
 * version (5)`. That stuck the sync indicator in `sync-pending`.
 *
 * Phase 2 consolidated the constants and the opener into
 * `./quietDwellingDb.ts`. These tests guard the regression by:
 *   1. Opening through both modules in both orders against a shared fake IDB
 *      that enforces version semantics (lower-version reopens reject).
 *   2. Verifying that after either module opens, all five stores exist and
 *      can be read/written through both modules.
 *   3. Asserting that the public APIs of both modules work against the
 *      shared `DB_VERSION` exported from the module — protecting against
 *      anyone re-introducing a hardcoded version constant.
 */

// ── Fake IndexedDB ─────────────────────────────────────────────────────────────

type StoredRecord = Record<string, unknown> & { key?: unknown }

interface FakeStore {
  records: Map<unknown, StoredRecord>
  keyPath: string
  indexes: Set<string>
}

interface FakeDbState {
  name: string
  version: number
  stores: Map<string, FakeStore>
}

interface FakeIndexedDb {
  factory: IDBFactory
  state: FakeDbState
  /** Opens recorded by name → versions requested in order. */
  opens: number[]
}

function createFakeIndexedDb(): FakeIndexedDb {
  const state: FakeDbState = {
    name: 'quiet-dwelling',
    version: 0,
    stores: new Map(),
  }
  const opens: number[] = []

  function makeRequest<T>(): IDBRequest<T> {
    return {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: undefined as unknown as T,
      error: null,
    } as unknown as IDBRequest<T>
  }

  interface TxContext {
    error: DOMException | null
    pending: number
    completed: boolean
    oncomplete: ((event: Event) => void) | null
    onabort: ((event: Event) => void) | null
    finalize: () => void
  }

  function makeObjectStore(store: FakeStore, ctx: TxContext) {
    function resolveKey(record: StoredRecord): unknown {
      return store.keyPath ? record[store.keyPath as keyof StoredRecord] : record.key
    }
    function trackRequest<T>(produce: () => T): IDBRequest<T> {
      const request = makeRequest<T>()
      ctx.pending += 1
      queueMicrotask(() => {
        if (ctx.error) {
          ctx.pending -= 1
          ctx.finalize()
          return
        }
        try {
          Object.defineProperty(request, 'result', {
            value: produce(),
            configurable: true,
          })
          request.onsuccess?.({ target: request } as unknown as Event)
        } catch (err) {
          ctx.error = err as DOMException
        }
        ctx.pending -= 1
        ctx.finalize()
      })
      return request
    }
    return {
      createIndex: (name: string) => {
        store.indexes.add(name)
        return { name }
      },
      get: (key: unknown) => {
        return trackRequest<StoredRecord | undefined>(() => store.records.get(key))
      },
      getAll: () => {
        return trackRequest<StoredRecord[]>(() => [...store.records.values()])
      },
      put: (record: StoredRecord) => {
        return trackRequest<unknown>(() => {
          store.records.set(resolveKey(record), record)
          return undefined
        })
      },
      add: (record: StoredRecord) => {
        return trackRequest<unknown>(() => {
          const key = resolveKey(record)
          if (store.records.has(key)) {
            throw new DOMException('ConstraintError', 'ConstraintError')
          }
          store.records.set(key, record)
          return undefined
        })
      },
      delete: (key: unknown) => {
        return trackRequest<unknown>(() => {
          store.records.delete(key)
          return undefined
        })
      },
      openCursor: () => {
        // Upgrade migrator uses this for v4 backfill; return an empty cursor.
        return trackRequest<IDBCursorWithValue | null>(() => null)
      },
    }
  }

  function makeDb(): IDBDatabase {
    // Upgrade-only context shared across createObjectStore calls so the
    // upgrade transaction tracks pending requests (e.g. the v4 cursor scan).
    const upgradeCtx: TxContext = {
      error: null,
      pending: 0,
      completed: false,
      oncomplete: null,
      onabort: null,
      finalize: () => {},
    }
    return {
      objectStoreNames: {
        contains: (storeName: string) => state.stores.has(storeName),
        length: state.stores.size,
      },
      createObjectStore: (storeName: string, options?: { keyPath?: string }) => {
        const keyPath = options?.keyPath ?? 'key'
        const store: FakeStore = {
          records: new Map(),
          keyPath,
          indexes: new Set(),
        }
        state.stores.set(storeName, store)
        return makeObjectStore(store, upgradeCtx) as unknown as IDBObjectStore
      },
      transaction: (storeNames: string | string[]) => {
        void storeNames
        const ctx: TxContext = {
          error: null,
          pending: 0,
          completed: false,
          oncomplete: null,
          onabort: null,
          finalize: () => {},
        }
        const tx = {
          error: null as DOMException | null,
          oncomplete: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
          onabort: null as ((event: Event) => void) | null,
          objectStore: (storeName: string) => {
            const store = state.stores.get(storeName)
            if (!store) {
              throw new DOMException(`No store ${storeName}`, 'NotFoundError')
            }
            return makeObjectStore(store, ctx) as unknown as IDBObjectStore
          },
        }
        // Fire oncomplete only once all queued requests have flushed and
        // the calling async function has had a chance to issue more.
        ctx.finalize = () => {
          if (ctx.completed) return
          if (ctx.pending > 0) return
          // Yield once more so a follow-up await/put can still attach to
          // this transaction before we declare it complete.
          queueMicrotask(() => {
            if (ctx.completed) return
            if (ctx.pending > 0) return
            ctx.completed = true
            if (ctx.error) {
              tx.error = ctx.error
              tx.onabort?.({} as Event)
            } else {
              tx.oncomplete?.({} as Event)
            }
          })
        }
        // Kick off finalize after the synchronous setup so empty transactions
        // resolve too (no requests issued).
        queueMicrotask(() => ctx.finalize())
        return tx as unknown as IDBTransaction
      },
      close: () => {},
    } as unknown as IDBDatabase
  }

  const factory = {
    open: (name: string, version?: number) => {
      const request = makeRequest<IDBDatabase>() as IDBOpenDBRequest
      const requestedVersion = version ?? 1
      opens.push(requestedVersion)

      queueMicrotask(() => {
        // Version downgrade — reject exactly like real IDB.
        if (requestedVersion < state.version) {
          const err = new DOMException(
            `The requested version (${requestedVersion}) is less than the existing version (${state.version}).`,
            'VersionError',
          )
          Object.defineProperty(request, 'error', { value: err, configurable: true })
          request.onerror?.({} as Event)
          return
        }

        const upgradeNeeded = requestedVersion > state.version
        const oldVersion = state.version
        if (upgradeNeeded) {
          state.version = requestedVersion
          state.name = name
        }

        const db = makeDb()
        // Expose transaction on the request during upgrade so runUpgrade can
        // call request.transaction?.objectStore(...) for the v4 backfill.
        const upgradeTx = {
          objectStore: (storeName: string) => {
            const store = state.stores.get(storeName)
            if (!store) {
              throw new DOMException(`No store ${storeName}`, 'NotFoundError')
            }
            return {
              openCursor: () => {
                const cursorRequest = makeRequest<IDBCursorWithValue | null>()
                queueMicrotask(() => {
                  Object.defineProperty(cursorRequest, 'result', {
                    value: null,
                    configurable: true,
                  })
                  cursorRequest.onsuccess?.({ target: cursorRequest } as unknown as Event)
                })
                return cursorRequest
              },
            } as unknown as IDBObjectStore
          },
        }

        Object.defineProperty(request, 'result', { value: db, configurable: true })
        Object.defineProperty(request, 'transaction', {
          value: upgradeTx,
          configurable: true,
        })

        if (upgradeNeeded) {
          request.onupgradeneeded?.({ oldVersion } as IDBVersionChangeEvent)
        }
        request.onsuccess?.({} as Event)
      })

      return request
    },
  } as unknown as IDBFactory

  return { factory, state, opens }
}

// ── Test scaffolding ───────────────────────────────────────────────────────────

let fake: FakeIndexedDb

function setUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value,
    configurable: true,
  })
}

beforeEach(() => {
  fake = createFakeIndexedDb()
  vi.stubGlobal('indexedDB', fake.factory)
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

const EXPECTED_STORES = ['entries', 'metadata', 'syncState', 'deviceIdentity', 'conflicts'] as const

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('quietDwellingDb cross-module open', () => {
  it('localEntryCache opens v5 → getDeviceFingerprint opens without VersionError', async () => {
    const { localEntryCache } = await import('./localEntryCache')
    const { getDeviceFingerprint } = await import('./deviceFingerprint')

    // First open via localEntryCache — upgrades DB to v5.
    await localEntryCache.setSyncState('uid-1', { driveStartPageToken: 'tok' })
    expect(fake.state.version).toBe(5)

    // Second open via deviceFingerprint must NOT reject with VersionError.
    const fingerprint = await getDeviceFingerprint('uid-1')
    expect(fingerprint.deviceId).toBeTruthy()
    expect(fake.state.version).toBe(5)
  })

  it('getDeviceFingerprint opens v5 → localEntryCache opens without VersionError', async () => {
    const { getDeviceFingerprint } = await import('./deviceFingerprint')
    const { localEntryCache } = await import('./localEntryCache')

    // First open via deviceFingerprint — upgrades DB to v5.
    const fingerprint = await getDeviceFingerprint('uid-2')
    expect(fingerprint.deviceId).toBeTruthy()
    expect(fake.state.version).toBe(5)

    // Second open via localEntryCache must NOT reject with VersionError.
    await localEntryCache.setSyncState('uid-2', { driveStartPageToken: 'tok-2' })
    const state = await localEntryCache.getSyncState('uid-2')
    expect(state?.driveStartPageToken).toBe('tok-2')
    expect(fake.state.version).toBe(5)
  })

  it('refreshDeviceLabel after localEntryCache open does not reject', async () => {
    const { localEntryCache } = await import('./localEntryCache')
    const { refreshDeviceLabel } = await import('./deviceFingerprint')

    await localEntryCache.setSyncState('uid-3', { driveStartPageToken: 'tok-3' })
    const refreshed = await refreshDeviceLabel('uid-3', "Fabrizio's Mac")
    expect(refreshed.deviceLabel).toContain("Fabrizio's Mac")
  })
})

describe('quietDwellingDb schema visibility', () => {
  it('all five stores exist after localEntryCache opens', async () => {
    const { localEntryCache } = await import('./localEntryCache')

    await localEntryCache.setSyncState('uid-schema-1', { driveStartPageToken: 'a' })

    for (const storeName of EXPECTED_STORES) {
      expect(fake.state.stores.has(storeName)).toBe(true)
    }
  })

  it('all five stores exist after deviceFingerprint opens', async () => {
    const { getDeviceFingerprint } = await import('./deviceFingerprint')

    await getDeviceFingerprint('uid-schema-2')

    for (const storeName of EXPECTED_STORES) {
      expect(fake.state.stores.has(storeName)).toBe(true)
    }
  })

  it('read-then-write through both modules in the same test run', async () => {
    const { localEntryCache } = await import('./localEntryCache')
    const { getDeviceFingerprint, refreshDeviceLabel } = await import('./deviceFingerprint')

    // deviceFingerprint writes to deviceIdentity store.
    const fp1 = await getDeviceFingerprint('uid-rw')
    expect(fp1.deviceId).toBeTruthy()

    // localEntryCache writes to syncState store.
    await localEntryCache.setSyncState('uid-rw', { driveStartPageToken: 'page-token' })

    // Both reads should succeed without the schema getting clobbered.
    const fp2 = await getDeviceFingerprint('uid-rw')
    expect(fp2.deviceId).toBe(fp1.deviceId)

    const syncState = await localEntryCache.getSyncState('uid-rw')
    expect(syncState?.driveStartPageToken).toBe('page-token')

    // And mutation via refreshDeviceLabel still works.
    const refreshed = await refreshDeviceLabel('uid-rw', 'My Device')
    expect(refreshed.deviceId).toBe(fp1.deviceId)
    expect(refreshed.deviceLabel).toContain('My Device')
  })
})

describe('quietDwellingDb single DB_VERSION source', () => {
  it('public APIs of both modules work against the shared DB_VERSION export', async () => {
    const { DB_VERSION, DB_NAME } = await import('./quietDwellingDb')
    const { localEntryCache } = await import('./localEntryCache')
    const { getDeviceFingerprint } = await import('./deviceFingerprint')

    expect(DB_NAME).toBe('quiet-dwelling')
    expect(typeof DB_VERSION).toBe('number')

    // Drive both modules through their public APIs. Every open call must
    // have requested the shared DB_VERSION — never an older hardcoded one.
    await localEntryCache.setSyncState('uid-single-ver', { driveStartPageToken: 'x' })
    await getDeviceFingerprint('uid-single-ver')

    expect(fake.opens.length).toBeGreaterThan(0)
    for (const requested of fake.opens) {
      expect(requested).toBe(DB_VERSION)
    }
    expect(fake.state.version).toBe(DB_VERSION)
  })
})
