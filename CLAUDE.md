# The Quiet Sanctuary — Project Bible

## Approach

Skip files over 100KB unless explicitly required.
Suggest running /cost when a session is running long to monitor cache ratio.

## Identity

- App name: "The Quiet Sanctuary" | Brand mark: "Reflect"
- Firebase project: `journal-manna` | Hosting: `journal-manna.web.app`

## Tech Stack

- React 19 + Vite 8 + TypeScript 6
- ESLint 9 (pinned at v9 — `eslint-plugin-import` is incompatible with ESLint v10's API)
- Tailwind CSS v4 — CSS-first config, all tokens in `src/styles/globals.css` inside `@theme {}`, no `tailwind.config.ts`
- React Router v7
- Firebase 12 (Auth, Firestore, Hosting, Cloud Functions — Node 22)
- Tiptap v3 — rich text editor, JSON serialization, extensions: StarterKit, Placeholder, CharacterCount, BubbleMenu, Heading (H2 only)
- Algolia — algoliasearch v5 + react-instantsearch v7, secured API keys via Cloud Function
- date-fns v4, Recharts v3, clsx v2
- Icons: Material Symbols Outlined | Font: Manrope (both Google Fonts)

## Key Architectural Decisions

- **One entry per day** — document ID is `YYYY-MM-DD` under `users/{userId}/entries/{YYYY-MM-DD}`
- **Cross-device sync** — `useEntry` uses `onSnapshot`; `isDirty` flag prevents remote snapshot overwriting in-progress typing; `expectingEchoRef` counter suppresses the Firestore echo snapshot from our own saves (prevents cursor reset and content revert)
- **`contentText`** — extracted client-side via Tiptap `getText()` at save time; stored alongside `content` (Tiptap JSON) in Firestore
- **Auth** — Google Sign-In only; `signInWithPopup` on desktop, `signInWithRedirect` on mobile (userAgent detect); `getRedirectResult()` called on mount
- **Soft delete** — `deleted: true` + `deletedAt: Timestamp`; 30-day hard delete via Firestore TTL policy on `deletedAt` field (configured in Firestore console, no code)
- **Algolia** — Firebase Extension syncs Firestore → Algolia; secured key scoped `userId == auth.uid` + `deleted:false`; key fetched via `getSearchKey` Cloud Function, stored in memory only, never localStorage; `SearchModal` uses `react-instantsearch` with async client init (fetched on modal open, shown as "Loading…" until ready); `SearchContext` provides `{ isSearchOpen, openSearch, closeSearch }` — wrapped in `App.tsx`; Cmd/Ctrl+K global shortcut wired in `AppShell`; `SearchResultCard` is a separate component from `EntryListCard` because Algolia hits have `excerpt` not Tiptap `content`; E2E tests inject `window.__mockAlgoliaClient` (detected when `VITE_USE_EMULATOR=true`) to bypass the Cloud Function call
- **Dictation** — `useDictation` hook wraps Web Speech API (`continuous`, `interimResults`); only fires `onTranscript` on final results; silently restarts up to 5× on `no-speech` then idles; hidden entirely on iOS Safari (`isSupported` feature detect, no error shown); `FloatingActionBar` receives a single `dictation` prop object
- **Focus mode** — `FocusModeContext` (`src/context/FocusModeContext.tsx`) provides `{ isFocused, toggle, exit }`; wrapped around `AppShell` in `App.tsx`; each layout component (SideNav, TopBar, BottomNav, RightPanel) reads the context and applies `transition-all duration-500` + translate/opacity classes to slide off-screen; `BottomNav` Focus button is a `<button>` (not a NavLink) that calls `toggle()`; exit button appears `fixed top-4 right-4 z-50` when focused
- **EditorControlsContext** — `src/context/EditorControlsContext.tsx` bridges editor-page state (dictation, font size) to `BottomNav` without prop-drilling through `AppShell`; editor pages (`TodayPage`, `EntryPage`) call `register({dictation, fontSize, onFontSizeChange})` on mount and `unregister()` on unmount; `BottomNav` reads `isEditorActive`, `dictation`, `fontSize`, `onFontSizeChange` from this context; `register`/`unregister` are `useCallback`-stabilized to prevent infinite effect loops; word count is kept in page-local state (not in context) to avoid keystroke-triggered re-renders across the entire provider tree
- **Mobile bottom nav redesign** — `BottomNav` shows Today + Focus on all pages; on editing pages (`isEditorActive === true`) additionally shows Voice (dictation) and font size cycle button; navigation to History/Insights/Settings moved to `ProfileSheet` (slide-up bottom sheet opened by tapping avatar in `TopBar`); word count appears as a small fixed label just above the bar on entry pages only (`md:hidden`)
- **ProfileSheet** — `src/components/ui/ProfileSheet.tsx`; slide-up bottom sheet with backdrop; shows avatar (image or `person` icon placeholder), display name, History/Insights/Settings nav rows, and Sign Out; triggered by tapping the avatar button in `TopBar`
- **Desktop FloatingActionBar** — desktop-only (`hidden md:flex`); positioned `fixed bottom-10 left-64 z-40` (right of sidebar); shows Voice, font size cycle (single button cycling small→medium→large→small), and word count; Save button removed (auto-save only)
- **Offline** — Firestore IndexedDB persistence enabled in `firebase.ts`; sync status indicator watches `navigator.onLine`
- **Notifications** — `sendDailyReminders` Cloud Function (Cloud Scheduler, every 5 min); fires FCM push only if user hasn't written today; reminder time stored as `"HH:MM"` + IANA timezone on user doc. FCM token obtained via `getToken(messaging, { vapidKey })` from `VITE_FIREBASE_VAPID_KEY`; `messagingPromise` in `firebase.ts` resolves to `null` in emulator mode and unsupported browsers. `public/firebase-messaging-sw.js` is a stub — full SW config deferred to Phase 12.
- **User preferences** — `UserPreferencesContext` (`src/context/UserPreferencesContext.tsx`) provides `{ grainEnabled, scriptureTranslation, editorFontSize, updateEditorFontSize }` from the user doc via `onSnapshot`; wrapped inside `RequireAuth` in `App.tsx`; consumed by `AppShell` (grain class), `RightPanel` (translation), `EntryEditor` (font size class), `FloatingActionBar` (font cycle button), and `SettingsPage`. The context exposes `updateEditorFontSize(size)` to write directly to Firestore.
- **Grain texture** — `.grain-enabled::before` pseudo-element in `globals.css` overlays `/textures/natural-paper.png` at 4% opacity; `AppShell` adds the class when `grainEnabled` is true.
- **Daily Scripture** — fetched from scripture.api.bible (free key); 365-entry `DAILY_VERSE_IDS` array in `useDailyVerse` hook selects one verse per day via `getDayOfYear(date) % 365`; cached per translation per day in localStorage (`scripture_{translation}_{yyyy-MM-dd}`); fallback hardcoded array (cycles by day-of-year); NLT/MSG/ESV toggle per user preference. `useDailyVerse(translation, date?)` hook is the single source of truth — `DailyScripture` (sidebar) and editor pages both consume it. For today: API fetch + cache. For past dates: deterministic fallback only (no API call). `VerseBlock` component (`src/components/editor/VerseBlock.tsx`) renders the verse above `EntryEditor` on both `TodayPage` and `EntryPage` — mobile-only (`md:hidden`, desktop has sidebar). Editor `placeholder` prop also shows `"verse text — Reference"` when the verse is available (falls back to static text while loading).

## Firestore Data Model

### `users/{userId}`

```ts
{
  displayName: string
  email: string
  photoURL: string
  tagVocabulary: string[]
  reminderEnabled: boolean
  reminderTime: string           // "HH:MM"
  reminderTimezone: string       // IANA, e.g. "Europe/London"
  grainEnabled: boolean          // default true
  scriptureTranslation: 'NLT' | 'MSG' | 'ESV'  // default 'NLT'
  editorFontSize: 'small' | 'medium' | 'large'  // default 'medium'
  fcmToken: string | null
  createdAt: Timestamp
}
```

### `users/{userId}/entries/{YYYY-MM-DD}`

```ts
{
  date: string                   // "YYYY-MM-DD" — also the doc ID
  content: object                // Tiptap JSON
  contentText: string            // plain text from getText()
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  wordCount: number
  deleted: boolean
  deletedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Mood Mapping

```ts
const MOODS = [
  { value: 1, emoji: '😔', label: 'Heavy' },
  { value: 2, emoji: '😐', label: 'Neutral' },
  { value: 3, emoji: '🙂', label: 'Calm' },
  { value: 4, emoji: '😊', label: 'Peaceful' },
  { value: 5, emoji: '🥳', label: 'Radiant' },
]
```

## Design System Quick Reference

All color tokens are defined in `src/styles/globals.css` and available as Tailwind utilities.

| Token                         | Value   |
| ----------------------------- | ------- |
| `bg-background`               | #faf9f7 |
| `bg-surface-container-lowest` | #ffffff |
| `bg-surface-container-low`    | #f4f4f1 |
| `bg-surface-container`        | #edeeec |
| `text-on-surface`             | #303331 |
| `text-on-surface-variant`     | #5d605e |
| `bg-primary`                  | #526448 |
| `text-on-primary`             | #ecffdd |
| `bg-primary-container`        | #d4e9c5 |
| `bg-secondary-container`      | #eae1d4 |
| `text-on-secondary-container` | #565147 |
| `text-outline-variant`        | #b0b2b0 |

**Card:** `bg-surface-container-lowest rounded-[2rem] border border-transparent hover:border-outline-variant/10 hover:shadow-[0_4px_40px_rgba(48,51,49,0.06)] transition-all duration-500`

**Chip:** `bg-secondary-container text-on-secondary-container px-3 py-1.5 rounded-xl text-xs font-medium`

**Primary button:** `bg-primary hover:bg-primary-dim text-on-primary font-bold py-4 px-6 rounded-full shadow-sm`

**Primary FAB:** `bg-gradient-to-r from-primary to-primary-dim text-on-primary rounded-full shadow-[0_10px_40px_rgba(82,100,72,0.2)]`

**Writing area:** `bg-transparent border-none text-xl leading-[1.8] font-light text-on-surface placeholder:text-outline-variant/40`

**Active nav (desktop):** `bg-surface-container-lowest text-primary font-bold shadow-sm scale-[0.98] rounded-xl`

**Bottom nav bar:** `bg-surface/70 backdrop-blur-xl rounded-t-3xl shadow-[0_-4px_40px_rgba(48,51,49,0.06)] fixed bottom-0 left-0 w-full px-6 pb-8 pt-4`

## Project Structure

```
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
  context/          SaveStatusContext, FocusModeContext, SearchContext, UserPreferencesContext, EditorControlsContext
  hooks/
    useEntry, useEntryDates, useStreak, useDictation,
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
- Hook runs `npx lint-staged` (prettier + eslint on staged `.ts/.tsx/.css/.json/.md` files only) then `npm run typecheck` (full project — type-checking can't be scoped to staged files)
- `lint-staged` config lives in `package.json` under `"lint-staged"`

## E2E Testing Conventions

- Each spec file uses a **unique test email** (e.g. `trash-test@example.com`) to avoid cross-spec collisions.
- `clearTestUser()` signs in with the spec's test credentials and self-deletes (via `accounts:delete`) rather than wiping all emulator users. This keeps parallel specs from invalidating each other's auth tokens.
- All specs that share emulator state across tests include `test.describe.configure({ mode: 'serial' })` to prevent within-file parallelism.
- Firestore REST seeding calls (`request.patch`) **must** include `Authorization: Bearer {idToken}` — the emulator enforces security rules on the `/v1/` REST path.
- `LoginPage` has an `onAuthStateChanged` listener that navigates to `/` on sign-in; this is what makes `__signInForTest` redirect E2E tests out of the login page.

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
