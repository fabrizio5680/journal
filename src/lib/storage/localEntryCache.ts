import { entryMatchesRange, toEntry, toMetadata } from './entryFormat'
import type { ConflictRecordStore, EntryFile, EntryMetadata, SyncState, SyncStatus } from './types'

const DB_NAME = 'quiet-dwelling'
const DB_VERSION = 5
const ENTRY_STORE = 'entries'
const METADATA_STORE = 'metadata'
const SYNC_STATE_STORE = 'syncState'
const DEVICE_IDENTITY_STORE = 'deviceIdentity'
const CONFLICTS_STORE = 'conflicts'

type EntryRecord = EntryFile & {
  key: string
  userId: string
  localGen?: number
  remoteRevId?: string | null
}
type MetadataRecord = EntryMetadata & { key: string; userId: string }
type ConflictRecord = ConflictRecordStore & { key: string; userId: string }

export interface EntrySnapshot {
  entry: EntryFile | null
  metadata: EntryMetadata | null
  localGen: number
  remoteRevId: string | null
}

export type CommitEntryResult =
  | { kind: 'committed'; metadata: EntryMetadata; localGen: number }
  | {
      kind: 'stale'
      current: EntryFile
      metadata: EntryMetadata | null
      currentGen: number
    }

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

function entryGen(entry: EntryRecord | null | undefined): number {
  return entry ? (entry.localGen ?? 1) : 0
}

async function openDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = (event) => {
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
    // Version 2: add syncState store
    if ((event.oldVersion ?? 0) < 2 && !db.objectStoreNames.contains(SYNC_STATE_STORE)) {
      db.createObjectStore(SYNC_STATE_STORE, { keyPath: 'userId' })
    }
    if (!db.objectStoreNames.contains(DEVICE_IDENTITY_STORE)) {
      const deviceIdentity = db.createObjectStore(DEVICE_IDENTITY_STORE, { keyPath: 'key' })
      deviceIdentity.createIndex('userId', 'userId')
    }
    if ((event.oldVersion ?? 0) < 5 && !db.objectStoreNames.contains(CONFLICTS_STORE)) {
      const conflicts = db.createObjectStore(CONFLICTS_STORE, { keyPath: 'key' })
      conflicts.createIndex('userId', 'userId')
    }
    if ((event.oldVersion ?? 0) < 4 && db.objectStoreNames.contains(ENTRY_STORE)) {
      const entries = request.transaction?.objectStore(ENTRY_STORE)
      if (entries) {
        const cursorRequest = entries.openCursor()
        cursorRequest.onsuccess = (cursorEvent) => {
          const cursor = (cursorEvent.target as IDBRequest<IDBCursorWithValue | null>).result
          if (!cursor) return
          const value = cursor.value as EntryRecord
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
  return requestToPromise(request)
}

class MemoryEntryCache {
  private entries = new Map<string, EntryRecord>()
  private metadata = new Map<string, MetadataRecord>()
  private syncStates = new Map<string, SyncState>()
  private conflicts = new Map<string, ConflictRecord>()

  async getEntry(userId: string, date: string): Promise<EntryFile | null> {
    return this.entries.get(storageKey(userId, date)) ?? null
  }

  async getEntrySnapshot(userId: string, date: string): Promise<EntrySnapshot> {
    const key = storageKey(userId, date)
    const entry = this.entries.get(key) ?? null
    const metadata = this.metadata.get(key) ?? null
    return {
      entry,
      metadata,
      localGen: entryGen(entry),
      remoteRevId: entry?.remoteRevId ?? null,
    }
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
    const previousEntry = this.entries.get(key)
    this.entries.set(key, {
      ...entry,
      key,
      userId,
      localGen: entryGen(previousEntry) + 1,
      remoteRevId: metadataPatch.remoteRevisionId ?? previousEntry?.remoteRevId ?? null,
    })
    this.metadata.set(key, { ...metadata, key, userId })
    return metadata
  }

  async commitEntry(
    userId: string,
    entry: EntryFile,
    syncStatus: SyncStatus,
    options: {
      baseGen?: number
      bumpGeneration?: boolean
      metadataPatch?: Partial<EntryMetadata>
    } = {},
  ): Promise<CommitEntryResult> {
    const key = storageKey(userId, entry.date)
    const previousEntry = this.entries.get(key)
    const currentGen = entryGen(previousEntry)
    if (options.baseGen !== undefined && currentGen !== options.baseGen && previousEntry) {
      return {
        kind: 'stale',
        current: previousEntry,
        metadata: this.metadata.get(key) ?? null,
        currentGen,
      }
    }

    const previousMetadata = this.metadata.get(key) ?? null
    const metadata = {
      ...toMetadata(entry, syncStatus, previousMetadata),
      ...options.metadataPatch,
    }
    const nextGen = currentGen + (options.bumpGeneration === false ? 0 : 1)
    this.entries.set(key, {
      ...entry,
      key,
      userId,
      localGen: nextGen,
      remoteRevId: options.metadataPatch?.remoteRevisionId ?? previousEntry?.remoteRevId ?? null,
    })
    this.metadata.set(key, { ...metadata, key, userId })
    return { kind: 'committed', metadata, localGen: nextGen }
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

  async getSyncState(userId: string): Promise<SyncState | null> {
    return this.syncStates.get(userId) ?? null
  }

  async setSyncState(userId: string, patch: Partial<SyncState>): Promise<void> {
    const current = this.syncStates.get(userId)
    const next: SyncState = {
      userId,
      driveStartPageToken: null,
      driveEntriesFolderId: null,
      monthFolderIds: [],
      lastDeltaPollAt: null,
      ...current,
      ...patch,
    }
    this.syncStates.set(userId, next)
  }

  async getConflict(userId: string, date: string): Promise<ConflictRecordStore | null> {
    return this.conflicts.get(storageKey(userId, date)) ?? null
  }

  async setConflict(userId: string, record: ConflictRecordStore): Promise<void> {
    const key = storageKey(userId, record.date)
    this.conflicts.set(key, { ...record, key, userId })
  }

  async deleteConflict(userId: string, date: string): Promise<void> {
    this.conflicts.delete(storageKey(userId, date))
  }

  async listConflicts(userId: string): Promise<ConflictRecordStore[]> {
    return [...this.conflicts.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  async clearUserData(userId: string): Promise<void> {
    for (const [key, record] of this.entries) {
      if (record.userId === userId) this.entries.delete(key)
    }
    for (const [key, record] of this.metadata) {
      if (record.userId === userId) this.metadata.delete(key)
    }
    for (const [key, record] of this.conflicts) {
      if (record.userId === userId) this.conflicts.delete(key)
    }
    this.syncStates.delete(userId)
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

  async getEntrySnapshot(userId: string, date: string): Promise<EntrySnapshot> {
    const db = await openDb()
    const key = storageKey(userId, date)
    const tx = db.transaction([ENTRY_STORE, METADATA_STORE], 'readonly')
    const entry =
      (await requestToPromise<EntryRecord | undefined>(tx.objectStore(ENTRY_STORE).get(key))) ??
      null
    const metadata =
      (await requestToPromise<MetadataRecord | undefined>(
        tx.objectStore(METADATA_STORE).get(key),
      )) ?? null
    db.close()
    return {
      entry,
      metadata,
      localGen: entryGen(entry),
      remoteRevId: entry?.remoteRevId ?? null,
    }
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
    const previousEntry =
      (await requestToPromise<EntryRecord | undefined>(tx.objectStore(ENTRY_STORE).get(key))) ??
      null
    tx.objectStore(ENTRY_STORE).put({
      ...entry,
      key,
      userId,
      localGen: entryGen(previousEntry) + 1,
      remoteRevId: metadataPatch.remoteRevisionId ?? previousEntry?.remoteRevId ?? null,
    })
    tx.objectStore(METADATA_STORE).put({ ...metadata, key, userId })
    await txDone(tx)
    db.close()
    return metadata
  }

  async commitEntry(
    userId: string,
    entry: EntryFile,
    syncStatus: SyncStatus,
    options: {
      baseGen?: number
      bumpGeneration?: boolean
      metadataPatch?: Partial<EntryMetadata>
    } = {},
  ): Promise<CommitEntryResult> {
    const db = await openDb()
    const key = storageKey(userId, entry.date)
    const tx = db.transaction([ENTRY_STORE, METADATA_STORE], 'readwrite')
    const entryStore = tx.objectStore(ENTRY_STORE)
    const metadataStore = tx.objectStore(METADATA_STORE)
    const previousEntry =
      (await requestToPromise<EntryRecord | undefined>(entryStore.get(key))) ?? null
    const currentGen = entryGen(previousEntry)
    const previousMetadata =
      (await requestToPromise<MetadataRecord | undefined>(metadataStore.get(key))) ?? null

    if (options.baseGen !== undefined && currentGen !== options.baseGen && previousEntry) {
      db.close()
      return {
        kind: 'stale',
        current: previousEntry,
        metadata: previousMetadata,
        currentGen,
      }
    }

    const metadata = {
      ...toMetadata(entry, syncStatus, previousMetadata),
      ...options.metadataPatch,
    }
    const nextGen = currentGen + (options.bumpGeneration === false ? 0 : 1)
    entryStore.put({
      ...entry,
      key,
      userId,
      localGen: nextGen,
      remoteRevId: options.metadataPatch?.remoteRevisionId ?? previousEntry?.remoteRevId ?? null,
    })
    metadataStore.put({ ...metadata, key, userId })
    await txDone(tx)
    db.close()
    return { kind: 'committed', metadata, localGen: nextGen }
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

  async getSyncState(userId: string): Promise<SyncState | null> {
    const db = await openDb()
    const tx = db.transaction(SYNC_STATE_STORE, 'readonly')
    const record = await requestToPromise<SyncState | undefined>(
      tx.objectStore(SYNC_STATE_STORE).get(userId),
    )
    db.close()
    return record ?? null
  }

  async setSyncState(userId: string, patch: Partial<SyncState>): Promise<void> {
    const db = await openDb()
    const tx = db.transaction(SYNC_STATE_STORE, 'readwrite')
    const current = await requestToPromise<SyncState | undefined>(
      tx.objectStore(SYNC_STATE_STORE).get(userId),
    )
    const next: SyncState = {
      userId,
      driveStartPageToken: null,
      driveEntriesFolderId: null,
      monthFolderIds: [],
      lastDeltaPollAt: null,
      ...current,
      ...patch,
    }
    tx.objectStore(SYNC_STATE_STORE).put(next)
    await txDone(tx)
    db.close()
  }

  async getConflict(userId: string, date: string): Promise<ConflictRecordStore | null> {
    const db = await openDb()
    const tx = db.transaction(CONFLICTS_STORE, 'readonly')
    const record = await requestToPromise<ConflictRecord | undefined>(
      tx.objectStore(CONFLICTS_STORE).get(storageKey(userId, date)),
    )
    db.close()
    return record ?? null
  }

  async setConflict(userId: string, record: ConflictRecordStore): Promise<void> {
    const db = await openDb()
    const key = storageKey(userId, record.date)
    const tx = db.transaction(CONFLICTS_STORE, 'readwrite')
    tx.objectStore(CONFLICTS_STORE).put({ ...record, key, userId })
    await txDone(tx)
    db.close()
  }

  async deleteConflict(userId: string, date: string): Promise<void> {
    const db = await openDb()
    const tx = db.transaction(CONFLICTS_STORE, 'readwrite')
    tx.objectStore(CONFLICTS_STORE).delete(storageKey(userId, date))
    await txDone(tx)
    db.close()
  }

  async listConflicts(userId: string): Promise<ConflictRecordStore[]> {
    const db = await openDb()
    const tx = db.transaction(CONFLICTS_STORE, 'readonly')
    const records = await requestToPromise<ConflictRecord[]>(
      tx.objectStore(CONFLICTS_STORE).getAll(),
    )
    db.close()
    return records.filter((r) => r.userId === userId).sort((a, b) => a.date.localeCompare(b.date))
  }

  async clearUserData(userId: string): Promise<void> {
    const db = await openDb()
    const tx = db.transaction(
      [ENTRY_STORE, METADATA_STORE, SYNC_STATE_STORE, DEVICE_IDENTITY_STORE, CONFLICTS_STORE],
      'readwrite',
    )
    await Promise.all([
      deleteByUserId(tx.objectStore(ENTRY_STORE), userId),
      deleteByUserId(tx.objectStore(METADATA_STORE), userId),
      deleteByUserId(tx.objectStore(DEVICE_IDENTITY_STORE), userId),
      deleteByUserId(tx.objectStore(CONFLICTS_STORE), userId),
      requestToPromise(tx.objectStore(SYNC_STATE_STORE).delete(userId)),
    ])
    await txDone(tx)
    db.close()
  }
}

export const localEntryCache = hasIndexedDB() ? new IndexedDbEntryCache() : new MemoryEntryCache()

async function deleteByUserId(store: IDBObjectStore, userId: string): Promise<void> {
  const records = await requestToPromise<Array<{ key: string; userId: string }>>(store.getAll())
  await Promise.all(
    records
      .filter((record) => record.userId === userId)
      .map((record) => requestToPromise(store.delete(record.key))),
  )
}
