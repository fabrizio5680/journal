# Quiet Dwelling — Project Bible

## Approach

Skip files over 100KB unless explicitly required.
Suggest running /cost when a session is running long to monitor cache ratio.

## Identity

- App name: "Quiet Dwelling" | Tagline: "A quiet place to reflect, pray, and journal."
- Domain: `thequietdwelling.com` | Firebase project: `journal-manna` | Hosting: `journal-manna.web.app`

## Tech Stack

- React 19 + Vite 8 + TypeScript 6
- ESLint 9 (pinned at v9 — `eslint-plugin-import` incompatible with ESLint v10)
- Tailwind CSS v4 — CSS-first config, all tokens in `src/styles/globals.css` inside `@theme {}`, no `tailwind.config.ts`
- React Router v7
- Firebase 12 (Auth, Firestore, Hosting, Cloud Functions — Node 22)
- Tiptap v3 — rich text, JSON serialization; extensions: StarterKit, Placeholder, CharacterCount, BubbleMenu, Heading (H2 only); BubbleMenu shows bold + italic only (no persistent toolbar)
- Algolia — algoliasearch v5 + react-instantsearch v7, secured API keys via Cloud Function; `moodLabel` must be set as a `filterOnly` attribute in `attributesForFaceting` in the Algolia dashboard (mood filtering uses `moodLabel` facet, not the numeric `mood` field)
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
    history/      EntryListCard, MoodSummaryBar, RevisionHistoryModal
    insights/     MoodSparkline, TopTags
    auth/         LoginPage
    scripture/    ScriptureRefInput, ScriptureChip
    encryption/   EncryptionSetupModal, EncryptionUnlockModal
    ui/           Chip, GlassCard, DailyScripture, ProfileSheet
  context/        SaveStatusContext, FocusModeContext, SearchContext,
                  UserPreferencesContext, EditorControlsContext (DictationControls,
                  MetadataControls — mood/tags/scriptureRefs state+handlers),
                  RevisionHistoryContext, EncryptionContext
  hooks/          useEntry, useEntryDates, useStreak, useDictation,
                  useSearch, useInsights, useScriptureRef, useToday,
                  useEntryRevisions
  lib/            firebase, firestore, algolia, tiptap, scriptureParser, device,
                  crypto, encryptionSession, encryptionErrors
  types/          index.ts
  pages/          TodayPage, EntryPage, HistoryPage, InsightsPage, SettingsPage
  styles/         globals.css
  test/           setup.ts, firebase-mocks.ts, render.tsx
functions/src/    index.ts  (getSearchKey + sendDailyReminders)
e2e/              auth, editor, history, search, focus-mode, revisions specs
phases/           phase-1.md … phase-12.md
docs/             architecture.md, data-model.md, design-system.md, testing.md
```

## Mobile Metadata UX

On mobile, `MetadataBar` renders as a collapsed summary strip (mood pill + scripture count + tag count). Tapping any part opens `MetadataSheet`, a bottom sheet rendered via `ReactDOM.createPortal` to `document.body`, which contains the full editing UI for mood, scripture, and tags. `MetadataSheet` accepts an `initialSection` prop that deep-links directly to the Mood, Scripture, or Tags section on open. In focus mode (`isFocused`), `MetadataBar` slides off-screen with the same animated transition (`-translate-y-full opacity-0`) as `TopBar`.

## RightPanel UX

`RightPanel` (desktop/tablet sidebar) contains Mood, Scripture, Tags, and Daily Scripture sections. Key behaviors:

- **Mood section is always expanded** — always shows the full `MoodPicker`, which renders as a single horizontal scrollable row of pills. The internal `Section` component still accepts `collapsible`, `expanded`, and `onToggle` props (available for future use) but the Mood section no longer uses them.
- **Scripture section label is pluralized dynamically** — renders "Scripture" when count is exactly 1, "Scriptures" otherwise.
- **Tags are stored without `#` and displayed with it** — Firestore stores raw values (e.g. `work`, `faith`); every UI surface (chips, dropdowns, chart axes) renders them as `#work`, `#faith`. `normalizeTag` strips any leading `#` from user input before storing. When adding a new tag surface, always apply the `#` prefix at render time, never at storage time.
- **TagInput dropdown opens upward** — avoids clipping when the Tags section sits near the bottom of the panel.

## Revision History

Entries support a revision/recovery system. `useEntryRevisions` owns the revision trigger: a 30-second idle debounce fires after the user stops typing. Pages call `scheduleRevision(contentText, entry)` from `handleUpdate` and `cancelRevision()` from `handleRestore`. A revision is only written if `contentText` differs from the most recent revision's `contentText` (or no revisions exist yet); identical content is skipped. `save()` in `useEntry` takes only `data: Partial<Entry>` — it has no `revisionCallback` and no interval gate. Revisions are capped at 10 per entry (oldest pruned on write).

`RevisionHistoryContext` coordinates the modal across components that don't share a direct parent-child relationship: entry pages call `register(date, handleRestore)` on mount (and `unregister` on unmount), while `TopBar` calls `open()` when the history button is tapped. `TopBar` renders `RevisionHistoryModal` as a portal to `document.body`. The history button is only visible when `hasEntry` is true (i.e., a page has registered).

`RevisionHistoryModal` shows a list of saved revisions with relative timestamps and word counts. Selecting a revision displays a plain-text preview; the Restore button calls the registered `onRestore` handler and closes the modal.

## Client-Side Encryption

Opt-in feature in Settings → Privacy & Encryption. When enabled, `content` (Tiptap JSON) and `contentText` are encrypted with AES-256-GCM before writing to Firestore. All other fields (mood, tags, scriptureRefs) remain plaintext so insights and tag search still work.

**Key derivation**: passphrase → PBKDF2 (310,000 iterations, SHA-256) → AES-256-GCM key. A random 16-byte salt is stored per-user in `users/{uid}.encryptionSalt`. The derived key is cached in `sessionStorage` for the tab lifetime and never sent to the server.

**Canary**: on enable, `"QUIET_DWELLING_CANARY"` is encrypted and stored in `users/{uid}.encryptionCanary`. On unlock, the canary is decrypted to verify the passphrase before granting access.

**Recovery**: a 24-char alphanumeric recovery code is shown once at setup. A second key derived from the recovery code encrypts the primary key's raw bytes; the result is stored in `users/{uid}.encryptionRecoveryData`. If the passphrase is forgotten, entering the recovery code re-derives the primary key.

**Search**: when encryption is enabled, `SearchModal` shows a banner and Algolia content search is unavailable. Metadata search (tags, date, mood) still works.

**Migration**: existing plaintext entries are encrypted on next save (gradual). `contentEncrypted: boolean` on the Entry document distinguishes encrypted from plaintext entries.

`EncryptionContext` exposes `encryptFields`/`decryptFields` consumed by `useEntry` and `useEntryRevisions`. `EncryptionLockedError` is defined in `src/lib/encryptionErrors.ts` (separate file required by `react-refresh/only-export-components` ESLint rule).

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
npm run test:coverage  vitest run --coverage
npm run test:e2e       playwright test
npm run precommit      format + lint + typecheck (manual run; also invoked by Husky)
```

## Date Reactivity

`useToday` returns today's date as `yyyy-MM-dd` and stays reactive via two mechanisms: a `setTimeout` scheduled to fire at the exact local midnight (self-rescheduling for subsequent nights), and a `visibilitychange` listener for the "device woke up after midnight" case. All components that display or depend on today's date must use `useToday` — never `new Date()` at render time. Components needing a `Date` object for display formatting should call `parseISO(today)` from date-fns.

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
VITE_ALGOLIA_APP_ID=
VITE_BIBLE_API_KEY=
VITE_FIREBASE_VAPID_KEY=
# Algolia search key is fetched at runtime via Cloud Function — never in env
```

## Device-local Storage

| Key                      | Values                         | Description                                                                                                                                                                                                  |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pref_editor_font_size`  | `small` \| `medium` \| `large` | Editor font size — device-local, never synced via Firestore. Seeded once from Firestore on first snapshot if absent; ignored and never written to after that.                                                |
| `pref_spellcheck`        | `true` \| `false`              | Spellcheck enabled — device-local. Default `true`. Always `false` on mobile regardless of setting.                                                                                                           |
| `scripture_<T>_<date>`   | JSON `{ text, reference }`     | Daily verse cache per translation and date.                                                                                                                                                                  |
| `fcm_device_token_<uid>` | FCM registration token string  | Per-device FCM token stored on reminder enable; cleared on disable. Compared against `getToken()` on mount to detect token rotation; if rotated, old token is swapped out in Firestore `fcmTokens` silently. |

`UserPreferencesContext` manages `pref_editor_font_size`: initializes state from localStorage on mount (before Firestore arrives), seeds from Firestore on first snapshot when absent, and writes only to localStorage via `updateEditorFontSize` — no Firestore `updateDoc` call for font size.

## Reference Docs

| Doc                                            | Contents                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)   | Key architectural decisions — sync, auth, contexts, notifications, scripture                                                                                                                                                                                                                                                                                            |
| [docs/data-model.md](docs/data-model.md)       | Firestore schema for `users` and `entries`, mood mapping; `Entry` stores `mood` (numeric weight 1–5) and `moodLabel` (string — the semantic identifier within a weight pair, two moods share each weight); `Entry` has optional `scriptureRefs?: ScriptureRef[]` (`{ reference, passageId }`); entries have a `revisions` subcollection (capped at 10, pruned on write) |
| [docs/design-system.md](docs/design-system.md) | Color tokens and component patterns                                                                                                                                                                                                                                                                                                                                     |
| [docs/testing.md](docs/testing.md)             | E2E conventions — test emails, emulator seeding, serial mode                                                                                                                                                                                                                                                                                                            |
