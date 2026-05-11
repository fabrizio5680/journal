# Quiet Dwelling Storage Plan

## Goal

Move journal entry content out of Quiet Dwelling-managed cloud storage and into
user-owned storage, starting with Google Drive and Dropbox.

Firebase remains for app identity and non-journal metadata. Google Drive and
Dropbox become the source of truth for journal files, provider-native revision
history, and provider-native content search.

## Core Decisions

- Firebase stays for auth, preferences, reminders, FCM tokens, and provider
  connection metadata.
- Firebase must not store journal `content`, `contentText`, entry revisions, or
  searchable journal indexes.
- Firebase may store a non-content `lastEntryDate` per user so the reminder
  Cloud Function can skip users who already wrote today.
- Users choose one active storage provider at a time: Google Drive or Dropbox.
- Entries are stored as visible files in the user's provider account.
- Provider search and provider revision history are allowed because provider
  readability is an accepted tradeoff.
- IndexedDB is required for offline writing, pending sync, local cache, fast
  cached reads, and the day-1 metadata index that powers calendar dots, streaks,
  and insights without downloading every entry file.
- Entry filename date is the user's local civil date at write time, not UTC.
  Travel across timezones does not retroactively rename files.

## Provider Layout

Google Drive:

```text
My Drive/
  Quiet Dwelling/
    entries/
      2026/
        05/
          2026-05-11.json
```

Dropbox:

```text
/Apps/Quiet Dwelling/
  entries/
    2026/
      05/
        2026-05-11.json
```

For Dropbox, use app-folder access. The app folder name is fixed by the Dropbox
app config and cannot be customized per user.

For Google Drive, start with the narrow `drive.file` scope unless implementation
testing proves provider search or revision access needs broader permissions.

`drive.file` only exposes files the app itself created. Implications:

- The `Quiet Dwelling/` folder must be created by the app via the Drive API on
  first connect. A folder the user creates manually in Drive UI is invisible to
  the app.
- If the user deletes the folder in Drive UI, the app still holds file IDs but
  loses the folder. On next sync, detect missing parent and offer to recreate
  the folder plus re-link orphaned files by ID.
- Store the created `rootFolderId` in Firebase provider metadata so reconnect
  flows do not create duplicate folders.

## Entry File Format

Store one JSON file per day:

```json
{
  "schemaVersion": 1,
  "app": "quiet-dwelling",
  "date": "2026-05-11",
  "content": { "type": "doc", "content": [] },
  "searchText": "Plain searchable text...\n#mood: Hopeful\n#tags: faith gratitude",
  "mood": 3,
  "moodLabel": "Hopeful",
  "tags": ["faith", "gratitude"],
  "scriptureRefs": [],
  "wordCount": 123,
  "createdAt": "2026-05-11T08:30:00.000Z",
  "updatedAt": "2026-05-11T08:45:00.000Z"
}
```

Tiptap JSON remains canonical for rendering and editing. `searchText` is the
plain-text projection (entry body plus mood/tag tokens) used for provider
search and the local index. `contentText` is intentionally dropped — its
plain-text portion is a prefix of `searchText`.

`date` is the user's local civil date (YYYY-MM-DD) at the moment of first
write. It is also the filename stem. Once set, it does not migrate when the
user crosses timezones.

### Schema Versioning

- `schemaVersion: 1` is the current contract.
- Readers must accept unknown top-level fields (forward compatibility).
- On reading a higher `schemaVersion`, the client must surface a "this entry
  was written by a newer version of Quiet Dwelling" warning and refuse to
  overwrite. It may still render best-effort.
- Future bumps ship with a documented read-time migration.

## Architecture

Introduce a storage abstraction:

```text
EntryRepository
  LocalEntryCache        IndexedDB (entry bodies + metadata index)
  SyncCoordinator        pending writes, backoff, conflict handling
  StorageProviderAdapter Google Drive / Dropbox
```

`LocalEntryCache` maintains two stores:

- `entries` — full entry JSON, keyed by date.
- `metadata` — `{ date, mood, moodLabel, tags, wordCount, hasContent,
updatedAt, lastSeenRevisionId, syncStatus }`. Powers `MiniCalendar`,
  `useStreak`, and `InsightsPage` without round-tripping the provider.

On first connect, the SyncCoordinator paginates `listEntryMetadata` and
backfills the metadata store. Full file bodies are fetched lazily on entry
open. The user sees a `Indexing your journal…` state with progress while
backfill runs.

The app should call `EntryRepository`, not Firebase, Google Drive, or Dropbox
directly.

Suggested adapter contract:

```ts
interface StorageProviderAdapter {
  provider: 'googleDrive' | 'dropbox'

  connect(): Promise<ProviderConnection>
  disconnect(): Promise<void>

  getEntry(date: string): Promise<StoredEntry | null>
  saveEntry(entry: EntryFile, expectedRevisionId?: string): Promise<SaveResult>
  listEntryMetadata(range?: DateRange): Promise<EntryMetadata[]>

  searchEntries(query: string, filters?: SearchFilters): Promise<SearchHit[]>

  listRevisions(date: string): Promise<EntryRevisionMetadata[]>
  getRevision(date: string, revisionId: string): Promise<EntryFile>
}
```

## Offline Behavior

Writing must work without provider access.

- Saves go to IndexedDB first.
- If online and connected, sync uploads after debounce.
- If offline, revoked, or expired, entries stay pending.
- The UI must show explicit sync state:
  - `Saved locally`
  - `Sync pending`
  - `Synced to Google Drive`
  - `Synced to Dropbox`
  - `Reconnect Google Drive`
  - `Reconnect Dropbox`
  - `Conflict needs review`
  - `Provider storage full` — surfaced on Drive `storageQuotaExceeded` (HTTP 403) or Dropbox `insufficient_space`. Writes continue to IndexedDB; sync
    halts for that user until acknowledged.
  - `Indexing your journal…` — initial metadata backfill on first connect.

### Rate Limits and Backoff

- Treat 429 and 5xx as retryable with exponential backoff (start 1s, cap 60s,
  full jitter).
- Treat 401 as token-revoked: stop the sync loop, transition to
  `Reconnect …`, do not retry until the user reconnects.
- Treat 403 `storageQuotaExceeded` / `insufficient_space` as non-retryable.
  Surface `Provider storage full` and stop attempting that file until the
  next user-initiated retry.
- Bound concurrent provider requests (suggest 4) so calendar/insights
  backfill does not starve interactive saves.

## Conflict Handling

Store provider revision/version IDs in IndexedDB:

```json
{
  "date": "2026-05-11",
  "provider": "googleDrive",
  "fileId": "...",
  "lastSeenRevisionId": "...",
  "syncStatus": "synced"
}
```

Before upload, compare the provider's current revision/version ID to
`lastSeenRevisionId`.

### Per-Provider Atomicity

The two providers expose different concurrency primitives. The adapter must
hide this from `SyncCoordinator`:

- **Dropbox**: pass `mode: { ".tag": "update", "update": <rev> }` to
  `/files/upload`. Atomic — Dropbox rejects with `conflict` if `rev` is stale.
- **Google Drive**: no native `If-Match` on file content updates. Adapter must
  GET file metadata, compare `headRevisionId` to `lastSeenRevisionId`, then
  PATCH. A small race window remains; on completion, re-fetch metadata and if
  the resulting revision is not a direct successor of `lastSeenRevisionId`,
  treat as a late conflict and surface `Conflict needs review`.

### Conflict Resolution UI

If the provider file changed remotely and local unsynced edits exist, show
manual conflict resolution:

- keep local version
- use provider version
- manually copy and merge both

Do not attempt rich-text auto-merge in v1.

### Cross-Device Sync (No Local Edits)

When the local cache has `syncStatus: synced` and no pending edits, but the
provider reports a newer revision than `lastSeenRevisionId`:

- Pull the newer version silently.
- Update local cache and metadata index.
- Do not prompt the user.

This is the common "edited on phone, opened on laptop" path and must not
trigger conflict UI.

## Search

V1 search is **local-first** against the IndexedDB metadata + searchText
index. Provider search is a fallback only.

```text
SearchModal
  -> EntryRepository.searchEntries()
  -> IndexedDB searchText scan (primary)
  -> on miss / index incomplete: provider search API
  -> download matching JSON files (only when body not cached)
  -> render SearchResultCard
```

Rationale for not relying on provider-native search:

- Drive full-text search indexes the entire JSON, producing noise on schema
  keys (`"type":"doc"`, mood/tag tokens out of context).
- Dropbox content search has indexing lag.
- Each provider hit on Drive returns metadata only; downloading N matched
  JSON files per query is too slow for power users.

The IndexedDB index also unblocks offline search.

Remove Algolia for journal content.

## Revision History

Reimplement the revision UI against provider-native revisions.

- List versions for the daily JSON file.
- Preview a selected revision.
- Restore creates a new latest provider revision.
- Do not store app-owned revision subcollections in Firestore.

### Provider Retention Caveats

- **Google Drive**: revisions auto-prune after ~30 days unless pinned. On
  every successful upload, set `keepRevisionForever: true` on the new
  revision. Drive caps pinned revisions per file at 200; if approached,
  unpin the oldest pinned revisions silently.
- **Dropbox**: version history retention depends on plan (Free 30d, Plus
  180d, Business 365d). Surface the user's effective retention window in
  the revision UI so expectations are clear.

## Entry Deletion

When the user deletes an entry:

- Delete the provider file (Drive `files.delete`, Dropbox `/files/delete_v2`).
  Both providers move to provider trash, recoverable by the user from
  Drive/Dropbox UI.
- Remove the IndexedDB entry body. Mark metadata row `deletedAt` and keep
  it for 30 days to suppress re-sync of stale local copies on other devices,
  then GC.
- Update Firebase `lastEntryDate` if the deleted entry was the most recent.

Do not maintain an app-managed `_trash/` folder. Provider trash is sufficient.

## Auth And Tokens

- Firebase Auth remains app identity.
- Google Drive and Dropbox OAuth are storage authorization.
- Provider refresh/access tokens stay device-local. Each device the user signs
  in on must complete its own provider OAuth — this is intentional, and the
  Settings UI must state it so users do not expect cross-device token sync.
- Firebase may store only non-secret provider metadata:
  - active provider
  - provider account email
  - root folder ID or path
  - connected timestamp
  - `lastEntryDate` (used by the reminder Cloud Function)

### Identity Mismatch

The user may sign into Quiet Dwelling with one identity (e.g. Apple ID, or
Google account A) and connect storage with a different account (Google
account B). This is supported. The Settings → Storage panel must always show:

- App account: `<firebase email or provider> · signed in`
- Storage account: `<provider> · <storage account email> · connected`

If the two emails differ, render the storage account email in the connection
chip on the editor sync indicator so the user sees where data is going on
every screen, not only in Settings.

### Recovery From Revoked Access

On 401 from the provider:

- Stop the sync loop for that user.
- Transition status to `Reconnect Google Drive` / `Reconnect Dropbox`.
- Do **not** retry until the user explicitly reconnects.
- Local writes continue to succeed against IndexedDB.

## Reminders (FCM)

The daily-reminder Cloud Function currently queries Firestore entries to skip
users who already wrote today. With content out of Firestore, the function
loses that signal. Resolution:

- The client writes a non-content `lastEntryDate` (YYYY-MM-DD, user's local
  civil date) to the user's Firebase doc on every successful save and on
  successful sync of a pending save. This is metadata, not content, and is
  explicitly allowed.
- The Cloud Function reads `lastEntryDate` to decide whether to send the
  reminder.
- Treat a stale `lastEntryDate` (e.g. user offline for days) as "no entry
  today" — the reminder fires; this is acceptable.

The reminder stays server-side; do not migrate it to a client `scheduleNotification`.

## Migration

For the current single-user migration:

- Use `scripts/migrate-firestore-entries-to-google-drive.mjs`.
- Copy **all** Firestore entries to Google Drive, not just the latest. The
  script must paginate through the full `entries` collection, write one JSON
  per day under the documented layout, and emit a report listing every entry
  copied plus any skipped or failed.
- Filename date is derived from the entry's stored `date` field (already user
  local date) — do not re-derive from server timestamps.
- Verify the generated Google Drive files and migration report.
- Add a separate purge step later for Firestore journal content. The purge
  must keep allowed non-content metadata (`lastEntryDate`, preferences,
  provider connection metadata).

No legacy revision migration is needed.
