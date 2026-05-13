import type { Entry, ScriptureRef } from '@/types'

export type StorageProvider = 'googleDrive' | 'dropbox'

export type SyncStatus =
  | 'saved-local'
  | 'sync-pending'
  | 'synced'
  | 'reconnect'
  | 'conflict'
  | 'storage-full'
  | 'indexing'
  | 'merge-pending-mood'

export interface SyncState {
  userId: string
  driveStartPageToken: string | null
  driveEntriesFolderId: string | null
  monthFolderIds: string[]
  lastDeltaPollAt: string | null
}

export interface DateRange {
  from?: string
  to?: string
}

export interface EntryFile {
  schemaVersion: 1
  app: 'quiet-dwelling'
  date: string
  content: object
  searchText: string
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  scriptureRefs: ScriptureRef[]
  wordCount: number
  createdAt: string
  updatedAt: string
}

export interface EntryMetadata {
  date: string
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  wordCount: number
  hasContent: boolean
  updatedAt: string
  provider?: StorageProvider
  providerFileId?: string
  lastSeenRevisionId: string | null
  lastSyncedAt?: string
  syncStatus: SyncStatus
  syncError?: string
  deletedAt: string | null
  remoteRevisionId?: string | null
  remoteUpdatedAt?: string | null
  mergedFromDeviceId?: string | null
  moodConflict?: {
    remoteMood: 1 | 2 | 3 | 4 | 5 | null
    remoteMoodLabel: string | null
    remoteDeviceLabel: string
  } | null
}

export type EntryState =
  | { kind: 'empty' }
  | { kind: 'draft'; entry: Entry }
  | { kind: 'committed'; entry: Entry; gen: number }

export interface WriteSaveRequest {
  date: string
  baseGen?: number
  changes: EntryDraft
  origin: 'user-edit' | 'merge-result' | 'remote-pull'
}

export type WriteSaveResult =
  | { kind: 'committed'; entry: Entry; metadata: EntryMetadata; gen: number }
  | { kind: 'stale'; current: Entry; metadata: EntryMetadata | null; currentGen: number }

export interface ProviderConnection {
  provider: StorageProvider
  accountEmail: string
  rootFolderId?: string
  rootPath?: string
  connectedAt: string
}

export interface SaveResult {
  metadata: EntryMetadata
  revisionId: string | null
}

export interface ManifestEntry {
  date: string
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  wordCount: number
  providerFileId: string
}

export interface SearchFilters {
  dateFrom?: string
  dateTo?: string
  moodLabels?: string[]
  tags?: string[]
}

export interface SearchHit {
  objectID: string
  date: string
  excerpt: string
  mood: number | null
  moodLabel: string | null
  tags: string[]
  wordCount: number
}

export interface EntryRevisionMetadata {
  revisionId: string
  updatedAt: string
}

export interface StorageProviderAdapter {
  provider: StorageProvider
  connect(): Promise<ProviderConnection>
  disconnect(): Promise<void>
  getEntry(date: string): Promise<EntryFile | null>
  saveEntry(entry: EntryFile, expectedRevisionId?: string): Promise<SaveResult>
  listEntryMetadata(range?: DateRange): Promise<EntryMetadata[]>
  searchEntries(query: string, filters?: SearchFilters): Promise<SearchHit[]>
  listRevisions(date: string): Promise<EntryRevisionMetadata[]>
  getRevision(date: string, revisionId: string): Promise<EntryFile>
}

export type EntryDraft = Partial<Omit<Entry, 'contentText'>> & {
  contentText?: string
}
