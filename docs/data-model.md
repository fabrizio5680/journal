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
  deleted: boolean
  deletedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

## Mood Mapping

```ts
const MOODS = [
  { value: 1, emoji: '😔', label: 'Heavy' },
  { value: 2, emoji: '😐', label: 'Neutral' },
  { value: 3, emoji: '🙂', label: 'Calm' },
  { value: 4, emoji: '😊', label: 'Peaceful' },
  { value: 5, emoji: '🥳', label: 'Radiant' },
]
```
