/**
 * Fake in-memory Google Drive backend for E2E testing.
 *
 * Used when VITE_FAKE_DRIVE=true. Simulates Drive entry storage with
 * headRevisionId incrementing on write, conflict detection, and a
 * per-context conflicts/ folder.
 *
 * Exposed as window.__fakeDriveBackend for Playwright test seeding.
 */

import type { DateRange, EntryFile, EntryMetadata, ManifestEntry, SaveResult } from '../types'
import { toMetadata } from '../entryFormat'

import { GOOGLE_DRIVE_PROVIDER } from './googleDriveTypes'
import { GoogleDriveError } from './googleDriveTypes'

interface FakeEntry {
  entry: EntryFile
  headRevisionId: string
  fileId: string
}

interface ConflictBackup {
  fileName: string
  entry: EntryFile
}

let revCounter = 1

function nextRevId(): string {
  return `fake-rev-${revCounter++}`
}

function nextFileId(): string {
  return `fake-file-${revCounter++}`
}

export class FakeGoogleDriveBackend {
  private entries = new Map<string, FakeEntry>()
  private conflictBackups: ConflictBackup[] = []

  /** Seed entries for testing. Accepts partial entry fields; defaults are filled in. */
  seed(items: Array<Partial<EntryFile> & { date: string }>): void {
    for (const item of items) {
      const entry: EntryFile = {
        schemaVersion: 1,
        app: 'quiet-dwelling',
        date: item.date,
        content: item.content ?? { type: 'doc', content: [] },
        searchText: item.searchText ?? '',
        mood: item.mood ?? null,
        moodLabel: item.moodLabel ?? null,
        tags: item.tags ?? [],
        scriptureRefs: item.scriptureRefs ?? [],
        wordCount: item.wordCount ?? 0,
        createdAt: item.createdAt ?? new Date().toISOString(),
        updatedAt: item.updatedAt ?? new Date().toISOString(),
      }
      const fileId = nextFileId()
      const headRevisionId = nextRevId()
      this.entries.set(item.date, { entry, headRevisionId, fileId })
    }
  }

  getEntry(date: string): EntryFile | null {
    return this.entries.get(date)?.entry ?? null
  }

  getHeadRevisionId(date: string): string | null {
    return this.entries.get(date)?.headRevisionId ?? null
  }

  getFileId(date: string): string | null {
    return this.entries.get(date)?.fileId ?? null
  }

  saveEntry(entry: EntryFile, expectedRevisionId?: string): SaveResult {
    // E2E failure simulation hook: when window.__fakeDriveSimulate is set with
    // a positive failNextSaves counter, throw the requested GoogleDriveError code
    // and decrement the counter. Lets E2E specs drive the retry/stuck-sync paths
    // without monkey-patching the adapter. Narrowly scoped to fake backend only.
    if (typeof window !== 'undefined') {
      type WinExt = typeof window & {
        __fakeDriveSimulate?: {
          failNextSaves?: number
          errorCode?: 'retryable' | 'reconnect' | 'storage-full' | 'conflict' | 'unknown'
          errorMessage?: string
        }
      }
      const sim = (window as WinExt).__fakeDriveSimulate
      if (sim && typeof sim.failNextSaves === 'number' && sim.failNextSaves > 0) {
        sim.failNextSaves -= 1
        throw new GoogleDriveError(
          sim.errorCode ?? 'retryable',
          sim.errorMessage ?? 'Simulated fake Drive failure.',
          503,
        )
      }
    }

    const existing = this.entries.get(entry.date)

    // Conflict check: if file exists, expectedRevisionId must match headRevisionId
    if (existing && expectedRevisionId && existing.headRevisionId !== expectedRevisionId) {
      throw new GoogleDriveError('conflict', 'Fake Drive has a newer version of this entry.')
    }

    const fileId = existing?.fileId ?? nextFileId()
    const headRevisionId = nextRevId()
    this.entries.set(entry.date, { entry, headRevisionId, fileId })

    const metadata: EntryMetadata = {
      ...toMetadata(entry, 'synced'),
      provider: GOOGLE_DRIVE_PROVIDER,
      providerFileId: fileId,
      lastSeenRevisionId: headRevisionId,
      lastSyncedAt: new Date().toISOString(),
    }

    return { metadata, revisionId: headRevisionId }
  }

  listEntryMetadata(range?: DateRange): EntryMetadata[] {
    const all: EntryMetadata[] = []
    for (const [date, { entry, headRevisionId, fileId }] of this.entries) {
      if (range?.from && date < range.from) continue
      if (range?.to && date > range.to) continue
      all.push({
        ...toMetadata(entry, 'synced'),
        provider: GOOGLE_DRIVE_PROVIDER,
        providerFileId: fileId,
        lastSeenRevisionId: headRevisionId,
        lastSyncedAt: entry.updatedAt,
      })
    }
    return all.sort((a, b) => b.date.localeCompare(a.date))
  }

  saveConflictBackup(entry: EntryFile, date: string, remoteRevisionId: string): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `${date}.${remoteRevisionId}.conflict-${ts}.json`
    const fileId = `fake-conflict-${date}-${ts}`
    this.conflictBackups.push({ fileName, entry })
    return fileId
  }

  getConflictBackups(): ConflictBackup[] {
    return [...this.conflictBackups]
  }

  hasConflictBackupFor(date: string): boolean {
    return this.conflictBackups.some((b) => b.fileName.startsWith(date))
  }

  readManifest?(): ManifestEntry[] | null

  writeManifest?(entries: ManifestEntry[]): void

  getStorageUsage(): { folderBytes: number; driveUsage: number | null; driveLimit: number | null } {
    let folderBytes = 0
    for (const { entry } of this.entries.values()) {
      folderBytes += JSON.stringify(entry).length
    }
    for (const { entry } of this.conflictBackups) {
      folderBytes += JSON.stringify(entry).length
    }
    return {
      folderBytes,
      driveUsage: folderBytes,
      driveLimit: 15 * 1024 * 1024 * 1024,
    }
  }

  clear(): void {
    this.entries.clear()
    this.conflictBackups = []
  }
}

// Module-level singleton
export const fakeDriveBackend = new FakeGoogleDriveBackend()

// Expose on window for Playwright tests
if (typeof window !== 'undefined') {
  type WinExtended = typeof window & {
    __fakeDriveBackend?: FakeGoogleDriveBackend
    __setupFakeDriveConnection?: (userId: string) => void
    __fakeDriveReady?: boolean
    __fakeDriveSeedData?: Array<Partial<EntryFile> & { date: string }>
    __fakeDriveConnectionUserId?: string
  }
  const win = window as WinExtended

  win.__fakeDriveBackend = fakeDriveBackend
  win.__fakeDriveReady = true

  // Auto-seed from __fakeDriveSeedData if pre-populated by page.addInitScript
  if (win.__fakeDriveSeedData?.length) {
    fakeDriveBackend.seed(win.__fakeDriveSeedData)
  }

  // Auto-setup connection if __fakeDriveConnectionUserId was pre-populated
  if (win.__fakeDriveConnectionUserId) {
    const key = `google_drive_connection_${win.__fakeDriveConnectionUserId}`
    localStorage.setItem(
      key,
      JSON.stringify({
        accountEmail: 'fake@example.com',
        rootFolderId: 'fake-root',
        connectedAt: new Date().toISOString(),
      }),
    )
    localStorage.removeItem(`google_drive_disconnected_${win.__fakeDriveConnectionUserId}`)
  }

  // Helper for E2E: manually set Drive connection state in localStorage so the
  // app treats itself as connected to Google Drive (without real OAuth).
  win.__setupFakeDriveConnection = (userId: string) => {
    const key = `google_drive_connection_${userId}`
    localStorage.setItem(
      key,
      JSON.stringify({
        accountEmail: 'fake@example.com',
        rootFolderId: 'fake-root',
        connectedAt: new Date().toISOString(),
      }),
    )
    // Also remove any disconnect flag
    localStorage.removeItem(`google_drive_disconnected_${userId}`)
  }
}
