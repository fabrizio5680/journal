# Quiet Dwelling — Project Bible

## Approach

Skip files over 100KB unless explicitly required.
Suggest running /cost when a session is running long to monitor cache ratio.

## Implementation Docs

Use Context7 MCP to fetch current documentation whenever implementation work touches a library, framework, SDK, API, CLI tool, or cloud service. This includes API syntax, configuration, version migrations, library-specific debugging, setup instructions, and CLI usage for project dependencies such as React, Vite, TypeScript, Tailwind CSS, React Router, Firebase, Tiptap, Algolia, date-fns, Recharts, Vitest, and Playwright.

When Context7 is needed:

1. Start with `resolve-library-id` using the library name and the implementation question, unless an exact `/org/project` library ID is already provided.
2. Pick the best match by exact name, description relevance, snippet coverage, source reputation, and benchmark score. Use version-specific IDs when the task mentions a version.
3. Call `query-docs` with the selected library ID and the full implementation question.
4. Base the implementation on the fetched docs, while still following the local project patterns first.

Do not use Context7 for refactoring that does not depend on external APIs, writing one-off scripts from scratch, debugging app-specific business logic, code review, or general programming concepts.

## Identity

- App name: "Quiet Dwelling" | Tagline: "A quiet place to reflect, pray, and journal."
- Domain: `thequietdwelling.com` | Firebase project: `journal-manna` | Hosting: `journal-manna.web.app`

## Tech Stack

- React 19 + Vite 8 + TypeScript 6
- ESLint 9 (pinned at v9 — `eslint-plugin-import` incompatible with ESLint v10)
- Tailwind CSS v4 — CSS-first config, all tokens in `src/styles/globals.css` inside `@theme {}`, no `tailwind.config.ts`
- React Router v7
- Firebase 12 (Auth, Firestore, Hosting, Cloud Functions — Node 22)
- User-owned journal storage architecture — `EntryRepository` + IndexedDB local cache owns runtime journal bodies; Google Drive stores synced entry files; Firestore is limited to auth, preferences, reminders, FCM tokens, provider connection metadata, private OAuth refresh-token storage, and `lastEntryDate`
- Tiptap v3 — rich text, JSON serialization; extensions: StarterKit, Placeholder, CharacterCount, BubbleMenu, Heading (H2 only); BubbleMenu shows bold + italic only (no persistent toolbar)
- date-fns v4, Recharts v3, clsx v2
- Icons: Material Symbols Outlined | Font: Manrope (both Google Fonts)

## Project Structure

```text
src/
  components/
    editor/       EntryEditor, MetadataBar (hidden on md+; metadata surfaced in RightPanel), MetadataSheet
    layout/       AppShell, SideNav, RightPanel, TopBar, BottomNav
    calendar/     MiniCalendar
    search/       SearchModal, SearchFilters, SearchResultCard
    mood/         MoodPicker
    tags/         TagInput
    history/      EntryListCard, MoodSummaryBar
    insights/     MoodSparkline, TopTags
    auth/         LoginPage
    scripture/    ScriptureRefInput, ScriptureChip
    ui/           Chip, GlassCard, DailyScripture, ProfileSheet
  context/        SaveStatusContext, FocusModeContext, SearchContext,
                  UserPreferencesContext, EditorControlsContext (DictationControls,
                  MetadataControls — mood/tags/scriptureRefs state+handlers)
  hooks/          useEntry, useEntryDates, useStreak, useDictation,
                  useSearch, useInsights, useScriptureRef, useToday
  lib/            firebase, storage, tiptap, scriptureParser, device
  types/          index.ts
  pages/          TodayPage, EntryPage, HistoryPage, InsightsPage, SettingsPage
  styles/         globals.css
  test/           setup.ts, firebase-mocks.ts, render.tsx
functions/src/    index.ts  (sendDailyReminders, Google Drive token broker)
e2e/              auth, editor, history, search, focus-mode specs
phases/           phase-1.md … phase-12.md
docs/             architecture.md, data-model.md, design-system.md, testing.md
```

## Mobile Metadata UX

On mobile, `MetadataBar` renders as a collapsed summary strip (mood pill + scripture count + tag count). Tapping any part opens `MetadataSheet`, a bottom sheet rendered via `ReactDOM.createPortal` to `document.body`, which contains the full editing UI for mood, scripture, and tags. `MetadataSheet` accepts an `initialSection` prop that deep-links directly to the Mood, Scripture, or Tags section on open. In focus mode (`isFocused`), `MetadataBar` slides off-screen with the same animated transition (`-translate-y-full opacity-0`) as `TopBar`.

## RightPanel UX

`RightPanel` (desktop/tablet sidebar) contains Mood, Scripture, Tags, and Daily Scripture sections. Key behaviors:

- **Mood section is always expanded** — always shows the full `MoodPicker`, which renders as a single horizontal scrollable row of pills. The internal `Section` component still accepts `collapsible`, `expanded`, and `onToggle` props (available for future use) but the Mood section no longer uses them.
- **Scripture section label is pluralized dynamically** — renders "Scripture" when count is exactly 1, "Scriptures" otherwise.
- **Tags are stored without `#` and displayed with it** — entry files store raw values (e.g. `work`, `faith`); every UI surface (chips, dropdowns, chart axes) renders them as `#work`, `#faith`. `normalizeTag` strips any leading `#` from user input before storing. When adding a new tag surface, always apply the `#` prefix at render time, never at storage time.
- **TagInput dropdown opens upward** — avoids clipping when the Tags section sits near the bottom of the panel.

## Scripts

```
npm run dev            vite dev server
npm run build          tsc && vite build
npm run lint           eslint . --max-warnings 0
npm run lint:fix       eslint . --fix
npm run format         prettier --write .
npm run format:check   prettier --check .
npm run typecheck      tsc --noEmit
npm run test           vitest run
npm run test:run       vitest run + functions tests
npm run test:coverage  vitest run --coverage
npm run test:e2e       playwright test
npm run precommit      format + lint + typecheck (manual run; also invoked by Husky)
```

## Dictation (Speech-to-Text)

`useDictation` uses the Web Speech API (continuous mode). Key behaviors:

- Returns `interimTranscript: string | null` — live preview of in-progress speech, flows via `EditorControlsContext.DictationControls` to `BottomNav`, `TabletSideBar`, and `RightPanel`.
- Explicit stop calls `abort()` (not `stop()`) to discard in-flight audio.
- Error codes handled: `not-allowed`, `service-not-allowed`, `network`, `audio-capture`, `language-not-supported` (silent en-US fallback), `aborted` (silent).
- `vitest.config.ts` excludes `.claude/**` — prevents git worktree test files from being picked up by the test runner.

## Pre-commit Hook

- **Husky v9** — `.husky/pre-commit` runs on every `git commit`
- Hook runs `npx lint-staged` (prettier + eslint on staged `.ts/.tsx/.css/.json/.md` files only) then `npm run typecheck` (full project)
- `lint-staged` config lives in `package.json` under `"lint-staged"`

## Environment Variables (.env.local)

```
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

## Cloud Functions Config

Google Drive sync uses callable Functions in `europe-west2` as a token broker. Deploy/runtime config must provide:

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

`GOOGLE_CLIENT_ID` is a Functions string param with a `process.env` fallback. `GOOGLE_CLIENT_SECRET` is a Functions secret with a `process.env` fallback for tests/emulators. The browser also needs `VITE_GOOGLE_CLIENT_ID` for Google Identity Services authorization-code popup initialization.

## Journal Storage

Runtime entry access must go through `EntryRepository` in `src/lib/storage/entryRepository.ts`. The repository writes full entry files to `LocalEntryCache` (`IndexedDB`, with an in-memory fallback for tests/unsupported browsers) and updates only non-content Firebase metadata on `users/{uid}` (`lastEntryDate`, `lastEntrySavedAt`).

Entry file contract lives in `src/lib/storage/types.ts`: `schemaVersion: 1`, `app: "quiet-dwelling"`, local civil `date`, Tiptap `content`, `searchText`, mood fields, tags, scripture refs, word count, and ISO timestamps. Do not write `content`, `contentText`, revisions, or searchable indexes to Firestore. Calendar dots, history, streaks, insights, and search read from the repository/local metadata index.

`SearchModal` is local-first and calls `EntryRepository.searchEntries()` over `searchText`; Algolia and `getSearchKey` are not part of runtime search. In emulator mode, `EntryRepository` exposes `window.__seedEntriesForTest(uid, entries)` for E2E seeding.

## Google Drive Sync

Google Drive continuity is account-level per Firebase user, not device-level. One Drive account/root folder is shared by all devices through public provider metadata on `users/{uid}`: `activeStorageProvider`, `storageAccountEmail`, `storageRootFolderId`, `storageConnectedAt`, and `storageTokenStatus`.

Connection uses Google Identity Services authorization-code flow in the browser. `exchangeGoogleDriveCode` exchanges the code in Cloud Functions, stores the refresh token at `users/{uid}/private/googleDriveOAuth`, ensures the `Quiet Dwelling/entries` Drive folder, and writes only non-secret provider metadata to the public user doc. Firestore rules deny all client reads/writes under `users/{uid}/private/**`; only Admin SDK code should access the refresh token.

The browser remains responsible for journal content. It requests short-lived Drive access tokens from `getGoogleDriveAccessToken`, then uploads/downloads entry JSON directly with Google Drive REST APIs. Cloud Functions broker OAuth tokens only; they must not store journal bodies.

Connect/hydrate flows call `backfillGoogleDriveMetadata`, which lists `Quiet Dwelling/entries`, downloads existing Drive entry JSON files sequentially, and saves valid files into `LocalEntryCache`/IndexedDB with provider metadata. This derives the local metadata index from the entry file itself (mood, `moodLabel`, tags, word count, and `searchText` tokens) so calendar dots, history, streaks, insights, and search reflect synced Drive entries after connection. If an individual Drive file is missing or invalid, backfill falls back to a metadata-only row for that file and continues; Firestore still never stores journal content or searchable indexes.

New devices hydrate the Drive connection from public metadata and request backend-minted access tokens, so no long-lived Drive token is stored in browser storage. `Disconnect Google Drive` in Settings is local/device-only: it clears local Drive connection/token cache and sets the device opt-out flag, but must not delete shared provider metadata or break other devices. Any future account-level revoke/change-account action must be explicit and guarded.

### Drive Load Progress

`src/lib/storage/driveLoadProgress.ts` is a module-singleton pub/sub that tracks active Drive loading operations. It has no external dependencies.

- `setDriveLoadProgress({ loaded, total })` — called by `backfillGoogleDriveMetadata` (listing phase: `total === 0`; indexing phase: `loaded` increments per entry) and by `EntryRepository.getEntry` for Drive cache-miss fetches (0/1 → 1/1). Callers set `null` when complete.
- `subscribeDriveLoadProgress(listener)` — returns unsubscribe fn; fires immediately with current value on subscribe.
- `SaveStatusContext` subscribes and exposes `driveLoadProgress: DriveLoadProgress | null` to all consumers.
- `RightPanel` (desktop): replaces sync status footer with spinner ("Listing entries…") or progress bar + "X / N" count when active.
- `TopBar` (mobile): replaces/overrides the center save-status label with "Listing entries…" or "Indexing X / N…" when active.

## Device-local Storage

| Key                               | Values                                                                 | Description                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pref_editor_font_size`           | `small` \| `medium` \| `large`                                         | Editor font size — device-local, never synced via Firestore. Seeded once from Firestore on first snapshot if absent; ignored and never written to after that.                                                |
| `pref_spellcheck`                 | `true` \| `false`                                                      | Spellcheck enabled — device-local. Default `true`. Always `false` on mobile regardless of setting.                                                                                                           |
| `scripture_<T>_<date>`            | JSON `{ text, reference }`                                             | Daily verse cache per translation and date.                                                                                                                                                                  |
| `fcm_device_token_<uid>`          | FCM registration token string                                          | Per-device FCM token stored on reminder enable; cleared on disable. Compared against `getToken()` on mount to detect token rotation; if rotated, old token is swapped out in Firestore `fcmTokens` silently. |
| `google_drive_connection_<uid>`   | JSON `{ accountEmail, rootFolderId, connectedAt, reconnectRequired? }` | Device-local cached Drive metadata hydrated from Firestore public provider metadata; no Drive access or refresh tokens are stored here.                                                                      |
| `google_drive_disconnected_<uid>` | `true`                                                                 | Device-local opt-out set by Settings disconnect. Prevents that device from auto-hydrating the shared account-level Drive connection.                                                                         |
| IndexedDB `quiet-dwelling`        | `entries`, `metadata` stores                                           | Device-local journal entry cache and metadata index used for offline writing, history, calendar dots, streaks, insights, and search.                                                                         |

`UserPreferencesContext` manages `pref_editor_font_size`: initializes state from localStorage on mount (before Firestore arrives), seeds from Firestore on first snapshot when absent, and writes only to localStorage via `updateEditorFontSize` — no Firestore `updateDoc` call for font size.

## Reference Docs

| Doc                                            | Contents                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)   | Key architectural decisions — sync, auth, contexts, notifications, scripture                                                                                                                                                                                                                                   |
| [docs/data-model.md](docs/data-model.md)       | Firestore user metadata, journal entry file contract, mood mapping; entry files store `mood` (numeric weight 1–5) and `moodLabel` (string — the semantic identifier within a weight pair, two moods share each weight); entries include optional `scriptureRefs?: ScriptureRef[]` (`{ reference, passageId }`) |
| [docs/design-system.md](docs/design-system.md) | Color tokens and component patterns                                                                                                                                                                                                                                                                            |
| [docs/testing.md](docs/testing.md)             | E2E conventions — test emails, emulator seeding, serial mode                                                                                                                                                                                                                                                   |
