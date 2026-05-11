import { entryMatchesRange, toEntry, toMetadata } from './entryFormat'
import type { EntryFile, EntryMetadata, SyncStatus } from './types'

const DB_NAME = 'quiet-dwelling'
const DB_VERSION = 1
const ENTRY_STORE = 'entries'
const METADATA_STORE = 'metadata'

type EntryRecord = EntryFile & { key: string; userId: string }
type MetadataRecord = EntryMetadata & { key: string; userId: string }

function storageKey(userId: string, date: string): string {
  return `${userId}:${date}`
}

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined'
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function openDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = () => {
    const db = request.result
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
  }
  return requestToPromise(request)
}

class MemoryEntryCache {
  private entries = new Map<string, EntryRecord>()
  private metadata = new Map<string, MetadataRecord>()

  async getEntry(userId: string, date: string): Promise<EntryFile | null> {
    return this.entries.get(storageKey(userId, date)) ?? null
  }

  async saveEntry(
    userId: string,
    entry: EntryFile,
    syncStatus: SyncStatus,
    metadataPatch: Partial<EntryMetadata> = {},
  ): Promise<EntryMetadata> {
    const key = storageKey(userId, entry.date)
    const previous = this.metadata.get(key) ?? null
    const metadata = { ...toMetadata(entry, syncStatus, previous), ...metadataPatch }
    this.entries.set(key, { ...entry, key, userId })
    this.metadata.set(key, { ...metadata, key, userId })
    return metadata
  }

  async updateMetadata(
    userId: string,
    date: string,
    patch: Partial<EntryMetadata>,
  ): Promise<EntryMetadata | null> {
    const key = storageKey(userId, date)
    const previous = this.metadata.get(key)
    if (!previous) return null
    const metadata = { ...previous, ...patch }
    this.metadata.set(key, metadata)
    return metadata
  }

  async saveMetadata(userId: string, metadata: EntryMetadata): Promise<EntryMetadata> {
    const key = storageKey(userId, metadata.date)
    this.metadata.set(key, { ...metadata, key, userId })
    return metadata
  }

  async listMetadata(userId: string, range?: { from?: string; to?: string }) {
    return [...this.metadata.values()]
      .filter((item) => item.userId === userId)
      .filter((item) => !item.deletedAt)
      .filter((item) => entryMatchesRange(item.date, range))
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  async listEntries(userId: string, range?: { from?: string; to?: string }) {
    return [...this.entries.values()]
      .filter((item) => item.userId === userId)
      .filter((item) => entryMatchesRange(item.date, range))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((entry) => toEntry(entry))
  }
}

class IndexedDbEntryCache {
  async getEntry(userId: string, date: string): Promise<EntryFile | null> {
    const db = await openDb()
    const tx = db.transaction(ENTRY_STORE, 'readonly')
    const record = await requestToPromise<EntryRecord | undefined>(
      tx.objectStore(ENTRY_STORE).get(storageKey(userId, date)),
    )
    db.close()
    return record ?? null
  }

  async saveEntry(
    userId: string,
    entry: EntryFile,
    syncStatus: SyncStatus,
    metadataPatch: Partial<EntryMetadata> = {},
  ): Promise<EntryMetadata> {
    const db = await openDb()
    const key = storageKey(userId, entry.date)
    const tx = db.transaction([ENTRY_STORE, METADATA_STORE], 'readwrite')
    const previous =
      (await requestToPromise<MetadataRecord | undefined>(
        tx.objectStore(METADATA_STORE).get(key),
      )) ?? null
    const metadata = { ...toMetadata(entry, syncStatus, previous), ...metadataPatch }
    tx.objectStore(ENTRY_STORE).put({ ...entry, key, userId })
    tx.objectStore(METADATA_STORE).put({ ...metadata, key, userId })
    await txDone(tx)
    db.close()
    return metadata
  }

  async updateMetadata(
    userId: string,
    date: string,
    patch: Partial<EntryMetadata>,
  ): Promise<EntryMetadata | null> {
    const db = await openDb()
    const key = storageKey(userId, date)
    const tx = db.transaction(METADATA_STORE, 'readwrite')
    const previous = await requestToPromise<MetadataRecord | undefined>(
      tx.objectStore(METADATA_STORE).get(key),
    )
    if (!previous) {
      db.close()
      return null
    }
    const metadata = { ...previous, ...patch }
    tx.objectStore(METADATA_STORE).put(metadata)
    await txDone(tx)
    db.close()
    return metadata
  }

  async saveMetadata(userId: string, metadata: EntryMetadata): Promise<EntryMetadata> {
    const db = await openDb()
    const key = storageKey(userId, metadata.date)
    const tx = db.transaction(METADATA_STORE, 'readwrite')
    tx.objectStore(METADATA_STORE).put({ ...metadata, key, userId })
    await txDone(tx)
    db.close()
    return metadata
  }

  async listMetadata(userId: string, range?: { from?: string; to?: string }) {
    const db = await openDb()
    const tx = db.transaction(METADATA_STORE, 'readonly')
    const records = await requestToPromise<MetadataRecord[]>(
      tx.objectStore(METADATA_STORE).getAll(),
    )
    db.close()
    return records
      .filter((item) => item.userId === userId)
      .filter((item) => !item.deletedAt)
      .filter((item) => entryMatchesRange(item.date, range))
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  async listEntries(userId: string, range?: { from?: string; to?: string }) {
    const db = await openDb()
    const tx = db.transaction(ENTRY_STORE, 'readonly')
    const records = await requestToPromise<EntryRecord[]>(tx.objectStore(ENTRY_STORE).getAll())
    db.close()
    return records
      .filter((item) => item.userId === userId)
      .filter((item) => entryMatchesRange(item.date, range))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((entry) => toEntry(entry))
  }
}

export const localEntryCache = hasIndexedDB() ? new IndexedDbEntryCache() : new MemoryEntryCache()
