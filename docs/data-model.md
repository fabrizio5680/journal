# Firestore Data Model

## `users/{userId}`

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
  fcmTokens: string[]            // one entry per registered device
  activeStorageProvider?: 'googleDrive' | 'dropbox'
  storageAccountEmail?: string
  storageRootFolderId?: string   // Google Drive app-created root folder id
  storageRootPath?: string       // Dropbox app folder/root path
  storageConnectedAt?: Timestamp
  lastEntryDate?: string         // "YYYY-MM-DD" local civil date, reminder metadata only
  lastEntrySavedAt?: Timestamp
  createdAt: Timestamp
}
```

## Journal Entry Storage

Firestore must not store journal `content`, `contentText`, revisions, or searchable journal indexes. Runtime entry access goes through `EntryRepository`, backed locally by IndexedDB and eventually by the active user-owned provider.

Entry file contract:

```ts
{
  schemaVersion: 1
  app: 'quiet-dwelling'
  date: string                   // "YYYY-MM-DD" local civil date; filename stem
  content: object                // Tiptap JSON
  searchText: string             // body text plus mood/tag/scripture search tokens
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  scriptureRefs: ScriptureRef[]
  wordCount: number
  createdAt: string              // ISO timestamp
  updatedAt: string              // ISO timestamp
}
```

## Mood Mapping

The numeric `mood` field (1–5) is stable and unchanged. Each value now maps to **two** biblical-toned moods distinguished by `moodLabel`. Entry files store `mood` (number) and `moodLabel` (string) separately — the label is the semantic identifier within a pair.

```ts
// src/lib/moods.ts — two entries per numeric value
const MOODS = [
  { value: 1, emoji: '😢', label: 'Sorrowful' },
  { value: 1, emoji: '😮‍💨', label: 'Weary' },
  { value: 2, emoji: '😰', label: 'Anxious' },
  { value: 2, emoji: '🌊', label: 'Unsettled' },
  { value: 3, emoji: '🌱', label: 'Hopeful' },
  { value: 3, emoji: '🕊️', label: 'Trusting' },
  { value: 4, emoji: '😌', label: 'Peaceful' },
  { value: 4, emoji: '🙏', label: 'Grateful' },
  { value: 5, emoji: '😄', label: 'Joyful' },
  { value: 5, emoji: '✨', label: 'Overflowing' },
]
```
