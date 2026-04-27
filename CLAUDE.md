# The Quiet Sanctuary — Project Bible

## Approach

Skip files over 100KB unless explicitly required.
Suggest running /cost when a session is running long to monitor cache ratio.

## Identity

- App name: "The Quiet Sanctuary" | Brand mark: "Reflect"
- Firebase project: `journal-manna` | Hosting: `journal-manna.web.app`

## Tech Stack

- React 19 + Vite 8 + TypeScript 6
- ESLint 9 (pinned at v9 — `eslint-plugin-import` incompatible with ESLint v10)
- Tailwind CSS v4 — CSS-first config, all tokens in `src/styles/globals.css` inside `@theme {}`, no `tailwind.config.ts`
- React Router v7
- Firebase 12 (Auth, Firestore, Hosting, Cloud Functions — Node 22)
- Tiptap v3 — rich text, JSON serialization; extensions: StarterKit, Placeholder, CharacterCount, BubbleMenu, Heading (H2 only)
- Algolia — algoliasearch v5 + react-instantsearch v7, secured API keys via Cloud Function
- date-fns v4, Recharts v3, clsx v2
- Icons: Material Symbols Outlined | Font: Manrope (both Google Fonts)

## Project Structure

```text
src/
  components/
    editor/       EntryEditor, EditorToolbar, MetadataChips, ScriptureBar
    layout/       AppShell, SideNav, RightPanel, TopBar, BottomNav
    calendar/     MiniCalendar
    search/       SearchModal, SearchFilters, SearchResultCard
    mood/         MoodPicker
    tags/         TagInput
    history/      EntryListCard, MoodSummaryBar
    insights/     MoodSparkline, TopTags
    fab/          FloatingActionBar
    auth/         LoginPage
    scripture/    ScriptureRefInput, ScriptureChip
    ui/           Chip, GlassCard, DailyScripture, ProfileSheet
  context/        SaveStatusContext, FocusModeContext, SearchContext,
                  UserPreferencesContext, EditorControlsContext
  hooks/          useEntry, useEntryDates, useStreak, useDictation,
                  useSearch, useInsights, useScriptureRef
  lib/            firebase, firestore, algolia, tiptap, scriptureParser, device
  types/          index.ts
  pages/          TodayPage, EntryPage, HistoryPage, InsightsPage, SettingsPage
  styles/         globals.css
  test/           setup.ts, firebase-mocks.ts, render.tsx
functions/src/    index.ts  (getSearchKey + sendDailyReminders)
e2e/              auth, editor, history, search, focus-mode specs
phases/           phase-1.md … phase-12.md
docs/             architecture.md, data-model.md, design-system.md, testing.md
```

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

## Dictation (Speech-to-Text)

`useDictation` uses the Web Speech API (continuous mode). Key behaviors:

- Returns `interimTranscript: string | null` — live preview of in-progress speech, flows via `EditorControlsContext.DictationControls` to `BottomNav`, `FloatingActionBar`, and `RightPanel`.
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

| Key                     | Values                         | Description                                                                                                                                                   |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pref_editor_font_size` | `small` \| `medium` \| `large` | Editor font size — device-local, never synced via Firestore. Seeded once from Firestore on first snapshot if absent; ignored and never written to after that. |
| `pref_spellcheck`       | `true` \| `false`              | Spellcheck enabled — device-local. Default `true`. Always `false` on mobile regardless of setting.                                                            |
| `scripture_<T>_<date>`  | JSON `{ text, reference }`     | Daily verse cache per translation and date.                                                                                                                   |

`UserPreferencesContext` manages `pref_editor_font_size`: initializes state from localStorage on mount (before Firestore arrives), seeds from Firestore on first snapshot when absent, and writes only to localStorage via `updateEditorFontSize` — no Firestore `updateDoc` call for font size.

## Reference Docs

| Doc                                            | Contents                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)   | Key architectural decisions — sync, auth, contexts, notifications, scripture                                                                 |
| [docs/data-model.md](docs/data-model.md)       | Firestore schema for `users` and `entries`, mood mapping; `Entry` has optional `scriptureRefs?: ScriptureRef[]` (`{ reference, passageId }`) |
| [docs/design-system.md](docs/design-system.md) | Color tokens and component patterns                                                                                                          |
| [docs/testing.md](docs/testing.md)             | E2E conventions — test emails, emulator seeding, serial mode                                                                                 |
