# Quiet Dwelling - Agent Notes

Keep this file lean. It should orient a coding assistant quickly, capture durable
project rules, and point to deeper docs instead of repeating them.

## Working Rules

- Skip files over 100KB unless the task clearly requires them.
- Prefer the existing architecture and component patterns over new abstractions.
- Keep journal content out of Firestore. Runtime entry bodies must flow through
  `EntryRepository` and the local/Drive storage path.
- Do not revert unrelated local changes. This repo often has work in progress.
- For library, framework, SDK, API, CLI, or cloud-service details, use Context7
  before relying on memory. Start with library resolution, then query the selected
  docs with the full implementation question.
- Do not use Context7 for app-specific business logic, refactors that do not
  depend on external APIs, one-off scripts, or code review.

## Product

- App: Quiet Dwelling
- Tagline: A quiet place to reflect, pray, and journal.
- Domain: `thequietdwelling.com`
- Firebase project: `journal-manna`
- Hosting: `journal-manna.web.app`

## Stack

- React 19, Vite 8, TypeScript 6
- React Router 7
- Tailwind CSS 4 with CSS-first tokens in `src/styles/globals.css` under
  `@theme`; there is no `tailwind.config.ts`
- Firebase 12: Auth, Firestore, Hosting, Cloud Functions on Node 22
- Tiptap 3: StarterKit, Placeholder, CharacterCount, BubbleMenu, Heading H2 only
- date-fns 4, Recharts 3, clsx 2
- ESLint 9, Vitest, Playwright
- Material Symbols Outlined and Manrope from Google Fonts

## Commands

```sh
npm run dev            # Vite dev server
npm run build          # tsc && vite build
npm run lint           # eslint . --max-warnings 0
npm run lint:fix
npm run format
npm run format:check
npm run typecheck      # tsc --noEmit
npm run test           # vitest run
npm run test:run       # app + functions tests
npm run test:coverage
npm run test:e2e       # playwright test
npm run precommit      # format + lint + typecheck
```

Use `VITE_FAKE_DRIVE=true` for E2E sync tests. The fake Drive backend is
`src/lib/storage/providers/fakeGoogleDriveBackend.ts` and seeds from
`window.__fakeDriveSeedData`.

## Important Paths

```text
src/components/editor/    editor, metadata sheet/bar, remote-update UI
src/components/layout/    shell, nav, top bar, right panel
src/components/search/    local-first search UI
src/context/              save status, focus mode, preferences, editor controls
src/hooks/                entry, search, insights, dictation, sync hooks
src/lib/storage/          repository, cache, Drive sync, merge, delta polling
functions/src/index.ts    reminders and Google Drive token broker
docs/                     durable architecture, data model, design, testing notes
e2e/                      Playwright specs
```

## Storage Architecture

Quiet Dwelling is user-owned and local-first.

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
- `EntryRepository.searchEntries` accepts `filters.tags?: string[]` — AND
  semantics; an entry must contain all selected tags to match.

Entry file schema lives in `src/lib/storage/types.ts` and `entryFormat.ts`.
Current files use `schemaVersion: 1` and `app: "quiet-dwelling"`.

`ManifestEntry` (defined in `src/lib/storage/types.ts`): `{ date, mood,
moodLabel, tags, wordCount, providerFileId }` — the shape stored in the Drive
manifest. It is a subset of the full entry metadata, compact enough to fit all
entries in a single Drive file.

Repository push guards:

- Empty entries, meaning no mood, tags, scripture, or words, stay local and are
  not pushed to Drive.
- Drive entries with a newer schema are not downgraded; they mark the entry as
  requiring reconnect/attention.

Save race guard (`useEntry`):

- `save()` captures `saveGenerationRef.current` before the async
  `EntryRepository.saveEntry` call. `markDirty()` increments the generation
  counter on every keystroke. If the generation changed during a content save,
  `save()` returns `{ stale: true }` and skips `setEntry` / `setMetadata` /
  dirty-flag reset, so newer typing is never overwritten by a stale result.
  Metadata-only saves (no `content` key) always commit regardless of generation.
- `EntryEditor` accepts an `isDirty` prop; the content-sync `useEffect` returns
  early when `isDirty` is true — defence-in-depth against editor reset.
- The autosave debounce window in `EntryPage` is 800ms.

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

Drive manifest — `Quiet Dwelling/metadata.json`:

- A compact JSON array of `ManifestEntry` objects (`date`, `mood`, `moodLabel`,
  `tags`, `wordCount`, `providerFileId`) that mirrors the local metadata index.
- `backfillFromManifest(userId)` downloads the manifest and writes metadata-only
  rows to IndexedDB for each entry (skips dirty entries, calls
  `EntryRepository.notifyChanged`). This is the fast path: insights, calendar
  dots, history, and metadata search are available immediately without downloading
  any entry content.
- `backfillGoogleDriveMetadata` runs `backfillFromManifest` first, then proceeds
  with the full content backfill. If no manifest exists, it bootstraps one after
  the full backfill completes.
- After each successful Drive push, `syncCoordinator` rebuilds the manifest from
  the full local metadata index and uploads it to Drive (fire-and-forget,
  last-write-wins).

Key sync APIs:

- `getValidGoogleDriveAccessToken` is single-flight protected.
- `driveApiFetch` is the standard Drive REST wrapper.
- `backfillFromManifest(userId)` populates the local metadata index from the
  Drive manifest without downloading entry content.
- `backfillGoogleDriveMetadata` runs manifest first, then full content backfill;
  bootstraps the manifest if none exists.
- `initDriveSyncListeners(userId)` wires boot, online, visibility, pageshow, and
  post-push delta polling triggers. At boot it also calls
  `backfillFromManifest(userId)` once (not on subsequent online/visibility/pageshow
  events) so already-connected devices repopulate metadata on every app open.
  Call it on Drive connect/connection changes.
- `pollDriveDeltas(userId)` uses Drive Changes API state persisted in the
  IndexedDB `syncState` store.

`syncCoordinator.enqueue` guards against missing a new entry when a sync run is
already in flight: if `processingUsers` holds the lock, it sets a
`newEnqueuesWhileProcessing` flag instead of calling `syncPending` directly. The
running `syncPending` checks and clears that flag in its `finally` block and
triggers a follow-up pass. This prevents `sync-pending` entries from getting
stuck when a save races a concurrent sync batch. If `syncOne` cannot find the
entry content in the local cache, it clears the stuck `sync-pending` status to
`saved-local` rather than returning silently.

`Disconnect Google Drive` in Settings is device-local. It clears that device's
connection/token cache and opt-outs from auto-hydration, but must not delete
shared provider metadata or break other devices.

The Settings Storage section exposes a **"Sync from Drive"** button when Drive is
connected. It calls `backfillGoogleDriveMetadata(user.uid)` (full content backfill)
and shows "Syncing..." during the operation. Progress is surfaced via the global
`driveLoadProgress` banner; errors surface via `storageError`.

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

## Search and Empty States

`SearchModal` loads available tags from the local metadata index (sorted by
frequency) when it opens. `SearchFilters` renders a `TagFilter` chip row showing
tags with `#` prefix. Selecting tags narrows results to entries that contain ALL
selected tags (AND semantics). When no local entries exist and Google Drive is
not connected, `SearchModal` shows a Drive connection notice.

`InsightsPage` shows an inline Drive connection prompt when `totalEntries === 0`
and Drive is disconnected, so users understand why charts are empty.

## Navigation

- The Today button in `SideNav` and `BottomNav` navigates with
  `state: { navigatedAt: Date.now() }` so React Router always generates a new
  location key, even when the user is already at `/`. This is intentional — it
  is not a bug.
- `TodayPage` derives `today` via
  `useMemo(() => format(new Date(), 'yyyy-MM-dd'), [locationKey, reactiveToday])`.
  The `locationKey` dependency ensures a fresh `new Date()` read on every
  navigation event; `reactiveToday` (from `useToday()`) keeps midnight-rollover
  working as belt-and-suspenders.
- `BottomNav` uses a `<button>` for Today (not a `<NavLink>`). Active styling is
  computed from `pathname === '/'` rather than React Router's `isActive`.

## UI Rules Worth Preserving

- Mobile metadata lives in `MetadataBar` and `MetadataSheet`. The sheet is a
  `document.body` portal and supports `initialSection` deep links for mood,
  scripture, and tags.
- In focus mode, mobile metadata slides away with the same transition as
  `TopBar`.
- Desktop/tablet metadata lives in `RightPanel`.
- **On desktop (RightPanel), Mood renders as a dropdown** — a custom button+listbox
  with placeholder 'How are you feeling?' when unset and `emoji label` when
  selected. A '— No mood' option at the top of the list deselects the mood.
- `MoodPicker` accepts `variant?: 'pills' | 'dropdown'` (default `'pills'`).
  RightPanel passes `variant='dropdown'`; mobile MetadataSheet keeps the pill row.
- RightPanel Mood section is always expanded (never collapsible).
- RightPanel Scripture label is singular only for exactly one item.
- Tags are stored without `#` and displayed with `#`. Use `normalizeTag` before
  storing and add the prefix only at render time.
- `TagInput` dropdown opens upward in the right panel.

## Dictation

`useDictation` wraps the Web Speech API in continuous mode.

- `interimTranscript` flows through `EditorControlsContext.DictationControls`.
- Explicit stop uses `abort()` to discard in-flight audio.
- Handled errors include `not-allowed`, `service-not-allowed`, `network`,
  `audio-capture`, `language-not-supported`, and `aborted`.

## Device-Local State

Important localStorage keys:

- `pref_editor_font_size`: `small | medium | large`; device-local only.
- `pref_spellcheck`: `true | false`; always false on mobile.
- `scripture_<T>_<date>`: cached daily verse.
- `fcm_device_token_<uid>`: per-device FCM token.
- `google_drive_connection_<uid>`: cached Drive provider metadata, no tokens.
- `google_drive_disconnected_<uid>`: device opt-out for Drive auto-hydration.

IndexedDB database `quiet-dwelling` contains `entries`, `metadata`, `syncState`,
and `deviceIdentity` stores. `syncState` tracks Drive polling state such as
start-page token, entry folder ID, month folder IDs, and last poll time.
`deviceIdentity` stores account-bound device fingerprints keyed by user and
browser fingerprint; conflict attribution should use `getDeviceFingerprint(uid)`
rather than localStorage.

`UserPreferencesContext` initializes editor font size from localStorage, may seed
once from Firestore if absent, and then writes only to localStorage.

## Environment

Browser `.env.local`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=journal-manna
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_BIBLE_API_KEY=
VITE_FIREBASE_VAPID_KEY=
VITE_GOOGLE_CLIENT_ID=
```

Functions runtime:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

`GOOGLE_CLIENT_ID` has a `process.env` fallback. `GOOGLE_CLIENT_SECRET` is a
Functions secret with a `process.env` fallback for tests/emulators.

## Reference Docs

- `docs/architecture.md`: architecture decisions around sync, auth, contexts,
  notifications, and scripture.
- `docs/data-model.md`: Firestore metadata, entry file contract, mood mapping,
  and scripture refs.
- `docs/design-system.md`: tokens and component patterns.
- `docs/testing.md`: E2E conventions, emulator seeding, serial mode.
