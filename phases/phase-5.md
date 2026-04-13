# Phase 5 — Date Navigation + History

## Goal

Build the History page: mini-calendar with entry dots, entry list cards, month mood summary,
and the `/entry/:date` route for editing past entries.

## Prerequisites

- Phase 3 complete — `useEntry` works, `EntryEditor` works
- Phase 4 complete — mood + tags save correctly (needed for mood dots on calendar)

## Checklist

- [ ] `useEntryDates.ts` — returns set of `YYYY-MM-DD` strings that have entries for a given month
- [ ] `MiniCalendar.tsx` — 7-col month grid with entry dots, today highlight, month nav (see Calendar section)
- [ ] `MoodSummaryBar.tsx` — 4 colored bars + static italic caption (see MoodSummary section)
- [ ] `EntryListCard.tsx` — date label + title + excerpt + mood chip + arrow (see Card section)
- [ ] `HistoryPage.tsx` — editorial header + bento grid: calendar left, cards right (see History section)
- [ ] `EntryPage.tsx` — `/entry/:date`, same editor layout as TodayPage, same auto-save
- [ ] **Unit**: `useEntryDates.test.ts`
- [ ] **Unit**: `MiniCalendar.test.tsx`
- [ ] **Unit**: `EntryListCard.test.tsx`
- [ ] **E2E**: `e2e/history.spec.ts`

## useEntryDates

**Location:** `src/hooks/useEntryDates.ts`

```ts
function useEntryDates(userId: string, year: number, month: number): Set<string>
// Query: users/{userId}/entries
//   where deleted == false
//   where date >= "YYYY-MM-01"
//   where date <= "YYYY-MM-31"
// Returns Set of "YYYY-MM-DD" strings that have entries
// Uses onSnapshot for live updates
```

## MiniCalendar

**Location:** `src/components/calendar/MiniCalendar.tsx`

**Props:** `{ selectedDate?: string, onDateSelect: (date: string) => void }`

**Layout** (`bg-surface-container-low rounded-[2rem] p-8`):

**Header row:** `← {Month} {Year} →` — chevron buttons (`chevron_left`, `chevron_right`) + month/year `text-base font-bold`

**Day labels row:** Sun–Sat in `text-[10px] uppercase tracking-widest text-on-surface-variant`

**Date grid** (`grid grid-cols-7 gap-1`):

Date cell states:

| State             | Classes                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Today             | `bg-primary-container text-primary font-bold rounded-full`                                        |
| Has entry         | `font-medium text-on-surface` + `w-1 h-1 bg-primary rounded-full mx-auto mt-0.5` dot below number |
| Selected          | `bg-primary text-on-primary rounded-full`                                                         |
| Hover             | `hover:bg-primary-container/20 rounded-full transition-colors`                                    |
| Out of month      | `text-on-surface-variant opacity-30`                                                              |
| Today + has entry | `bg-primary-container text-primary rounded-full` + dot                                            |

Each cell: `w-9 h-9 flex flex-col items-center justify-center cursor-pointer text-sm`

**Footer:** `MoodSummaryBar` component

## MoodSummaryBar

**Location:** `src/components/history/MoodSummaryBar.tsx`

**Props:** `{ entries: Entry[] }` — entries for the current calendar month

**Mood bars:** 4 `h-1 rounded-full` bars, each proportional to count of that mood range:

```
Heavy+Neutral (1-2): bg-secondary-dim
Calm (3):            bg-tertiary
Peaceful (4):        bg-primary-fixed-dim
Radiant (5):         bg-primary
```

**Static caption logic** (derived from average mood, `text-xs italic text-on-surface-variant mt-2`):

```ts
avg < 2   → "A heavy month — be gentle with yourself."
avg < 3   → "A mixed month — some light, some shadow."
avg < 4   → "A calm month — steady and grounded."
avg < 4.5 → "A peaceful month — you're finding your rhythm."
avg >= 4.5 → "A radiant month — your light is shining."
no entries → "No entries yet this month."
```

## EntryListCard

**Location:** `src/components/history/EntryListCard.tsx`

**Props:** `{ entry: Entry }`

`bg-surface-container-lowest rounded-[2rem] p-6 border border-transparent hover:border-outline-variant/10 hover:shadow-[0_4px_40px_rgba(48,51,49,0.06)] transition-all duration-500 cursor-pointer`

Layout:

```
[Date label — text-[10px] uppercase tracking-widest font-black text-on-surface-variant]
[Title — text-2xl font-bold text-on-surface]               [Mood chip — top right]
[Excerpt — line-clamp-2 text-on-surface-variant text-sm leading-relaxed]
                                                            [→ arrow_forward icon]
```

- Title: first H2 node text from Tiptap JSON, or first 60 chars of `contentText`
- Excerpt: `contentText` first 120 chars, `line-clamp-2`
- Mood chip: `Chip` component with emoji + label (hidden if mood is null)
- Arrow shifts on hover: `group-hover:translate-x-1 transition-transform`
- Clicking card navigates to `/entry/{date}`

## HistoryPage

**Location:** `src/pages/HistoryPage.tsx`

**Header** (`mb-16`):

```
text-[3.5rem] font-bold tracking-tight text-on-surface  → "Past Chapters"
text-on-surface-variant max-w-xl text-lg leading-relaxed → subtitle
```

Plus an "Insights →" link in the header row (mobile shortcut to `/insights`).

**Bento grid** (`grid grid-cols-1 lg:grid-cols-12 gap-8`):

- Left: `MiniCalendar` (`lg:col-span-5`)
- Right: entry cards column (`lg:col-span-7`)
  - Count label: `{n} entries` in `text-[10px] uppercase tracking-widest font-bold`
  - List of `EntryListCard` components, ordered by date DESC
  - Only entries where `deleted == false`

**State management:** `selectedMonth` state drives `useEntryDates` + the entry list query.
Clicking a calendar date navigates to `/entry/{date}`.

## EntryPage

**Location:** `src/pages/EntryPage.tsx`

```ts
// 1. Get date from useParams() — validate format YYYY-MM-DD
// 2. useEntry(date) — same hook as TodayPage
// 3. Render identical layout to TodayPage
// 4. TopBar shows the historical date (not "today")
// 5. Auto-save identical 1.5s debounce
// 6. Back button/link in TopBar → navigate(-1) or /history
```

## Unit Tests

### useEntryDates.test.ts

```ts
// - returns empty set when no entries
// - maps Firestore snapshots to Set of date strings correctly
// - excludes deleted entries
// - updates when new entry added to snapshot
```

### MiniCalendar.test.tsx

```ts
// - renders correct number of day cells for month
// - today's date has today styles
// - dates with entries have dot indicators
// - clicking a date calls onDateSelect with correct YYYY-MM-DD
// - clicking next month chevron advances month, prev chevron goes back
// - out-of-month dates are dimmed
```

### EntryListCard.test.tsx

```ts
// - renders date label formatted correctly
// - renders title derived from contentText
// - renders truncated excerpt
// - renders mood chip when mood is set
// - does not render mood chip when mood is null
// - clicking card navigates to /entry/{date}
```

## E2E — history.spec.ts

```ts
// Setup: sign in, create 3 entries via Firestore emulator with different dates + moods
// Scenario 1: calendar shows dots on dates with entries
// Scenario 2: clicking a date navigates to /entry/{YYYY-MM-DD}
// Scenario 3: entry cards render title and excerpt correctly
// Scenario 4: month navigation shows/hides dots correctly
```
