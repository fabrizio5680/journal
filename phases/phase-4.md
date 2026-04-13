# Phase 4 — Mood + Tags

## Goal

Wire the metadata row: mood picker (5-emoji scale) and tag input (autocomplete from user's
tag vocabulary). Both save into the entry document and update `MetadataChips`.

## Prerequisites

- Phase 3 complete — `useEntry`, `MetadataChips`, `EntryEditor` all working

## Checklist

- [ ] `MoodPicker.tsx` — 5-emoji chip row, tap to select/deselect (see MoodPicker section)
- [ ] `TagInput.tsx` — autocomplete input from `tagVocabulary`, create new tags inline (see TagInput section)
- [ ] Wire `MoodPicker` + `TagInput` into `MetadataChips.tsx` — open via `onMoodClick` / `onTagClick` callbacks
- [ ] On mood change: call `useEntry.save({ mood, moodLabel })` immediately (no debounce)
- [ ] On tag add/remove: call `useEntry.save({ tags })` immediately
- [ ] On new tag created: `arrayUnion` the new tag into `users/{userId}.tagVocabulary`
- [ ] `Chip.tsx` reusable component — `bg-secondary-container text-on-secondary-container px-3 py-1.5 rounded-xl text-xs font-medium` + optional Material Symbol icon
- [ ] **Unit**: `MoodPicker.test.tsx`
- [ ] **Unit**: `TagInput.test.tsx`

## MOODS Constant

```ts
// src/lib/moods.ts
export const MOODS = [
  { value: 1 as const, emoji: '😔', label: 'Heavy' },
  { value: 2 as const, emoji: '😐', label: 'Neutral' },
  { value: 3 as const, emoji: '🙂', label: 'Calm' },
  { value: 4 as const, emoji: '😊', label: 'Peaceful' },
  { value: 5 as const, emoji: '🥳', label: 'Radiant' },
]
```

## MoodPicker

**Location:** `src/components/mood/MoodPicker.tsx`

**Props:** `{ value: number | null, onChange: (mood: number | null, label: string | null) => void }`

**UI:** Horizontal row of 5 chips, each showing emoji + label.

```
Selected:   bg-primary-container text-on-primary-container border border-primary/20 rounded-xl px-4 py-2 text-sm font-semibold
Unselected: bg-secondary-container text-on-secondary-container rounded-xl px-4 py-2 text-sm hover:bg-secondary-fixed transition-colors
```

Tapping a selected mood deselects it (sets mood to null). Tapping a different mood switches.

**Rendered inside `MetadataChips`** — show inline below the chips row or as a popover.
Simplest approach for MVP: render inline as a row that expands when "Add mood" is clicked.

## TagInput

**Location:** `src/components/tags/TagInput.tsx`

**Props:** `{ tags: string[], vocabulary: string[], onChange: (tags: string[]) => void }`

**Behaviour:**

- Shows current tags as removable `Chip` components (with `×` remove button)
- Text input filters `vocabulary` for autocomplete suggestions as user types
- Pressing Enter or clicking a suggestion adds the tag
- If typed value doesn't match any suggestion, "Create tag: {value}" appears as the last option
- Tags are lowercase, trimmed, max 30 chars, max 10 per entry
- On new tag created: parent calls `arrayUnion` on user's `tagVocabulary`

**Autocomplete dropdown** (`bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/10 mt-1 z-50`):

```
Each suggestion: px-4 py-2 text-sm hover:bg-surface-container cursor-pointer
```

## MetadataChips (updated)

Replace stub slots with real pickers:

```tsx
// When mood chip clicked: toggle inline MoodPicker row
// When tag chip / add button clicked: show TagInput inline
// Chips row is scrollable: overflow-x-auto no-scrollbar
```

Current tags shown as `Chip` components. Current mood shown as emoji + label chip in `bg-secondary-container`.

## Unit Tests

### MoodPicker.test.tsx

```ts
// - renders 5 mood chips
// - clicking a mood chip calls onChange with correct value and label
// - clicking the already-selected mood calls onChange with (null, null)
// - selected chip has active styles
```

### TagInput.test.tsx

```ts
// - renders existing tags as chips with remove buttons
// - typing filters vocabulary suggestions
// - clicking a suggestion calls onChange with tag added
// - pressing Enter with new value creates tag and calls onChange
// - clicking × on a chip removes it and calls onChange
// - shows "Create tag: {value}" when input doesn't match vocabulary
```
