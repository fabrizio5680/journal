# Phase 3 — Core Editor

## Goal

Build the writing experience: Tiptap rich text editor, auto-save with cross-device sync,
floating action bar (word count + save), desktop toolbar, mobile BubbleMenu, and TodayPage.
This is the heart of the app.

## Prerequisites

- Phase 1 + 2 complete — AppShell, routing, auth all working

## Checklist

- [ ] `useEntry.ts` — Firestore CRUD for a single entry date (see useEntry section)
- [ ] `EntryEditor.tsx` — Tiptap editor with all extensions (see Editor section)
- [ ] `EditorToolbar.tsx` — desktop formatting bar: bold, italic, bullet list, H2 (see Toolbar section)
- [ ] BubbleMenu inside `EntryEditor.tsx` — appears on text selection, same 4 controls, mobile-optimised touch targets
- [ ] `MetadataChips.tsx` — scrollable row above editor (see MetadataChips section); mood + tag chips are stubs in this phase (wired in Phase 4)
- [ ] `FloatingActionBar.tsx` — Dictate + word count + Save (see FAB section); dictation is a stub in this phase (wired in Phase 6)
- [ ] `TodayPage.tsx` — loads today's entry via `useEntry`, creates doc if missing, renders `EntryEditor` + `FloatingActionBar`
- [ ] Auto-save: 1.5s debounce after any editor change; "Draft saved Xm ago" indicator updates in `TopBar`
- [ ] `EntryPage.tsx` — `/entry/:date` route, same layout as `TodayPage`, same auto-save behaviour
- [ ] **Unit**: `useEntry.test.ts` — null on missing date, creates doc on first save, debounce fires once, remote snapshot ignored when `isDirty`
- [ ] **Unit**: `MetadataChips.test.tsx` — renders mood chip slot + tag chip slots + add button
- [ ] **E2E**: `e2e/editor.spec.ts` — write text → "Draft saved" appears → save button persists to Firestore emulator

## useEntry

**Location:** `src/hooks/useEntry.ts`

```ts
interface UseEntryReturn {
  entry: Entry | null // null = not yet loaded or doesn't exist
  isLoading: boolean
  isDirty: boolean // true from first keystroke until save completes
  save: (data: Partial<Entry>) => Promise<void>
  wordCount: number
}

function useEntry(date: string): UseEntryReturn
```

**Behaviour:**

1. `onSnapshot` on `users/{uid}/entries/{date}` — real-time updates
2. When remote snapshot arrives: if `isDirty === true`, ignore it (user is typing); apply only when `isDirty === false`
3. `isDirty` set to `true` on any editor content change; cleared to `false` after successful `save()`
4. `save()` writes `content`, `contentText` (from `getText()`), `wordCount`, `updatedAt`; creates doc with `createdAt` if it doesn't exist (use `setDoc` with `merge: true`)
5. Auto-save: caller debounces `save()` by 1.5s on editor `onUpdate`

**`contentText` extraction** — caller passes it in from `editor.getText()` at save time.

## EntryEditor

**Location:** `src/components/editor/EntryEditor.tsx`

**Tiptap extensions:**

```ts
extensions: [
  StarterKit,                          // includes History (undo/redo)
  Placeholder.configure({ placeholder: 'The silence this morning feels different...' }),
  CharacterCount,
  Heading.configure({ levels: [2] }),
  BubbleMenu.configure({ ... }),       // see below
]
```

**Editor styles** (apply via Tiptap `editorProps.attributes`):

```
class: "outline-none bg-transparent text-xl leading-[1.8] font-light text-on-surface
        placeholder:text-outline-variant/40 min-h-[60vh] w-full"
```

**Selection highlight:**

```css
/* already set globally via ::selection in globals.css */
```

**BubbleMenu** (shows on text selection):

```tsx
<BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
  <div className="bg-surface-container-lowest border-outline-variant/20 flex gap-1 rounded-xl border p-1 shadow-lg">
    {/* Bold, Italic, BulletList, H2 buttons — each w-9 h-9 rounded-lg */}
  </div>
</BubbleMenu>
```

## EditorToolbar (desktop only, `hidden md:flex`)

`fixed top-0 md:left-64 xl:right-80 right-0 z-30 bg-surface/80 backdrop-blur-md border-b border-outline-variant/10 px-6 py-2 flex items-center gap-1`

Four icon buttons: Bold (`format_bold`), Italic (`format_italic`), Bullet list (`format_list_bulleted`), Heading 2 (`title`)

Button style:

```
Active:   bg-primary-container text-primary rounded-lg p-2
Inactive: text-on-surface-variant hover:bg-surface-container rounded-lg p-2 transition-colors
```

## MetadataChips

**Location:** `src/components/editor/MetadataChips.tsx`

`flex items-center gap-2 overflow-x-auto no-scrollbar py-2`

In Phase 3, render placeholder chips:

- Mood slot: `bg-secondary-container text-on-secondary-container px-3 py-1.5 rounded-xl text-xs font-medium` — shows "Add mood" if no mood set
- Tags slot: same style — shows "Add tag" if no tags
- `add_circle` icon button: `text-on-surface-variant/40 hover:text-on-surface-variant`

Props: `{ mood, moodLabel, tags, onMoodClick, onTagClick }` — callbacks are stubs until Phase 4.

## FloatingActionBar

**Location:** `src/components/fab/FloatingActionBar.tsx`

**Position:**

```
Mobile:  fixed bottom-20 left-1/2 -translate-x-1/2 z-40
Desktop: md:translate-x-0 md:left-auto md:right-12 md:bottom-12
```

**Contents** (`flex items-center gap-3`):

1. **Dictate button** (`w-16 h-16 rounded-full bg-surface-container-lowest text-primary shadow-[0_10px_40px_rgba(48,51,49,0.12)] flex items-center justify-center`):
   - `mic` Material Symbol icon
   - Hidden entirely if `!speechSupported` (feature detect: `'SpeechRecognition' in window || 'webkitSpeechRecognition' in window`)
   - In Phase 3 this is a stub — onClick does nothing until Phase 6

2. **Word count** (`text-xs text-on-surface-variant min-w-[3rem] text-center`):
   - Shows `{wordCount} words`

3. **Save button** (`px-10 h-16 rounded-full bg-gradient-to-r from-primary to-primary-dim text-on-primary font-bold shadow-[0_10px_40px_rgba(82,100,72,0.2)] flex items-center gap-2`):
   - `check_circle` icon + "Save Entry" text
   - onClick: calls `save()` immediately (bypasses debounce)

## TodayPage

**Location:** `src/pages/TodayPage.tsx`

```ts
// 1. Get today's date: format(new Date(), 'yyyy-MM-dd') from date-fns
// 2. useEntry(today) — entry, isLoading, isDirty, save, wordCount
// 3. If !isLoading && !entry: create stub entry (setDoc with defaults)
// 4. Render: <MetadataChips> + <EntryEditor> + <FloatingActionBar>
// 5. Auto-save: editor onUpdate → debounce(1500ms) → save({ content, contentText, wordCount })
// 6. Pass isDirty to TopBar for "Draft saved" indicator
```

## TypeScript Types (src/types/index.ts)

```ts
export interface Entry {
  date: string
  content: object // Tiptap JSON
  contentText: string
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  wordCount: number
  deleted: boolean
  deletedAt: import('firebase/firestore').Timestamp | null
  createdAt: import('firebase/firestore').Timestamp
  updatedAt: import('firebase/firestore').Timestamp
}

export interface User {
  displayName: string
  email: string
  photoURL: string
  tagVocabulary: string[]
  reminderEnabled: boolean
  reminderTime: string
  reminderTimezone: string
  grainEnabled: boolean
  scriptureTranslation: 'NLT' | 'MSG' | 'ESV'
  fcmToken: string | null
  createdAt: import('firebase/firestore').Timestamp
}
```

## Unit Tests

### useEntry.test.ts

```ts
// - returns { entry: null, isLoading: true } on mount before snapshot
// - returns entry data after snapshot fires
// - save() calls setDoc with correct fields including contentText and wordCount
// - isDirty becomes true on markDirty(), false after save() resolves
// - remote snapshot is ignored when isDirty === true
// - debounce: calling save multiple times within 1.5s results in one Firestore write
```

### MetadataChips.test.tsx

```ts
// - renders "Add mood" slot when mood is null
// - renders mood emoji + label when mood is set
// - renders tag chips for each tag in tags[]
// - calls onMoodClick when mood chip clicked
// - calls onTagClick when add tag clicked
```

## E2E — editor.spec.ts

```ts
// Setup: sign in via emulator, navigate to /
// Scenario 1: type text → wait 2s → "Draft saved" appears in TopBar
// Scenario 2: type text → click Save → verify Firestore emulator has entry doc for today
// Scenario 3: word count updates as user types
```
