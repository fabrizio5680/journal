# Phase 8 — Search

## Goal

Full-text + faceted search via Algolia. Firebase Extension syncs Firestore → Algolia automatically.
Secured API key fetched via Cloud Function (scoped per user). Full-screen search modal triggered
by Cmd+K (desktop) or search icon (mobile).

## Prerequisites

- Phase 3 complete — entries being saved to Firestore with `contentText` field
- Algolia account created (free tier), index `journal_entries` created
- `firestore-algolia-search` Firebase Extension installed in `journal-manna` project

## Manual Setup Steps (before coding)

1. Create Algolia account at algolia.com — copy App ID + Admin API Key + Search-Only API Key
2. In Firebase console → Extensions → install `firestore-algolia-search`:
   - Collection path: `users/{userId}/entries`
   - Algolia index name: `journal_entries`
   - Fields to index: `date,dateTimestamp,excerpt,mood,moodLabel,tags,wordCount,userId,deleted`
   - Transform function: truncate `contentText` to 8KB for `excerpt` field
3. Set `ALGOLIA_APP_ID` and `ALGOLIA_API_KEY` in Firebase Functions config
4. Deploy the extension
5. Add your `VITE_ALGOLIA_APP_ID` to `.env.local`

## Checklist

- [ ] `functions/src/index.ts` — `getSearchKey` Cloud Function (see Cloud Function section)
- [ ] Deploy Cloud Function: `firebase deploy --only functions`
- [ ] `src/lib/algolia.ts` — init Algolia client with secured key (see Algolia Client section)
- [ ] `SearchModal.tsx` — full-screen overlay (see Modal section)
- [ ] `SearchFilters.tsx` — tag chips + mood selector + date range (see Filters section)
- [ ] Cmd/Ctrl+K global shortcut opens modal; search icon in mobile TopBar opens modal
- [ ] Result cards link to `/entry/{date}` using same `EntryListCard` style
- [ ] Empty state: illustrated prompt when no results
- [ ] **E2E**: `e2e/search.spec.ts`

## Cloud Function — getSearchKey

**Location:** `functions/src/index.ts`

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import Algolia from 'algoliasearch'

const algoliaClient = Algolia(process.env.ALGOLIA_APP_ID!, process.env.ALGOLIA_ADMIN_KEY!)

export const getSearchKey = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Login required')

  const nowPlusOneHour = Math.floor(Date.now() / 1000) + 3600

  const key = algoliaClient.generateSecuredApiKey(process.env.ALGOLIA_SEARCH_ONLY_KEY!, {
    filters: `userId:${uid} AND deleted:false`,
    validUntil: nowPlusOneHour,
    userToken: uid,
  })
  return { key }
})
```

Functions environment vars (set via `firebase functions:secrets:set`):

- `ALGOLIA_APP_ID`
- `ALGOLIA_ADMIN_KEY`
- `ALGOLIA_SEARCH_ONLY_KEY`

## Algolia Client (src/lib/algolia.ts)

```ts
import { liteClient } from 'algoliasearch/lite'
import { getFunctions, httpsCallable } from 'firebase/functions'

let securedKey: string | null = null
let keyExpiry = 0

export async function getAlgoliaClient() {
  const now = Math.floor(Date.now() / 1000)
  if (!securedKey || now >= keyExpiry - 60) {
    const fn = httpsCallable(getFunctions(), 'getSearchKey')
    const result = await fn()
    securedKey = (result.data as { key: string }).key
    keyExpiry = now + 3600
  }
  return liteClient(import.meta.env.VITE_ALGOLIA_APP_ID, securedKey)
}
```

Key is stored in module-level memory only — never in localStorage.

## SearchModal

**Location:** `src/components/search/SearchModal.tsx`

**Trigger:**

```ts
// Global keydown listener in App.tsx or AppShell:
// (e.metaKey || e.ctrlKey) && e.key === 'k' → setSearchOpen(true)
// Mobile: search icon in TopBar → setSearchOpen(true)
```

**Overlay** (`fixed inset-0 z-50 bg-on-surface/20 backdrop-blur-md flex flex-col`):

**Search input bar** (top, `bg-surface-container-lowest shadow-lg`):

```
px-6 py-4 flex items-center gap-3
search icon (text-on-surface-variant text-xl) + input (flex-1 bg-transparent text-xl outline-none) + Esc hint
```

Auto-focused on open. Esc key closes modal.

**Filters row** (`SearchFilters` component below the input)

**Results list** (scrollable, same `EntryListCard` style):

- Shows up to 20 results
- Each result links to `/entry/{date}`, closes modal on click

**Empty state** (when query is non-empty but no results):

```
text-center py-16 text-on-surface-variant
"No entries found for '{query}'"
```

Use `react-instantsearch` with `InstantSearch`, `SearchBox`, `Hits`, `RefinementList` components.

## SearchFilters

**Location:** `src/components/search/SearchFilters.tsx`

`flex flex-wrap gap-2 px-6 py-3 border-b border-outline-variant/10`

1. **Tag filter** — `RefinementList` for `tags` attribute → rendered as `Chip` toggles
2. **Mood filter** — custom: 5 emoji chips (1–5), multi-select, filter `mood` attribute
3. **Date range** — two `<input type="date">` fields, filter `dateTimestamp` with numeric range

## E2E — search.spec.ts

```ts
// Setup: sign in, create 3 entries with different tags/moods via Firestore emulator
// Note: Algolia won't be available in CI — mock the Algolia client for E2E tests
// Scenario 1: Cmd+K opens search modal with focused input
// Scenario 2: typing a word returns matching results
// Scenario 3: clicking a tag filter chip narrows results
// Scenario 4: clicking a result card navigates to /entry/{date} and closes modal
// Scenario 5: Esc closes the modal
```

## Algolia Record Structure

The Firebase Extension indexes each entry as:

```ts
{
  objectID: string     // "{userId}_{YYYY-MM-DD}"
  userId: string
  date: string         // "YYYY-MM-DD"
  dateTimestamp: number  // Unix epoch (for date range filtering)
  excerpt: string      // contentText truncated to 8KB
  mood: number | null
  moodLabel: string | null
  tags: string[]
  wordCount: number
  deleted: boolean     // filtered out by secured key — never shown in results
}
```
