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
  encryptionEnabled?: boolean    // opt-in client-side encryption
  encryptionSalt?: string        // base64 16-byte random salt for PBKDF2 key derivation
  encryptionCanary?: string      // AES-256-GCM encrypted canary value for passphrase verification
  encryptionRecoveryData?: string // primary key encrypted with recovery-code-derived key
  createdAt: Timestamp
}
```

## `users/{userId}/entries/{YYYY-MM-DD}`

```ts
{
  date: string                   // "YYYY-MM-DD" — also the doc ID
  content: object                // Tiptap JSON
  contentText: string            // plain text from getText()
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  wordCount: number
  contentEncrypted?: boolean     // true when content/contentText are AES-256-GCM encrypted
  deleted: boolean
  deletedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

## `users/{userId}/entries/{YYYY-MM-DD}/revisions/{revisionId}`

Snapshots of an entry saved automatically every 15 minutes while editing. Capped at 10 per entry — oldest documents are pruned on write.

```ts
{
  savedAt: Timestamp
  content: object                // Tiptap JSON
  contentText: string            // plain text snapshot
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null
  tags: string[]
  scriptureRefs: ScriptureRef[]  // { reference, passageId }
  wordCount: number
  contentEncrypted?: boolean     // true when content/contentText are AES-256-GCM encrypted
}
```

Security rules: read and write restricted to the authenticated owner of the parent entry.

## Mood Mapping

The numeric `mood` field (1–5) is stable and unchanged. Each value now maps to **two** biblical-toned moods distinguished by `moodLabel`. Firestore stores `mood` (number) and `moodLabel` (string) separately — the label is the semantic identifier within a pair.

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
