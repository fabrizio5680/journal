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
  reminderTime: string // "HH:MM"
  reminderTimezone: string // IANA, e.g. "Europe/London"
  grainEnabled: boolean // default true
  scriptureTranslation: 'NLT' | 'MSG' | 'ESV' // default 'NLT'
  fcmToken: string | null
  createdAt: import('firebase/firestore').Timestamp
}

export const MOODS = [
  { value: 1 as const, emoji: '😔', label: 'Heavy' },
  { value: 2 as const, emoji: '😐', label: 'Neutral' },
  { value: 3 as const, emoji: '🙂', label: 'Calm' },
  { value: 4 as const, emoji: '😊', label: 'Peaceful' },
  { value: 5 as const, emoji: '🥳', label: 'Radiant' },
]
