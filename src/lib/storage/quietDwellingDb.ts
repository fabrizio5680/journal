export const DB_NAME = 'quiet-dwelling'
export const DB_VERSION = 5

export const ENTRY_STORE = 'entries'
export const METADATA_STORE = 'metadata'
export const SYNC_STATE_STORE = 'syncState'
export const DEVICE_IDENTITY_STORE = 'deviceIdentity'
export const CONFLICTS_STORE = 'conflicts'

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

interface UpgradeEntryRecord {
  localGen?: number
  remoteRevId?: string | null
  [key: string]: unknown
}

function runUpgrade(db: IDBDatabase, request: IDBOpenDBRequest, oldVersion: number): void {
  if (!db.objectStoreNames.contains(ENTRY_STORE)) {
    const entries = db.createObjectStore(ENTRY_STORE, { keyPath: 'key' })
    entries.createIndex('userId', 'userId')
    entries.createIndex('date', 'date')
  }
  if (!db.objectStoreNames.contains(METADATA_STORE)) {
    const metadata = db.createObjectStore(METADATA_STORE, { keyPath: 'key' })
    metadata.createIndex('userId', 'userId')
    metadata.createIndex('date', 'date')
  }
  // Version 2: add syncState store
  if (oldVersion < 2 && !db.objectStoreNames.contains(SYNC_STATE_STORE)) {
    db.createObjectStore(SYNC_STATE_STORE, { keyPath: 'userId' })
  }
  if (!db.objectStoreNames.contains(DEVICE_IDENTITY_STORE)) {
    const deviceIdentity = db.createObjectStore(DEVICE_IDENTITY_STORE, { keyPath: 'key' })
    deviceIdentity.createIndex('userId', 'userId')
  }
  if (oldVersion < 5 && !db.objectStoreNames.contains(CONFLICTS_STORE)) {
    const conflicts = db.createObjectStore(CONFLICTS_STORE, { keyPath: 'key' })
    conflicts.createIndex('userId', 'userId')
  }
  if (oldVersion < 4 && db.objectStoreNames.contains(ENTRY_STORE)) {
    const entries = request.transaction?.objectStore(ENTRY_STORE)
    if (entries) {
      const cursorRequest = entries.openCursor()
      cursorRequest.onsuccess = (cursorEvent) => {
        const cursor = (cursorEvent.target as IDBRequest<IDBCursorWithValue | null>).result
        if (!cursor) return
        const value = cursor.value as UpgradeEntryRecord
        cursor.update({
          ...value,
          localGen: value.localGen ?? 1,
          remoteRevId: value.remoteRevId ?? null,
        })
        cursor.continue()
      }
    }
  }
}

export async function openQuietDwellingDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = (event) => {
    runUpgrade(request.result, request, event.oldVersion ?? 0)
  }
  return requestToPromise(request)
}
