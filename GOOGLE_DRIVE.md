# Google Drive Storage Plan

## Goal

Implement Google Drive as the first user-owned journal storage provider for
Quiet Dwelling.

Firebase Auth remains the app identity layer. Google Drive OAuth is a separate
storage authorization step. Journal entry content continues to write locally
first, then syncs to Drive when the device has provider access.

## Current State

Implemented:

- `EntryRepository` owns runtime entry reads and writes.
- `LocalEntryCache` stores full entry files and metadata in IndexedDB, with an
  in-memory fallback.
- Firestore receives only allowed non-content metadata such as `lastEntryDate`
  and `lastEntrySavedAt`.
- Storage provider types already exist in `src/lib/storage/types.ts`.
- UI has basic local/offline sync language, but the desktop sidebar currently
  renders a hardcoded "Synced" state when online.
- A one-off migration script can write legacy Firestore entries to Drive using
  local OAuth, but this is not part of app runtime.

Not implemented:

- User-facing Google Drive connect/reconnect/disconnect UI.
- Runtime Drive OAuth.
- Runtime Google Drive adapter.
- Sync coordinator.
- Drive folder/file creation from the web app.
- Provider metadata backfill.
- Drive revision handling.
- Conflict handling UI.

## Product Decisions

- Start with Google Drive only. Keep Dropbox types intact for future work, but
  do not expose Dropbox UI yet.
- Use the narrow Google Drive `drive.file` scope for MVP.
- Drive connect is per device. Tokens are device-local and are not synced
  through Firestore.
- The app must clearly distinguish:
  - App account: Firebase authenticated account.
  - Storage account: Google Drive account connected for journal files.
- The Drive account may differ from the app account.
- Local writes must continue even if Drive is disconnected, offline, revoked,
  or full.
- Firestore must never store journal content, searchable journal text,
  revisions, or provider access/refresh tokens.

## Firestore Metadata

Store only non-secret provider connection metadata on `users/{uid}`:

```ts
{
  activeStorageProvider?: 'googleDrive'
  storageAccountEmail?: string
  storageRootFolderId?: string
  storageConnectedAt?: Timestamp
}
```

Do not store:

- Google access tokens.
- Google refresh tokens.
- Journal entry content.
- Search indexes.
- Entry revisions.

## Local Metadata

Extend local entry metadata to support provider sync:

```ts
{
  provider?: 'googleDrive'
  providerFileId?: string
  lastSeenRevisionId: string | null
  lastSyncedAt?: string
  syncStatus:
    | 'saved-local'
    | 'sync-pending'
    | 'synced'
    | 'reconnect'
    | 'conflict'
    | 'storage-full'
    | 'indexing'
  syncError?: string
}
```

Local metadata remains the source for fast calendar dots, history, streaks,
insights, and local search.

## Drive Layout

Create app-owned visible files in the user's Drive:

```text
My Drive/
  Quiet Dwelling/
    entries/
      YYYY/
        MM/
          YYYY-MM-DD.json
```

With `drive.file`, the app can only manage files it created or files the user
explicitly opened with the app. Therefore, the app must create the root folder
and store `storageRootFolderId` in Firestore metadata.

## Runtime Modules

Suggested structure:

```text
src/lib/storage/
  entryRepository.ts
  localEntryCache.ts
  syncCoordinator.ts
  providerConnection.ts
  providers/
    googleDriveAuth.ts
    googleDriveAdapter.ts
    googleDriveTypes.ts
```

### `googleDriveAuth`

Responsibilities:

- Start Google Drive OAuth with `drive.file`.
- Return a valid access token for adapter calls.
- Keep token state device-local.
- Surface reconnect-needed when authorization cannot be refreshed.
- Fetch the connected Drive account email.

### `googleDriveAdapter`

Implements `StorageProviderAdapter`:

```ts
interface StorageProviderAdapter {
  provider: 'googleDrive'

  connect(): Promise<ProviderConnection>
  disconnect(): Promise<void>

  getEntry(date: string): Promise<EntryFile | null>
  saveEntry(entry: EntryFile, expectedRevisionId?: string): Promise<SaveResult>
  listEntryMetadata(range?: DateRange): Promise<EntryMetadata[]>

  searchEntries(query: string, filters?: SearchFilters): Promise<SearchHit[]>

  listRevisions(date: string): Promise<EntryRevisionMetadata[]>
  getRevision(date: string, revisionId: string): Promise<EntryFile>
}
```

MVP may defer `searchEntries`, `listRevisions`, and `getRevision` until the
basic connect and sync path is working.

### `syncCoordinator`

Responsibilities:

- Observe local pending entries.
- Upload pending writes after local save.
- Mark entries as `sync-pending`, `synced`, `reconnect`, `storage-full`, or
  `conflict`.
- Retry retryable failures with exponential backoff and jitter.
- Stop retrying on revoked access until the user reconnects.
- Bound concurrent provider requests.

## EntryRepository Changes

Keep the current local-first behavior:

1. Save entry to IndexedDB.
2. Update allowed Firestore metadata.
3. Emit local repository change.
4. Enqueue provider sync if Drive is connected on this device.

`EntryRepository` should still be the app-facing API. UI and hooks should not
call Google Drive directly.

## Settings UI

Add a Storage section to `SettingsPage`.

Display:

- App account: `<firebase email or provider> · signed in`
- Storage account:
  - `Not connected`
  - `Google Drive · <email> · connected`
  - `Google Drive · reconnect needed`

Actions:

- `Connect Google Drive`
- `Reconnect Google Drive`
- `Disconnect Google Drive`

Copy requirements:

- State that Drive connection is per device.
- State that entries save locally even without Drive access.
- If the Firebase email and Drive email differ, show the Drive email clearly.

## Sync Status UI

Replace hardcoded sync language with real provider status.

Surfaces:

- `TopBar` mobile/local save line.
- `RightPanel` desktop sync indicator.
- Any editor-adjacent save status surfaces.

States:

- `Saved locally`
- `Sync pending`
- `Synced to Google Drive`
- `Reconnect Google Drive`
- `Conflict needs review`
- `Provider storage full`
- `Indexing your journal...`

If the Drive account email differs from the app account email, include the
Drive email in the editor sync indicator.

## Connect Flow

1. User opens Settings.
2. User clicks `Connect Google Drive`.
3. App starts Google OAuth for `drive.file`.
4. App fetches connected account email.
5. App creates or verifies the `Quiet Dwelling` root folder.
6. App stores non-secret metadata in Firestore.
7. App stores token state locally.
8. App starts metadata backfill.
9. App syncs pending local entries.

## Disconnect Flow

1. User clicks `Disconnect Google Drive`.
2. App clears local token state.
3. App clears local provider connection state.
4. App removes or clears Firestore provider metadata.
5. Local entries remain available.
6. Future writes stay `saved-local`.

Do not delete Drive files on disconnect.

## Reconnect Flow

On Drive `401`:

1. Stop the sync loop.
2. Mark affected pending entries as `reconnect`.
3. Keep local writes working.
4. Show `Reconnect Google Drive`.
5. Retry only after explicit user reconnect.

## First Connect Backfill

On first successful connection:

1. List app-created files under `Quiet Dwelling/entries`.
2. Build or refresh the local metadata index.
3. Avoid downloading every entry body eagerly.
4. Fetch full entry JSON lazily when an entry is opened.
5. Show `Indexing your journal...` with progress if backfill is long enough to
   be visible.

## Save Flow

1. User edits an entry.
2. Autosave writes to IndexedDB.
3. UI shows `Saved locally` or `Sync pending`.
4. Sync coordinator uploads JSON to Drive.
5. Adapter returns file id and revision id.
6. Local metadata updates to `synced`.
7. UI shows `Synced to Google Drive`.

## Conflict Handling

MVP detection:

- Before upload, compare Drive `headRevisionId` with local
  `lastSeenRevisionId`.
- If Drive has changed and local changes are pending, mark `conflict`.
- Do not overwrite automatically.

MVP resolution may be a simple modal:

- Keep local version.
- Use Drive version.

Full rich-text merge can be deferred.

## Error Handling

Retry with backoff:

- HTTP `429`
- HTTP `5xx`
- transient network failures

Stop until user action:

- HTTP `401` -> `Reconnect Google Drive`
- Drive `storageQuotaExceeded` -> `Provider storage full`

Always preserve local writes.

## Testing Plan

Unit tests:

- Drive auth state transitions.
- Drive adapter request construction with mocked `fetch`.
- Folder creation and path lookup.
- Upload create vs update.
- `401` maps to reconnect.
- Quota errors map to storage full.
- Retryable errors enter backoff.

Repository/coordinator tests:

- Local save succeeds without Drive.
- Local save enqueues sync when connected.
- Sync success stores provider file id and revision id.
- Reconnect state stops retries.
- Pending entries survive reload.

Component tests:

- Settings Storage section disconnected state.
- Connected state with matching app/storage emails.
- Connected state with mismatched emails.
- Reconnect state.
- Disconnect action confirmation/state update.

E2E tests:

- Use a fake provider adapter, not real Google Drive.
- Sign in via emulator.
- Connect fake Drive.
- Write an entry.
- Verify local save then synced status.
- Simulate revoked provider and verify reconnect status.

## Suggested Milestones

### Milestone 1: Connection UI and Metadata

- Add Settings Storage section.
- Add provider metadata read/write helpers.
- Add disconnected/connected/reconnect UI states.
- No real Drive API calls yet.

### Milestone 2: Drive OAuth and Root Folder

- Add Google Drive OAuth.
- Create or verify `Quiet Dwelling` root folder.
- Store `storageRootFolderId`, `storageAccountEmail`, and
  `storageConnectedAt`.

### Milestone 3: Basic Entry Sync

- Implement create/update JSON file upload.
- Sync pending local saves to Drive.
- Store provider file id and revision id locally.
- Replace hardcoded sync indicator.

### Milestone 4: Backfill and Lazy Reads

- List existing Drive entry metadata.
- Backfill local metadata.
- Fetch full file body lazily on entry open.

### Milestone 5: Reconnect, Quota, and Backoff

- Add robust retry policy.
- Add reconnect handling.
- Add provider-full handling.
- Add user-facing status copy.

### Milestone 6: Revisions and Conflicts

- List Drive revisions.
- Restore a revision by creating a new latest revision.
- Detect conflicts.
- Add conflict resolution UI.

## Open Questions

- Should local token state live in IndexedDB or localStorage?
- Do we need a backend token broker for longer-lived refresh behavior, or is
  explicit per-device reconnect acceptable for MVP?
- Should `providerFileId` remain purely local, or may it be stored in Firestore
  as non-content metadata? The current storage plan only calls out root folder
  ID, so default to local only.
- Should first connect upload all existing local entries immediately, or only
  sync entries touched after connection plus a user-triggered "Upload local
  journal" action?
- How much revision UI is needed before launch?

## Non-Goals For Drive MVP

- Dropbox support.
- Rich-text merge.
- Provider-native search.
- Full revision browser.
- Deleting Drive files.
- Migrating every legacy Firestore entry from inside the web app.
