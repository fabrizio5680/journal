import { createEntryFile, toEntry } from './entryFormat'
import { localEntryCache } from './localEntryCache'
import { mergeEntries } from './mergeEngine'
import { GoogleDriveAdapter } from './providers/googleDriveAdapter'
import { GOOGLE_DRIVE_PROVIDER } from './providers/googleDriveTypes'
import type {
  ConflictKind,
  ConflictRecord,
  ConflictRecordStore,
  EntryFile,
  Resolution,
} from './types'

import type { Entry } from '@/types'

type Listener = (records: ConflictRecord[]) => void

const listenersByUser = new Map<string, Set<Listener>>()

async function notifyListeners(userId: string) {
  const set = listenersByUser.get(userId)
  if (!set?.size) return
  const records = await conflictResolver.pending(userId)
  set.forEach((fn) => fn(records))
}

function computeKinds(local: EntryFile, remote: EntryFile): ConflictKind[] {
  const kinds: ConflictKind[] = []

  if (JSON.stringify(local.content) !== JSON.stringify(remote.content)) {
    kinds.push('content')
  }

  if (local.mood !== remote.mood) {
    kinds.push('mood')
  }

  const localTagSet = new Set(local.tags)
  const remoteTagSet = new Set(remote.tags)
  if (
    local.tags.some((t) => !remoteTagSet.has(t)) ||
    remote.tags.some((t) => !localTagSet.has(t))
  ) {
    kinds.push('tags')
  }

  const localPassages = new Set(local.scriptureRefs.map((r) => r.passageId))
  const remotePassages = new Set(remote.scriptureRefs.map((r) => r.passageId))
  if (
    local.scriptureRefs.some((r) => !remotePassages.has(r.passageId)) ||
    remote.scriptureRefs.some((r) => !localPassages.has(r.passageId))
  ) {
    kinds.push('scripture')
  }

  return kinds
}

function buildProposed(local: EntryFile, remote: EntryFile, remoteDevice: string): EntryFile {
  const { merged } = mergeEntries(local, remote, remoteDevice)

  // Force mood null for ALL mood disagreements, including local=null/remote=non-null.
  // This departs from mergeEngine's silent-adoption behaviour and forces explicit user choice.
  const moodConflict =
    (local.mood === null && remote.mood !== null) ||
    (local.mood !== null && remote.mood !== null && local.mood !== remote.mood)

  if (moodConflict) {
    return { ...merged, mood: null, moodLabel: null }
  }

  return merged
}

function toPublicRecord(store: ConflictRecordStore): ConflictRecord {
  return {
    date: store.date,
    detectedAt: store.detectedAt,
    remoteDevice: store.remoteDevice,
    kinds: store.kinds,
    proposed: toEntry(store.proposedFile),
    local: toEntry(store.localFile),
    remote: toEntry(store.remoteFile),
    backupRef: store.backupRef,
    backupStatus: store.backupStatus,
  }
}

function resolvedFileFromResolution(resolution: Resolution, store: ConflictRecordStore): EntryFile {
  switch (resolution.kind) {
    case 'accept-proposed':
      return { ...store.proposedFile, updatedAt: new Date().toISOString() }
    case 'keep-local':
      return { ...store.localFile, updatedAt: new Date().toISOString() }
    case 'keep-remote':
      return { ...store.remoteFile, updatedAt: new Date().toISOString() }
    case 'custom': {
      const e: Entry = resolution.entry
      return createEntryFile(
        store.proposedFile.date,
        {
          content: e.content,
          mood: e.mood,
          moodLabel: e.moodLabel,
          tags: e.tags,
          scriptureRefs: e.scriptureRefs,
          wordCount: e.wordCount,
          contentText: e.contentText,
        },
        store.proposedFile,
      )
    }
  }
}

export const conflictResolver = {
  async pending(userId: string): Promise<ConflictRecord[]> {
    const stores = await localEntryCache.listConflicts(userId)
    return stores.map(toPublicRecord)
  },

  /**
   * Record a new conflict. Awaits the remote backup before returning — if backup
   * fails the record is saved with backupStatus 'failed' and resolve() will be
   * blocked until retry.
   *
   * Returns the ConflictRecord AND the proposedFile (EntryFile) so the caller
   * can write it to the entries store with the appropriate syncStatus.
   */
  async record(
    userId: string,
    date: string,
    localFile: EntryFile,
    remoteFile: EntryFile,
    remoteDevice: string,
    remoteRevisionId = 'unknown',
  ): Promise<{ conflict: ConflictRecord; proposedFile: EntryFile }> {
    const existing = await localEntryCache.getConflict(userId, date)
    if (existing && existing.backupStatus !== 'failed') {
      return { conflict: toPublicRecord(existing), proposedFile: existing.proposedFile }
    }

    const kinds = computeKinds(localFile, remoteFile)
    const proposedFile = buildProposed(localFile, remoteFile, remoteDevice)

    const adapter = new GoogleDriveAdapter(userId)
    const backupRef = await adapter.saveConflictBackup(remoteFile, date, remoteRevisionId)

    const store: ConflictRecordStore = {
      date,
      detectedAt: Date.now(),
      remoteDevice,
      kinds,
      proposedFile,
      localFile,
      remoteFile,
      backupRef,
      backupStatus: backupRef ? 'saved' : 'failed',
    }

    await localEntryCache.setConflict(userId, store)
    await notifyListeners(userId)
    return { conflict: toPublicRecord(store), proposedFile }
  },

  /**
   * Resolve a pending conflict. Writes the resolved entry through localEntryCache
   * with 'sync-pending' status. Caller is responsible for re-enqueueing sync.
   *
   * Rejects if:
   * - No conflict record exists for date
   * - backup has not been saved (backupRef is null)
   * - resolution is 'accept-proposed' but proposed.mood is null and kinds includes 'mood'
   */
  async resolve(userId: string, date: string, resolution: Resolution): Promise<void> {
    const store = await localEntryCache.getConflict(userId, date)
    if (!store) throw new Error(`No conflict record for ${date}`)
    if (!store.backupRef) {
      throw new Error(
        `Conflict backup not saved for ${date} — resolve blocked until backup succeeds`,
      )
    }

    if (
      resolution.kind === 'accept-proposed' &&
      store.proposedFile.mood === null &&
      store.kinds.includes('mood')
    ) {
      throw new Error(
        `Mood conflict on ${date} requires explicit choice — use keep-local, keep-remote, or custom`,
      )
    }

    const resolvedFile = resolvedFileFromResolution(resolution, store)

    await localEntryCache.saveEntry(userId, resolvedFile, 'sync-pending', {
      provider: GOOGLE_DRIVE_PROVIDER,
      moodConflict: null,
      syncError: undefined,
      remoteRevisionId: null,
      remoteUpdatedAt: null,
    })

    await localEntryCache.deleteConflict(userId, date)
    await notifyListeners(userId)
  },

  subscribe(userId: string, fn: Listener): () => void {
    const set = listenersByUser.get(userId) ?? new Set<Listener>()
    set.add(fn)
    listenersByUser.set(userId, set)
    void conflictResolver.pending(userId).then(fn)
    return () => {
      set.delete(fn)
      if (set.size === 0) listenersByUser.delete(userId)
    }
  },
}
