import { getDeviceFingerprint } from '../deviceFingerprint'
import { toMetadata } from '../entryFormat'
import type {
  DateRange,
  EntryFile,
  EntryMetadata,
  EntryRevisionMetadata,
  ManifestEntry,
  ProviderConnection,
  SaveResult,
  SearchFilters,
  SearchHit,
  StorageProviderAdapter,
} from '../types'

import type { FakeGoogleDriveBackend } from './fakeGoogleDriveBackend'
import {
  disconnectGoogleDriveOnDevice,
  driveApiFetch,
  exchangeGoogleDriveCode,
  getStoredGoogleDriveConnection,
  requestGoogleDriveAuthorizationCode,
  setStoredGoogleDriveConnection,
} from './googleDriveAuth'
import {
  GOOGLE_DRIVE_PROVIDER,
  GOOGLE_DRIVE_ROOT_FOLDER_NAME,
  GoogleDriveError,
  type GoogleDriveStoredConnection,
} from './googleDriveTypes'

// Side-effect: initialize fake backend singleton when in fake Drive mode.
if (import.meta.env.VITE_FAKE_DRIVE === 'true' && typeof window !== 'undefined') {
  void import('./fakeGoogleDriveBackend')
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const ENTRY_MIME_TYPE = 'application/json'

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>

interface DriveFile {
  id: string
  name: string
  mimeType?: string
  headRevisionId?: string
  modifiedTime?: string
  size?: string
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function parseQuotaNumber(value: string | undefined): number | null {
  if (value === undefined || value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function entryPathParts(date: string) {
  const [year, month] = date.split('-')
  return { year, month, fileName: `${date}.json` }
}

function metadataFromDriveFile(file: DriveFile, date: string): EntryMetadata {
  return {
    date,
    mood: null,
    moodLabel: null,
    tags: [],
    wordCount: 0,
    hasContent: true,
    updatedAt: file.modifiedTime ?? new Date().toISOString(),
    provider: GOOGLE_DRIVE_PROVIDER,
    providerFileId: file.id,
    lastSeenRevisionId: file.headRevisionId ?? null,
    lastSyncedAt: file.modifiedTime,
    syncStatus: 'synced',
    deletedAt: null,
  }
}

export class GoogleDriveAdapter implements StorageProviderAdapter {
  provider = GOOGLE_DRIVE_PROVIDER

  private get fake(): FakeGoogleDriveBackend | null {
    if (typeof window === 'undefined') return null
    return (
      (window as typeof window & { __fakeDriveBackend?: FakeGoogleDriveBackend })
        .__fakeDriveBackend ?? null
    )
  }

  constructor(
    private readonly userId: string,
    private readonly loginHint?: string | null,
  ) {}

  async connect(): Promise<ProviderConnection> {
    if (this.fake) {
      return {
        provider: GOOGLE_DRIVE_PROVIDER,
        accountEmail: 'fake@example.com',
        rootFolderId: 'fake-root',
        rootPath: 'My Drive/Quiet Dwelling',
        connectedAt: new Date().toISOString(),
      }
    }
    const code = await requestGoogleDriveAuthorizationCode({
      userId: this.userId,
      loginHint: this.loginHint,
      prompt: 'consent select_account',
    })
    const connection = await exchangeGoogleDriveCode(this.userId, code)
    setStoredGoogleDriveConnection(this.userId, {
      accountEmail: connection.accountEmail,
      rootFolderId: connection.rootFolderId ?? '',
      connectedAt: connection.connectedAt,
    })

    return {
      provider: GOOGLE_DRIVE_PROVIDER,
      accountEmail: connection.accountEmail,
      rootFolderId: connection.rootFolderId,
      rootPath: `My Drive/${GOOGLE_DRIVE_ROOT_FOLDER_NAME}`,
      connectedAt: connection.connectedAt,
    }
  }

  async disconnect(): Promise<void> {
    disconnectGoogleDriveOnDevice(this.userId)
  }

  async getEntry(date: string): Promise<EntryFile | null> {
    if (this.fake) return this.fake.getEntry(date)
    const file = await this.findEntryFile(date)
    if (!file) return null
    return this.downloadEntryFile(file.id)
  }

  async getEntryByFileId(fileId: string): Promise<EntryFile> {
    if (this.fake) {
      const all = this.fake.listEntryMetadata()
      const item = all.find((m) => m.providerFileId === fileId)
      if (!item) throw new GoogleDriveError('unknown', 'Fake Drive: file not found')
      const entry = this.fake.getEntry(item.date)
      if (!entry) throw new GoogleDriveError('unknown', 'Fake Drive: entry not found')
      return entry
    }
    return this.downloadEntryFile(fileId)
  }

  async saveEntry(entry: EntryFile, expectedRevisionId?: string): Promise<SaveResult> {
    if (this.fake) return this.fake.saveEntry(entry, expectedRevisionId)
    const { monthFolderId, fileName } = await this.ensureEntryFolder(entry.date)
    const existing = await this.findFile(fileName, monthFolderId, ENTRY_MIME_TYPE)

    if (
      existing?.headRevisionId &&
      expectedRevisionId &&
      existing.headRevisionId !== expectedRevisionId
    ) {
      throw new GoogleDriveError('conflict', 'Google Drive has a newer version of this entry.')
    }

    const uploaded = existing
      ? await this.uploadFile('PATCH', `${DRIVE_UPLOAD_API}/files/${existing.id}`, entry, {
          name: fileName,
          mimeType: ENTRY_MIME_TYPE,
        })
      : await this.uploadFile('POST', `${DRIVE_UPLOAD_API}/files`, entry, {
          name: fileName,
          mimeType: ENTRY_MIME_TYPE,
          parents: [monthFolderId],
        })

    const revisionId = uploaded.headRevisionId ?? null
    return {
      metadata: {
        ...toMetadata(entry, 'synced'),
        provider: GOOGLE_DRIVE_PROVIDER,
        providerFileId: uploaded.id,
        lastSeenRevisionId: revisionId,
        lastSyncedAt: new Date().toISOString(),
      },
      revisionId,
    }
  }

  async listEntryMetadata(range?: DateRange): Promise<EntryMetadata[]> {
    if (this.fake) return this.fake.listEntryMetadata(range)
    const connection = this.getConnection()
    const entriesFolder = await this.ensureFolder('entries', connection.rootFolderId)
    const files = await this.listJsonFilesRecursive(entriesFolder)

    return files
      .map((file) => {
        const date = file.name.replace(/\.json$/, '')
        return metadataFromDriveFile(file, date)
      })
      .filter((item) => item.date.length === 10)
      .filter((item) => !range?.from || item.date >= range.from)
      .filter((item) => !range?.to || item.date <= range.to)
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  async searchEntries(_query: string, _filters?: SearchFilters): Promise<SearchHit[]> {
    return []
  }

  async listRevisions(date: string): Promise<EntryRevisionMetadata[]> {
    const file = await this.findEntryFile(date)
    if (!file) return []
    const data = await this.driveFetch<{
      revisions?: Array<{ id: string; modifiedTime?: string }>
    }>(`${DRIVE_API}/files/${file.id}/revisions?fields=revisions(id,modifiedTime)`)
    return (data.revisions ?? []).map((revision) => ({
      revisionId: revision.id,
      updatedAt: revision.modifiedTime ?? '',
    }))
  }

  async getRevision(date: string, revisionId: string): Promise<EntryFile> {
    const file = await this.findEntryFile(date)
    if (!file) throw new Error('Entry not found in Google Drive.')
    return this.driveFetch<EntryFile>(
      `${DRIVE_API}/files/${file.id}/revisions/${revisionId}?alt=media`,
    )
  }

  async saveConflictBackup(
    entry: EntryFile,
    date: string,
    remoteRevisionId: string,
  ): Promise<string | null> {
    if (this.fake) {
      return this.fake.saveConflictBackup(entry, date, remoteRevisionId)
    }
    try {
      const connection = this.getConnection()
      const conflictsFolderId = await this.ensureFolder('conflicts', connection.rootFolderId)
      const { deviceId } = await getDeviceFingerprint(this.userId)
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `${date}.${remoteRevisionId}.${deviceId}-${ts}.json`
      const uploaded = await this.uploadFile('POST', `${DRIVE_UPLOAD_API}/files`, entry, {
        name: fileName,
        mimeType: ENTRY_MIME_TYPE,
        parents: [conflictsFolderId],
      })
      return uploaded.id
    } catch (error) {
      console.warn('[GoogleDriveAdapter] saveConflictBackup failed:', error)
      return null
    }
  }

  async readManifest(): Promise<ManifestEntry[] | null> {
    if (this.fake) return this.fake.readManifest?.() ?? null
    try {
      const connection = this.getConnection()
      const file = await this.findFile('metadata.json', connection.rootFolderId, ENTRY_MIME_TYPE)
      if (!file) return null
      const data = await this.driveFetch<
        ManifestEntry[] | { schemaVersion: number; entries: ManifestEntry[] }
      >(`${DRIVE_API}/files/${file.id}?alt=media`)
      if (Array.isArray(data)) return data
      if (data && Array.isArray((data as { entries?: unknown }).entries))
        return (data as { schemaVersion: number; entries: ManifestEntry[] }).entries
      return null
    } catch {
      return null
    }
  }

  async writeManifest(entries: ManifestEntry[]): Promise<void> {
    if (this.fake) {
      this.fake.writeManifest?.(entries)
      return
    }
    try {
      const connection = this.getConnection()
      const existing = await this.findFile(
        'metadata.json',
        connection.rootFolderId,
        ENTRY_MIME_TYPE,
      )
      const manifestFile = {
        schemaVersion: 1,
        entries,
      }
      if (existing) {
        await this.uploadFile(
          'PATCH',
          `${DRIVE_UPLOAD_API}/files/${existing.id}`,
          manifestFile as unknown as EntryFile,
          { name: 'metadata.json', mimeType: ENTRY_MIME_TYPE },
        )
      } else {
        await this.uploadFile(
          'POST',
          `${DRIVE_UPLOAD_API}/files`,
          manifestFile as unknown as EntryFile,
          {
            name: 'metadata.json',
            mimeType: ENTRY_MIME_TYPE,
            parents: [connection.rootFolderId],
          },
        )
      }
    } catch (error) {
      console.warn('[GoogleDriveAdapter] writeManifest failed (non-fatal):', error)
    }
  }

  async getStorageUsage(): Promise<{
    folderBytes: number
    driveUsage: number | null
    driveLimit: number | null
  }> {
    if (this.fake) {
      return this.fake.getStorageUsage()
    }
    const connection = this.getConnection()
    const [files, about] = await Promise.all([
      this.listAllFilesRecursive(connection.rootFolderId),
      this.driveFetch<{
        storageQuota?: { limit?: string; usage?: string }
      }>(`${DRIVE_API}/about?fields=storageQuota`),
    ])

    const folderBytes = files.reduce((sum, file) => {
      const parsed = file.size ? Number(file.size) : 0
      return sum + (Number.isFinite(parsed) ? parsed : 0)
    }, 0)

    const quota = about.storageQuota ?? {}
    const driveUsage = parseQuotaNumber(quota.usage)
    const driveLimit = parseQuotaNumber(quota.limit)

    return { folderBytes, driveUsage, driveLimit }
  }

  async clearConflictBackups(): Promise<number> {
    if (this.fake) {
      return this.fake.clearConflictBackups()
    }

    const connection = this.getConnection()
    const conflictsFolder = await this.findFile(
      'conflicts',
      connection.rootFolderId,
      FOLDER_MIME_TYPE,
    )
    if (!conflictsFolder) return 0

    const files = await this.listAllFilesRecursive(conflictsFolder.id)
    await Promise.all(
      files.map((file) =>
        this.driveFetch<void>(`${DRIVE_API}/files/${file.id}`, {
          method: 'DELETE',
        }),
      ),
    )
    return files.length
  }

  private getConnection(): GoogleDriveStoredConnection {
    const connection = getStoredGoogleDriveConnection(this.userId)
    if (!connection?.rootFolderId) {
      throw new GoogleDriveError('reconnect', 'Google Drive is not connected.')
    }
    return connection
  }

  private async ensureEntryFolder(date: string) {
    const connection = this.getConnection()
    const entriesFolderId = await this.ensureFolder('entries', connection.rootFolderId)
    const { year, month, fileName } = entryPathParts(date)
    const yearFolderId = await this.ensureFolder(year, entriesFolderId)
    const monthFolderId = await this.ensureFolder(month, yearFolderId)
    return { monthFolderId, fileName }
  }

  private async findEntryFile(date: string): Promise<DriveFile | null> {
    const { monthFolderId, fileName } = await this.ensureEntryFolder(date)
    return this.findFile(fileName, monthFolderId, ENTRY_MIME_TYPE)
  }

  private async ensureFolder(name: string, parentId?: string): Promise<string> {
    const existing = await this.findFile(name, parentId, FOLDER_MIME_TYPE)
    if (existing) return existing.id

    const file = await this.driveFetch<DriveFile>(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME_TYPE,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    })
    return file.id
  }

  private async findFile(
    name: string,
    parentId?: string,
    mimeType?: string,
  ): Promise<DriveFile | null> {
    const query = [
      `name = '${escapeDriveQueryValue(name)}'`,
      'trashed = false',
      parentId ? `'${escapeDriveQueryValue(parentId)}' in parents` : undefined,
      mimeType ? `mimeType = '${escapeDriveQueryValue(mimeType)}'` : undefined,
    ]
      .filter(Boolean)
      .join(' and ')

    const params = new URLSearchParams({
      q: query,
      spaces: 'drive',
      fields: 'files(id,name,mimeType,headRevisionId,modifiedTime)',
      pageSize: '1',
    })
    const data = await this.driveFetch<{ files?: DriveFile[] }>(`${DRIVE_API}/files?${params}`)
    return data.files?.[0] ?? null
  }

  private async listJsonFilesRecursive(parentId: string): Promise<DriveFile[]> {
    const children = await this.listChildren(parentId)
    const files = children.filter((item) => item.mimeType === ENTRY_MIME_TYPE)
    const folders = children.filter((item) => item.mimeType === FOLDER_MIME_TYPE)
    const nested = await Promise.all(
      folders.map((folder) => this.listJsonFilesRecursive(folder.id)),
    )
    return files.concat(nested.flat())
  }

  private async listAllFilesRecursive(parentId: string): Promise<DriveFile[]> {
    const children = await this.listChildren(parentId)
    const files = children.filter((item) => item.mimeType !== FOLDER_MIME_TYPE)
    const folders = children.filter((item) => item.mimeType === FOLDER_MIME_TYPE)
    const nested = await Promise.all(folders.map((folder) => this.listAllFilesRecursive(folder.id)))
    return files.concat(nested.flat())
  }

  private async listChildren(parentId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = []
    let pageToken: string | undefined

    do {
      const params = new URLSearchParams({
        q: `'${escapeDriveQueryValue(parentId)}' in parents and trashed = false`,
        spaces: 'drive',
        fields: 'nextPageToken,files(id,name,mimeType,headRevisionId,modifiedTime,size)',
        pageSize: '100',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const data = await this.driveFetch<{ nextPageToken?: string; files?: DriveFile[] }>(
        `${DRIVE_API}/files?${params}`,
      )
      files.push(...(data.files ?? []))
      pageToken = data.nextPageToken
    } while (pageToken)

    return files
  }

  private async downloadEntryFile(fileId: string): Promise<EntryFile> {
    return this.driveFetch<EntryFile>(`${DRIVE_API}/files/${fileId}?alt=media`)
  }

  private async uploadFile(
    method: 'POST' | 'PATCH',
    url: string,
    entry: EntryFile,
    metadata: { name: string; mimeType: string; parents?: string[] },
  ): Promise<DriveFile> {
    const boundary = `quiet_dwelling_${crypto.randomUUID()}`
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(entry),
      `--${boundary}--`,
      '',
    ].join('\r\n')
    const params = new URLSearchParams({
      uploadType: 'multipart',
      fields: 'id,name,headRevisionId,modifiedTime',
    })

    return this.driveFetch<DriveFile>(`${url}?${params}`, {
      method,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
  }

  private async driveFetch<T>(url: string, init: FetchInit = {}): Promise<T> {
    return driveApiFetch<T>(this.userId, url, init)
  }
}
