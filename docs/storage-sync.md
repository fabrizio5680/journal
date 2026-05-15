# Storage and Sync

Quiet Dwelling is user-owned and local-first.

## Storage Boundary

- `EntryRepository` is the runtime boundary for entry access.
- `LocalEntryCache` stores entry files and metadata in IndexedDB, with an
  in-memory fallback for tests/unsupported browsers.
- Google Drive stores synced entry JSON files.
- Firestore stores auth-related metadata, preferences, reminders, FCM tokens,
  provider connection metadata, private OAuth refresh-token data, and
  `lastEntryDate` / `lastEntrySavedAt`.
- Firestore must never store journal `content`, `contentText`, revisions, or
  searchable indexes.
- Search, history, calendar dots, streaks, and insights read from the repository
  and local metadata index.
- `EntryRepository.searchEntries` accepts `filters.tags?: string[]` with AND
  semantics; an entry must contain all selected tags to match.

Entry file schema lives in `src/lib/storage/types.ts` and `entryFormat.ts`.
Current files use `schemaVersion: 1` and `app: "quiet-dwelling"`.

`ManifestEntry` is defined in `src/lib/storage/types.ts` as `{ date, mood,
moodLabel, tags, wordCount, providerFileId }`. This compact subset of full entry
metadata is stored in the Drive manifest.

## Repository Guards

- Empty entries, meaning no mood, tags, scripture, or words, stay local and are
  not pushed to Drive.
- Drive entries with a newer schema are not downgraded; they mark the entry as
  requiring reconnect/attention.

`useEntry.save()` captures `saveGenerationRef.current` before the async
`EntryRepository.saveEntry` call. `markDirty()` increments the generation counter
on every keystroke. If the generation changed during a content save, `save()`
returns `{ stale: true }` and skips `setEntry` / `setMetadata` / dirty-flag
reset, so newer typing is never overwritten by a stale result. Metadata-only
saves, with no `content` key, always commit regardless of generation.

`EntryEditor` accepts an `isDirty` prop; the content-sync `useEffect` returns
early when `isDirty` is true as defence-in-depth against editor reset. The
autosave debounce window in `EntryPage` is 800ms.

## Google Drive Sync

Drive continuity is account-level per Firebase user. One Drive account/root
folder is shared through public provider metadata on `users/{uid}`:
`activeStorageProvider`, `storageAccountEmail`, `storageRootFolderId`,
`storageConnectedAt`, and `storageTokenStatus`.

Connection uses Google Identity Services authorization-code flow. Callable
Functions in `europe-west2` exchange codes, store refresh tokens under
`users/{uid}/private/googleDriveOAuth`, ensure the `Quiet Dwelling/entries`
folder, and write only non-secret provider metadata to the public user doc.
Client rules deny access to `users/{uid}/private/**`.

The browser uploads/downloads journal JSON directly with short-lived Drive access
tokens. Cloud Functions broker OAuth tokens only; they must not store journal
bodies.

## Drive Manifest

The Drive manifest lives at `Quiet Dwelling/metadata.json`.

- It is a compact JSON array of `ManifestEntry` objects that mirrors the local
  metadata index.
- `backfillFromManifest(userId)` downloads the manifest and writes metadata-only
  rows to IndexedDB for each entry. It skips dirty entries and calls
  `EntryRepository.notifyChanged`.
- This is the fast path: insights, calendar dots, history, and metadata search
  are available immediately without downloading entry content.
- `backfillGoogleDriveMetadata` runs `backfillFromManifest` first, then proceeds
  with the full content backfill. If no manifest exists, it bootstraps one after
  the full backfill completes.
- After each successful Drive push, `syncCoordinator` rebuilds the manifest from
  the full local metadata index and uploads it to Drive. This is fire-and-forget
  and last-write-wins.

## Key Sync APIs

- `getValidGoogleDriveAccessToken` is single-flight protected.
- `driveApiFetch` is the standard Drive REST wrapper.
- `backfillFromManifest(userId)` populates the local metadata index from the
  Drive manifest without downloading entry content.
- `backfillGoogleDriveMetadata` runs manifest first, then full content backfill;
  bootstraps the manifest if none exists.
- `initDriveSyncListeners(userId)` wires boot, online, visibility, pageshow, and
  post-push delta polling triggers. At boot it also calls
  `backfillFromManifest(userId)` once, not on later online/visibility/pageshow
  events, so already-connected devices repopulate metadata on every app open.
  Call it on Drive connect/connection changes.
- `pollDriveDeltas(userId)` uses Drive Changes API state persisted in the
  IndexedDB `syncState` store.
- `GoogleDriveAdapter.getStorageUsage()` returns `{ folderBytes, driveUsage,
driveLimit }` by recursing the app root folder (`metadata.json`, `entries/`,
  and `conflicts/`) and calling Drive `about.get?fields=storageQuota`.
  `driveLimit` may be `null` for unlimited Drive accounts.

`syncCoordinator.enqueue` guards against missing a new entry when a sync run is
already in flight. If `processingUsers` holds the lock, it sets a
`newEnqueuesWhileProcessing` flag instead of calling `syncPending` directly. The
running `syncPending` checks and clears that flag in its `finally` block and
triggers a follow-up pass. This prevents `sync-pending` entries from getting
stuck when a save races a concurrent sync batch. If `syncOne` cannot find the
entry content in the local cache, it clears the stuck `sync-pending` status to
`saved-local` rather than returning silently.

## Settings Storage UI

`Disconnect Google Drive` in Settings is device-local. It clears that device's
connection/token cache and opt-outs from auto-hydration, but must not delete
shared provider metadata or break other devices.

The Settings Storage section exposes a **"Sync from Drive"** button when Drive is
connected. It calls `backfillGoogleDriveMetadata(user.uid)`, shows "Syncing..."
during the operation, surfaces progress through the global `driveLoadProgress`
banner, and surfaces errors through `storageError`.

The same section renders a **"Drive usage"** row when connected, under the
"Storage account" row. It auto-fetches `getStorageUsage()` on mount, shows `—`
while loading, and renders `folderBytes · driveUsage of driveLimit Drive used`.
The `of … Drive used` suffix is omitted when `driveLimit` is `null`. Fetch
errors are swallowed with a `console.warn` and the row stays at `—` with no
user-facing error state.

## Conflicts and Remote Updates

On Drive push conflict, `syncCoordinator` calls
`mergeEngine.mergeEntries(local, remote, remoteDeviceLabel)`.

- Body merge keeps local content first, inserts an `<hr>`, then appends remote
  content.
- Tags and scripture refs are unioned.
- Mood disagreement produces `syncStatus: 'merge-pending-mood'` and waits for
  `syncCoordinator.resolveMoodConflict(...)`.
- Before re-enqueueing a merge, `GoogleDriveAdapter.saveConflictBackup(...)`
  writes a best-effort backup under `Quiet Dwelling/conflicts/`.

`EntryPage` owns the remote update and conflict UI:

- `RemoteUpdateBanner`
- `RemoteUpdateModal`
- `MoodConflictBanner`

`useRemoteUpdateBanner` watches `remoteRevisionId` and repository changes.
