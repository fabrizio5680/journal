# Phase 2 — App Shell

## Goal

Build the authenticated application shell: three-column desktop layout, mobile bottom nav,
top bar, and the right panel with daily scripture. Wire all stub routes. Add `useStreak`
so the sidebar shows live streak data from day one. Write the auth E2E spec.

## Prerequisites

- Phase 1 complete — scaffold, Tailwind tokens, Firebase auth, routing stubs all in place

## Checklist

- [ ] `AppShell.tsx` — three-column layout wrapper (see Layout section)
- [ ] `SideNav.tsx` — desktop left sidebar (see SideNav section)
- [ ] `TopBar.tsx` — fixed top bar (see TopBar section)
- [ ] `BottomNav.tsx` — mobile glassmorphism bottom nav, 4 items (see BottomNav section)
- [ ] `RightPanel.tsx` — xl-only right panel: DailyScripture + sync status (see RightPanel section)
- [ ] `DailyScripture.tsx` — daily Bible verse from scripture.api.bible (see DailyScripture section)
- [ ] `useStreak.ts` — queries consecutive entry dates, returns `{ current: number, longest: number }`
- [ ] Routes all render within `AppShell`: `/`, `/entry/:date`, `/history`, `/insights`, `/settings`, `/trash`
- [ ] Auth state: unauthenticated users redirected to `/login`; authenticated users redirected from `/login` to `/`
- [ ] **E2E**: `e2e/auth.spec.ts` — sign-in redirects to `/`; unauthenticated access to `/` redirects to `/login`

## Layout — AppShell

```
Desktop (md+):
┌─────────────┬──────────────────────┬─────────────────┐
│  SideNav    │   <Outlet />         │   RightPanel    │
│  w-64 fixed │   flex-1 md:ml-64    │   w-80 fixed    │
│             │   xl:mr-80           │   xl only       │
└─────────────┴──────────────────────┴─────────────────┘

Mobile (<md):
┌────────────────────────────────┐
│  TopBar (fixed top)            │
├────────────────────────────────┤
│  <Outlet />                    │
│  pb-24 (space for BottomNav)   │
├────────────────────────────────┤
│  BottomNav (fixed bottom)      │
└────────────────────────────────┘
```

## SideNav

`w-64 fixed left-0 top-0 h-screen bg-surface-container-low flex flex-col px-4 py-8 hidden md:flex`

**Top section:**

- Logo mark: `w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center` + `edit_note` icon
- Brand: "Reflect" `text-xl font-black` + "The Quiet Sanctuary" `text-xs text-on-surface-variant`

**Nav items** (active / inactive states):

```
Active:   bg-surface-container-lowest text-primary font-bold shadow-sm scale-[0.98] rounded-xl px-4 py-3
Inactive: text-on-surface-variant hover:bg-surface-bright rounded-xl px-4 py-3 transition-colors duration-300
```

Items: Journal (`edit_note`), History (`calendar_month`), Insights (`bar_chart`), Settings (`settings`)

**Bottom section** (mt-auto):

- "New Entry" button: `bg-primary hover:bg-primary-dim text-on-primary font-bold py-3 px-4 rounded-full w-full`
- User avatar (`photoURL`, `w-8 h-8 rounded-full`) + displayName + streak badge: `🔥 {current} day streak` in `text-xs text-on-surface-variant`

## TopBar (mobile only, `md:hidden`)

`fixed top-0 left-0 right-0 z-40 bg-surface/80 backdrop-blur-md px-4 py-3 flex items-center justify-between`

- Left: day of week `text-xs uppercase tracking-[0.2em] text-on-surface-variant` + date `text-lg font-bold text-primary`
- Center: "Draft saved Xm ago" `text-xs text-on-surface-variant` (hidden when no active entry)
- Right: search icon button (`search`) + avatar `w-8 h-8 rounded-full`

## BottomNav (mobile only, `md:hidden`)

```
bg-surface/70 backdrop-blur-xl rounded-t-3xl
shadow-[0_-4px_40px_rgba(48,51,49,0.06)]
fixed bottom-0 left-0 w-full px-6 pb-8 pt-4
flex items-center justify-around
```

Four items: Entry (`edit_note`), History (`calendar_month`), Focus (`visibility_off`), Settings (`settings`)

```
Active mobile:   bg-primary-container text-primary rounded-full p-3 scale-95 flex flex-col items-center
Inactive mobile: text-on-surface-variant p-3 hover:text-primary flex flex-col items-center
```

Label: `text-[10px] mt-1` below icon

## RightPanel (`hidden xl:flex`, `w-80 fixed right-0 top-0 h-screen`)

`bg-surface border-l border-outline-variant/10 flex flex-col gap-6 px-6 py-8`

**DailyScripture card** (see component below)

**Sync status** (`flex items-center gap-2 text-xs text-on-surface-variant mt-auto`):

- Online: `cloud_done` icon + "Synced to Cloud"
- Offline: `cloud_off` icon + "Offline — changes will sync" (watch `navigator.onLine` + `online`/`offline` events)

## DailyScripture Component

**Location:** `src/components/ui/DailyScripture.tsx`

Fetches verse of the day from `scripture.api.bible`. Translation preference comes from user doc
(`scriptureTranslation`, default `'NLT'`). In Phase 2, read translation from user doc if available,
otherwise default to NLT. Full translation toggle UI is wired in Phase 11 (Settings).

**API endpoint:**

```
GET https://api.scripture.api.bible/v1/bibles/{bibleId}/verses/{verseId}?content-type=text&include-verse-numbers=false
Authorization: {VITE_BIBLE_API_KEY}
```

Bible IDs: `NLT = "65eec8e0b60e656b-01"`, `MSG = "65eec8e0b60e656b-02"` (verify at dashboard), `ESV = "de4e12af7f28f599-01"`

**Daily verse selection:** use a hardcoded array of 52 verse references (one per week),
select by `Math.floor(dayOfYear / 7) % verses.length`.

**Caching:** store fetched verse in `localStorage` as
`scripture_{translation}_{YYYY-MM-DD}`. On load, check cache first; only fetch if missing.

**Fallback** (offline / API error):

```ts
const FALLBACK_VERSES = [
  { reference: 'Psalm 46:10', text: 'Be still, and know that I am God.' },
  {
    reference: 'Philippians 4:13',
    text: 'I can do everything through Christ, who gives me strength.',
  },
  // ...8 more
]
```

**UI** (`bg-surface-container-low rounded-[2rem] p-6`):

- `format_quote` Material Symbol icon `text-primary text-2xl`
- Verse text: `text-sm leading-relaxed font-light text-on-surface italic`
- Reference: `text-[10px] uppercase tracking-widest font-bold text-primary mt-3`
- Translation badge: `text-[10px] text-on-surface-variant` (e.g. "NLT")

## useStreak

**Location:** `src/hooks/useStreak.ts`

```ts
// Returns { current: number, longest: number }
// Query: users/{userId}/entries where deleted == false, ordered by date DESC, limit 365
// Current streak: count consecutive dates back from today with an entry
// Longest streak: sliding window over all fetched dates
```

Uses `onSnapshot` for live updates.

## E2E — auth.spec.ts

```ts
// Scenario 1: unauthenticated user visiting / redirects to /login
// Scenario 2: after sign-in (emulator mock), user lands on /
// Use Firebase Emulator Auth — create test user via REST API in beforeEach
// VITE_USE_EMULATOR=true connects app to emulator
```
