# Phase 9 — Soft Delete + Trash

## Goal

Allow entries to be deleted (soft delete: `deleted: true`), recovered within 30 days
from a Trash page, and permanently hard-deleted after 30 days via Firestore TTL policy.

## Prerequisites

- Phase 3 complete — `useEntry` exists and saves entries

## Checklist

- [ ] Delete button on `EntryPage` / `TodayPage` — confirmation dialog before deleting
- [ ] `useEntry.ts` — add `deleteEntry()` method: sets `deleted: true`, `deletedAt: serverTimestamp()`
- [ ] `useEntry.ts` — add `restoreEntry()` method: sets `deleted: false`, `deletedAt: null`
- [ ] `TrashPage.tsx` — lists soft-deleted entries with restore + permanent delete options (see TrashPage section)
- [ ] History page + Today page: filter out `deleted == true` entries (already in query if using `where('deleted', '==', false)`)
- [ ] **Manual step**: configure Firestore TTL policy in Firebase console on `deletedAt` field for `entries` collection (30-day TTL)
- [ ] **Unit**: `useEntry` delete sets `deleted: true` + `deletedAt`; restore clears both fields
- [ ] **E2E**: delete → gone from History → appears in Trash → restore → back in History

## Delete Flow

**Delete button** location: overflow menu (`more_vert` icon) in `TopBar` on entry pages, or a delete icon in `EntryListCard` on long-press (desktop: visible in card hover state).

**Confirmation dialog** (`bg-surface-container-lowest rounded-[2rem] p-8 shadow-xl`):

```
"Move to Trash?"
"This entry will be permanently deleted after 30 days."
[Cancel]  [Move to Trash]
```

Cancel: `bg-surface-container text-on-surface rounded-full py-3 px-6`
Confirm: `bg-error text-on-error rounded-full py-3 px-6 font-bold`

After confirming: navigate to `/` or `/history`.

## useEntry (additions)

```ts
// Add to UseEntryReturn:
deleteEntry: () => Promise<void>
restoreEntry: () => Promise<void>

// deleteEntry: setDoc merge { deleted: true, deletedAt: serverTimestamp() }
// restoreEntry: setDoc merge { deleted: false, deletedAt: null }
```

## TrashPage

**Location:** `src/pages/TrashPage.tsx`

**Access:** Link in `SideNav` below main nav items, small `text-xs text-on-surface-variant` "Trash" link with `delete` icon. Not a primary nav item.

**Header:** "Trash" `text-3xl font-bold` + subtitle "Entries are permanently deleted after 30 days."

**Entry list:**

Query: `users/{userId}/entries where deleted == true, orderBy deletedAt DESC`

For each entry, show `EntryListCard` variant with:

- Red `deleted` badge showing days remaining: `Math.max(0, 30 - daysSince(deletedAt))` days left
- Two action buttons instead of arrow:
  - Restore: `bg-primary-container text-primary rounded-full px-4 py-1.5 text-xs font-semibold`
  - Delete forever: `bg-error-container text-on-error-container rounded-full px-4 py-1.5 text-xs font-semibold`

**Delete forever** confirmation dialog:

```
"Permanently delete this entry?"
"This cannot be undone."
[Cancel]  [Delete Forever]
```

Delete forever: calls `deleteDoc()` on the entry document (removes from Firestore immediately,
also triggers Algolia extension to remove from index).

**Empty state:** "Your trash is empty." with a `delete` icon illustration.

## Firestore TTL Policy (Manual Console Step)

In Firebase console → Firestore → Indexes → TTL policies:

- Collection group: `entries`
- Timestamp field: `deletedAt`

This automatically hard-deletes documents 30 days after `deletedAt` is set.
Note: TTL deletion is not guaranteed to the exact second — may take up to 24h after expiry.

## Unit Tests

```ts
// useEntry:
// - deleteEntry() calls setDoc with deleted: true and deletedAt: serverTimestamp()
// - restoreEntry() calls setDoc with deleted: false and deletedAt: null
// - entry is excluded from normal queries after deleteEntry()
```

## E2E

```ts
// Scenario 1: delete entry from TodayPage → navigates away → entry not in / or /history
// Scenario 2: navigate to /trash → deleted entry appears with days-remaining badge
// Scenario 3: click Restore → entry appears back in /history
// Scenario 4: click Delete Forever → entry removed from Trash list
```
