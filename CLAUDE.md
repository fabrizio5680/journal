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
    editor/       EntryEditor, EditorToolbar, MetadataChips
    layout/       AppShell, SideNav, RightPanel, TopBar, BottomNav
    calendar/     MiniCalendar
    search/       SearchModal, SearchFilters, SearchResultCard
    mood/         MoodPicker
    tags/         TagInput
    history/      EntryListCard, MoodSummaryBar, TrashEntryCard
    insights/     MoodSparkline, TopTags
    fab/          FloatingActionBar
    auth/         LoginPage
    ui/           Chip, GlassCard, DailyScripture, ProfileSheet
  context/        SaveStatusContext, FocusModeContext, SearchContext,
                  UserPreferencesContext, EditorControlsContext
  hooks/          useEntry, useEntryDates, useStreak, useDictation,
                  useSearch, useInsights
  lib/            firebase, firestore, algolia, tiptap
  types/          index.ts
  pages/          TodayPage, EntryPage, HistoryPage, InsightsPage,
                  TrashPage, SettingsPage
  styles/         globals.css
  test/           setup.ts, firebase-mocks.ts, render.tsx
functions/src/    index.ts  (getSearchKey + sendDailyReminders)
e2e/              auth, editor, history, search, focus-mode, trash specs
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

## Phase Index

| Phase                          | Focus                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------- |
| [Phase 1](phases/phase-1.md)   | Foundation — scaffold, Tailwind, Firebase, auth, ESLint, Prettier, testing, CI/CD |
| [Phase 2](phases/phase-2.md)   | App Shell — layout, sidebar, top bar, bottom nav, right panel, useStreak          |
| [Phase 3](phases/phase-3.md)   | Core Editor — Tiptap, auto-save, FloatingActionBar, TodayPage                     |
| [Phase 4](phases/phase-4.md)   | Mood + Tags — MoodPicker, TagInput, tagVocabulary                                 |
| [Phase 5](phases/phase-5.md)   | History — MiniCalendar, EntryListCard, HistoryPage, EntryPage                     |
| [Phase 6](phases/phase-6.md)   | Dictation — useDictation, BubbleMenu wire-up                                      |
| [Phase 7](phases/phase-7.md)   | Focus Mode — useFocusMode, hide chrome                                            |
| [Phase 8](phases/phase-8.md)   | Search — Algolia extension, getSearchKey, SearchModal                             |
| [Phase 9](phases/phase-9.md)   | Soft Delete + Trash — delete flow, TrashPage, TTL                                 |
| [Phase 10](phases/phase-10.md) | Insights — useInsights, MoodSparkline, TopTags                                    |
| [Phase 11](phases/phase-11.md) | Settings + Notifications — SettingsPage, FCM, sendDailyReminders                  |
| [Phase 12](phases/phase-12.md) | PWA + Polish — service worker, skeletons, empty states, grain, mobile QA          |

## Reference Docs

| Doc                                            | Contents                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)   | Key architectural decisions — sync, auth, contexts, notifications, scripture |
| [docs/data-model.md](docs/data-model.md)       | Firestore schema for `users` and `entries`, mood mapping                     |
| [docs/design-system.md](docs/design-system.md) | Color tokens and component patterns                                          |
| [docs/testing.md](docs/testing.md)             | E2E conventions — test emails, emulator seeding, serial mode                 |
