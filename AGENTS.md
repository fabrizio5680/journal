# The Quiet Sanctuary

## Working Guidelines

- Treat `CLAUDE.md` as the project bible and keep this file aligned with it when project conventions change.
- Skip files over 100 KB unless they are explicitly required for the task.
- Protect existing user changes. Check `git status --short` before editing and do not revert unrelated work.
- Do not edit `.env.local` or commit secrets. Algolia search keys are fetched at runtime via a Cloud Function and should not be added to env files.

## Project Identity

- App name: The Quiet Sanctuary
- Brand mark: Reflect
- Firebase project: `journal-manna`
- Hosting target: `journal-manna.web.app`

## Stack

- React 19, Vite 8, TypeScript 6, React Router v7
- Tailwind CSS v4 with CSS-first config. Tokens live in `src/styles/globals.css` inside `@theme {}`. There is no `tailwind.config.ts`.
- ESLint 9 is intentionally pinned. Do not upgrade to ESLint 10 while `eslint-plugin-import` is incompatible.
- Firebase 12 for Auth, Firestore, Hosting, and Cloud Functions on Node 22.
- Tiptap v3 for rich text JSON serialization. Current editor extensions are StarterKit, Placeholder, CharacterCount, BubbleMenu, and Heading with H2 only.
- Algolia uses `algoliasearch` v5 and `react-instantsearch` v7. Secured API keys come from a Cloud Function.
- UI uses Material Symbols Outlined for icons and Manrope from Google Fonts.

## Repository Map

- `src/components/editor/`: `EntryEditor`, `MetadataBar`
- `src/components/layout/`: `AppShell`, `SideNav`, `RightPanel`, `TopBar`, `BottomNav`
- `src/components/calendar/`: `MiniCalendar`
- `src/components/search/`: `SearchModal`, `SearchFilters`, `SearchResultCard`
- `src/components/mood/`: `MoodPicker`
- `src/components/tags/`: `TagInput`
- `src/components/history/`: `EntryListCard`, `MoodSummaryBar`
- `src/components/insights/`: `MoodSparkline`, `TopTags`
- `src/components/fab/`: `FloatingActionBar`
- `src/components/auth/`: `LoginPage`
- `src/components/scripture/`: `ScriptureRefInput`, `ScriptureChip`
- `src/components/ui/`: shared UI including `Chip`, `GlassCard`, `DailyScripture`, `ProfileSheet`
- `src/context/`: save status, focus mode, search, user preferences, and editor controls contexts
- `src/hooks/`: entry, date, streak, dictation, search, insights, scripture, and today hooks
- `src/lib/`: Firebase, Firestore, Algolia, Tiptap, scripture parser, and device helpers
- `src/pages/`: `TodayPage`, `EntryPage`, `HistoryPage`, `InsightsPage`, `SettingsPage`
- `src/test/`: Vitest setup, Firebase mocks, and render helpers
- `functions/src/index.ts`: Cloud Functions including `getSearchKey` and `sendDailyReminders`
- `e2e/`: Playwright specs for auth, editor, history, search, and focus mode
- `docs/`: architecture, data model, design system, and testing notes

## Commands

- Install dependencies with `npm install` at the repo root. Cloud Functions dependencies are under `functions/`.
- Start the app with `npm run dev`.
- Start local emulator-backed dev with `npm run dev:local`.
- Build with `npm run build`.
- Lint with `npm run lint`; auto-fix with `npm run lint:fix`.
- Format with `npm run format`; check formatting with `npm run format:check`.
- Typecheck with `npm run typecheck`.
- Run unit tests with `npm run test`.
- Run coverage with `npm run test:coverage`.
- Run Playwright E2E tests with `npm run test:e2e`.
- Run deploy readiness checks with `npm run check:deploy`.
- Run the full verification suite with `npm run verify:all`.

## Verification

- For narrow frontend or hook changes, run the most relevant Vitest tests plus `npm run typecheck`.
- For shared behavior, contexts, routing, Firebase integration, or search behavior, also run `npm run lint` and `npm run test`.
- For user-facing flows that affect auth, editor, history, search, focus mode, or navigation, run the relevant Playwright tests from `e2e/`.
- Before deployment-oriented changes, run `npm run check:deploy`.
- The pre-commit hook runs `npx lint-staged` and full `npm run typecheck`; keep staged files formatted.

## Implementation Notes

- Tiptap content is serialized as JSON. Preserve the existing BubbleMenu behavior: bold and italic only, with no persistent toolbar.
- `useDictation` uses the Web Speech API in continuous mode. Explicit stop should call `abort()` to discard in-flight audio.
- Dictation exposes `interimTranscript: string | null` through `EditorControlsContext.DictationControls` to `BottomNav`, `FloatingActionBar`, and `RightPanel`.
- Handled dictation errors include `not-allowed`, `service-not-allowed`, `network`, `audio-capture`, `language-not-supported`, and `aborted`.
- Keep `vitest.config.ts` excluding `.claude/**` so worktree test files are not picked up.
- `pref_editor_font_size` and `pref_spellcheck` are device-local preferences. Do not sync editor font size back to Firestore.
- `UserPreferencesContext` seeds `pref_editor_font_size` from Firestore only when localStorage is absent, then writes updates only to localStorage.
- Scripture cache keys use `scripture_<T>_<date>` with JSON `{ text, reference }`.
- `Entry` stores `mood` as numeric weight 1-5 and `moodLabel` as the semantic identifier. Scripture references are optional `scriptureRefs?: ScriptureRef[]`.

## Reference Docs

- Read `docs/architecture.md` for sync, auth, contexts, notifications, and scripture architecture.
- Read `docs/data-model.md` before changing Firestore schema, entry shape, mood mapping, or scripture reference data.
- Read `docs/design-system.md` before changing colors, tokens, or component patterns.
- Read `docs/testing.md` before changing E2E setup, test users, emulator seeding, or serial-mode tests.
