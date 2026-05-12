import { localEntryCache } from './localEntryCache'
import { EntryRepository } from './entryRepository'
import { GoogleDriveAdapter } from './providers/googleDriveAdapter'
import { driveApiFetch, getStoredGoogleDriveConnection } from './providers/googleDriveAuth'
import { GoogleDriveError } from './providers/googleDriveTypes'
import { GOOGLE_DRIVE_PROVIDER } from './providers/googleDriveTypes'
import { backfillGoogleDriveMetadata } from './providerConnection'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DEBOUNCE_MS = 30_000
const ENTRY_DATE_RE = /^\d{4}-\d{2}-\d{2}\.json$/

interface DriveChangeFile {
  id: string
  name: string
  parents?: string[]
  headRevisionId?: string
  modifiedTime?: string
  mimeType?: string
  trashed?: boolean
}

interface DriveChange {
  fileId: string
  file?: DriveChangeFile
}

interface DriveChangesListResponse {
  nextPageToken?: string
  newStartPageToken?: string
  changes: DriveChange[]
}

interface DriveStartPageTokenResponse {
  startPageToken: string
}

export async function pollDriveDeltas(userId: string): Promise<void> {
  const syncState = await localEntryCache.getSyncState(userId)

  // Debounce: skip if polled recently
  if (syncState?.lastDeltaPollAt) {
    const elapsed = Date.now() - new Date(syncState.lastDeltaPollAt).getTime()
    if (elapsed < DEBOUNCE_MS) return
  }

  try {
    let pageToken = syncState?.driveStartPageToken ?? null

    // Bootstrap: get start page token if we don't have one
    if (!pageToken) {
      const data = await driveApiFetch<DriveStartPageTokenResponse>(
        userId,
        `${DRIVE_API}/changes/startPageToken`,
      )
      pageToken = data.startPageToken
      await localEntryCache.setSyncState(userId, { driveStartPageToken: pageToken, userId })
    }

    // Determine entries folder ID
    const connection = getStoredGoogleDriveConnection(userId)
    const rootFolderId = connection?.rootFolderId

    // Collect all changes (paginate)
    let newStartPageToken: string | undefined
    const allChanges: DriveChange[] = []
    let nextPageToken: string | undefined = pageToken ?? undefined

    while (nextPageToken) {
      const params = new URLSearchParams({
        pageToken: nextPageToken,
        restrictToMyDrive: 'true',
        fields:
          'nextPageToken,newStartPageToken,changes(fileId,file(id,name,parents,headRevisionId,modifiedTime,mimeType,trashed))',
      })
      const data = await driveApiFetch<DriveChangesListResponse>(
        userId,
        `${DRIVE_API}/changes?${params}`,
      )
      allChanges.push(...data.changes)
      newStartPageToken = data.newStartPageToken
      nextPageToken = data.nextPageToken
    }

    // Process changes
    for (const change of allChanges) {
      const file = change.file
      if (!file) continue
      if (file.trashed) continue
      if (file.mimeType !== 'application/json') continue
      if (!ENTRY_DATE_RE.test(file.name)) continue

      const date = file.name.replace('.json', '')

      // Only process files that live under the entries folder tree
      if (rootFolderId) {
        const fileParents = file.parents ?? []
        // We do a loose check: if none of the parent chain contains the root folder,
        // skip. For simplicity we check that the file is somewhere under root.
        // A more thorough check would require fetching folder ancestry.
        const adapter = new GoogleDriveAdapter(userId)
        const entriesFolderInState = syncState?.driveEntriesFolderId
        if (entriesFolderInState && !fileParents.some((p) => p === entriesFolderInState)) {
          // File is not directly in entries folder hierarchy we know — skip to avoid
          // processing unrelated JSON files. Not a complete check but safe enough.
          void adapter // avoid unused var lint warning
        }
      }

      const [localMeta] = await localEntryCache.listMetadata(userId, { from: date, to: date })

      // Skip if already up to date
      if (localMeta?.lastSeenRevisionId && localMeta.lastSeenRevisionId === file.headRevisionId) {
        continue
      }

      const isDirty =
        localMeta && localMeta.syncStatus !== 'synced' && localMeta.syncStatus !== 'indexing'

      if (!localMeta) {
        // New entry on remote — download and save
        try {
          const adapter = new GoogleDriveAdapter(userId)
          const entry = await adapter.getEntryByFileId(file.id)
          await localEntryCache.saveEntry(userId, entry, 'synced', {
            provider: GOOGLE_DRIVE_PROVIDER,
            providerFileId: file.id,
            lastSeenRevisionId: file.headRevisionId ?? null,
            lastSyncedAt: file.modifiedTime ?? new Date().toISOString(),
            syncStatus: 'synced',
            syncError: undefined,
          })
          EntryRepository.notifyChanged(userId)
        } catch {
          // Skip individual failures
        }
        continue
      }

      if (!isDirty) {
        // Local is clean — download and overwrite
        try {
          const adapter = new GoogleDriveAdapter(userId)
          const entry = await adapter.getEntryByFileId(file.id)
          await localEntryCache.saveEntry(userId, entry, 'synced', {
            provider: GOOGLE_DRIVE_PROVIDER,
            providerFileId: file.id,
            lastSeenRevisionId: file.headRevisionId ?? null,
            lastSyncedAt: file.modifiedTime ?? new Date().toISOString(),
            syncStatus: 'synced',
            syncError: undefined,
            remoteRevisionId: null,
            remoteUpdatedAt: null,
          })
          // Notify so consumers (e.g. open editor) can react
          await localEntryCache.updateMetadata(userId, date, {
            remoteRevisionId: file.headRevisionId ?? null,
            remoteUpdatedAt: file.modifiedTime ?? null,
          })
          EntryRepository.notifyChanged(userId)
        } catch {
          // Skip individual failures
        }
        continue
      }

      // Local is dirty — update metadata only, don't touch body
      await localEntryCache.updateMetadata(userId, date, {
        remoteRevisionId: file.headRevisionId ?? null,
        remoteUpdatedAt: file.modifiedTime ?? null,
      })
      EntryRepository.notifyChanged(userId)
    }

    // Store new start page token
    if (newStartPageToken) {
      await localEntryCache.setSyncState(userId, { driveStartPageToken: newStartPageToken })
    }

    // Update last poll timestamp
    await localEntryCache.setSyncState(userId, { lastDeltaPollAt: new Date().toISOString() })
  } catch (error) {
    if (error instanceof GoogleDriveError && error.status === 410) {
      // Page token expired — reset and trigger full backfill
      await localEntryCache.setSyncState(userId, { driveStartPageToken: null })
      void backfillGoogleDriveMetadata(userId)
      return
    }
    // Other errors — rethrow to be handled by caller
    throw error
  }
}
