# Journal App — Implementation Plan

## Agreed Spec

| Decision | Choice |
|---|---|
| App name | "The Quiet Sanctuary" / brand mark "Reflect" |
| Framework | React + Vite + TypeScript |
| Styling | Tailwind CSS (custom config — no shadcn/ui, design system is bespoke) |
| Auth | Google Sign-In only (no email/password) |
| Database | Firestore — `users/{uid}/entries/{YYYY-MM-DD}` |
| Rich text editor | Tiptap (JSON serialization) |
| Mood | 5-emoji scale → numeric 1–5, optional |
| Tags | Hybrid autocomplete; stored on entry + user tag vocabulary |
| Search | Algolia, faceted (tag + mood + date range), secured API keys |
| Algolia record | Truncated plain-text excerpt (≤8KB) + all metadata |
| Dictation | Web Speech API, real-time append; toolbar button (desktop) + FAB (mobile) |
| Date navigation | Mini-calendar (desktop sidebar) + date picker (mobile top bar), entry dots |
| Insights | Streak counter, mood sparkline, top tags |
| Hosting | Firebase Hosting (project: `journal-manna`) |
| PWA | Yes — installable, offline read + write via Firestore persistence + service worker |
| Past entries | Always editable |
| Delete | Soft delete, 30-day recovery window |
| Backend | Two Cloud Functions: `getSearchKey` (Algolia secured key) + `sendDailyReminders` (FCM push, Cloud Scheduler) |
| Sharing | None — strictly private |
| Focus mode | Distraction-free toggle that hides all chrome except writing area |

---

## Design System

### Fonts
- **Primary**: Manrope (weights: 200, 300, 400, 500, 600, 700, 800)
- **Icons**: Material Symbols Outlined (`font-variation-settings: 'FILL' 0, 'wght' 300–400`)
- Load both from Google Fonts

### Color Palette (Tailwind custom tokens)

```js
colors: {
  "background":                "#faf9f7",
  "surface":                   "#faf9f7",
  "surface-bright":            "#faf9f7",
  "surface-dim":               "#d9dad8",
  "surface-variant":           "#e1e3e0",
  "surface-container-lowest":  "#ffffff",
  "surface-container-low":     "#f4f4f1",
  "surface-container":         "#edeeec",
  "surface-container-high":    "#e7e8e6",
  "surface-container-highest": "#e1e3e0",
  "on-surface":                "#303331",
  "on-surface-variant":        "#5d605e",
  "on-background":             "#303331",

  "primary":                   "#526448",
  "primary-dim":               "#46583d",
  "primary-fixed":             "#d4e9c5",
  "primary-fixed-dim":         "#c6dbb8",
  "primary-container":         "#d4e9c5",
  "on-primary":                "#ecffdd",
  "on-primary-fixed":          "#33442a",
  "on-primary-fixed-variant":  "#4f6145",
  "on-primary-container":      "#45573b",
  "inverse-primary":           "#e8fdd8",
  "surface-tint":              "#526448",

  "secondary":                 "#645e54",
  "secondary-dim":             "#585348",
  "secondary-fixed":           "#eae1d4",
  "secondary-fixed-dim":       "#dcd3c6",
  "secondary-container":       "#eae1d4",
  "on-secondary":              "#fff8ef",
  "on-secondary-fixed":        "#433f35",
  "on-secondary-fixed-variant":"#605b51",
  "on-secondary-container":    "#565147",

  "tertiary":                  "#65612a",
  "tertiary-dim":              "#58551f",
  "tertiary-fixed":            "#fdf6b0",
  "tertiary-fixed-dim":        "#eee8a3",
  "tertiary-container":        "#fdf6b0",
  "on-tertiary":               "#fffada",
  "on-tertiary-fixed":         "#4f4b16",
  "on-tertiary-fixed-variant": "#6c6830",
  "on-tertiary-container":     "#615d27",

  "outline":                   "#797b79",
  "outline-variant":           "#b0b2b0",

  "error":                     "#a73b21",
  "error-dim":                 "#791903",
  "error-container":           "#fd795a",
  "on-error":                  "#fff7f6",
  "on-error-container":        "#6e1400",

  "inverse-surface":           "#0d0e0e",
  "inverse-on-surface":        "#9d9d9b",
}
```

### Border Radius Scale

```js
borderRadius: {
  DEFAULT: "0.125rem",   // 2px  — inputs, subtle elements
  lg:      "0.25rem",    // 4px
  xl:      "0.5rem",     // 8px  — chips, tags
  full:    "0.75rem",    // 12px — pills, buttons
  // Cards and panels use Tailwind's rounded-[2rem] (32px) inline
}
```

### Typography Scale

| Role | Class | Usage |
|---|---|---|
| App brand | `text-xl font-black` | Sidebar logo |
| Page headline | `text-[3.5rem] font-bold tracking-tight` | History page header |
| Entry date | `text-2xl font-bold tracking-tighter` | Top bar |
| Card title | `text-2xl font-bold tracking-tight` | Entry cards |
| Body | `text-xl leading-relaxed font-light` | Writing area |
| Label | `text-[10px] uppercase tracking-widest font-bold` | Dates, metadata labels |
| Chip | `text-xs font-medium` or `text-xs font-semibold` | Tags, mood chips |

### Writing Area Style
- `bg-transparent border-none resize-none focus:ring-0`
- `text-xl leading-[1.8] font-light text-on-surface`
- `placeholder:text-outline-variant/40`
- Selection: `selection:bg-primary-container selection:text-on-primary-container`

### Card Style
- Background: `bg-surface-container-lowest`
- Border radius: `rounded-[2rem]`
- Border: `border border-transparent hover:border-outline-variant/10`
- Shadow on hover: `hover:shadow-[0_4px_40px_rgba(48,51,49,0.06)]`
- Transition: `transition-all duration-500`

### Chip / Tag Style
- Background: `bg-secondary-container text-on-secondary-container`
- Padding: `px-3 py-1.5` or `px-4 py-1.5`
- Border radius: `rounded-xl` (8px)
- Text: `text-xs font-medium` or `text-xs font-semibold tracking-wide`
- Include Material Symbol icon at `text-sm` / `text-[14px]`

### Button Styles

| Type | Classes |
|---|---|
| Primary pill | `bg-primary hover:bg-primary-dim text-on-primary font-bold py-4 px-6 rounded-full shadow-sm` |
| Primary gradient FAB | `bg-gradient-to-r from-primary to-primary-dim text-on-primary rounded-full shadow-[0_10px_40px_rgba(82,100,72,0.2)]` |
| Ghost/icon | `p-2 hover:bg-surface-container rounded-full transition-colors` |
| Google OAuth | `bg-surface-container border border-outline-variant/20 hover:bg-surface-container-high rounded-full py-4 px-6 font-semibold` |
| Secondary FAB | `bg-surface-container-lowest text-primary rounded-full shadow-[0_10px_40px_rgba(48,51,49,0.12)]` |

### Nav Item States

| State | Classes |
|---|---|
| Active | `bg-surface-container-lowest text-primary font-bold shadow-sm scale-[0.98] rounded-xl` |
| Inactive | `text-on-surface-variant hover:bg-surface-bright rounded-xl transition-colors duration-300` |
| Active mobile bottom | `bg-primary-container text-primary rounded-full p-3 scale-95` |
| Inactive mobile bottom | `text-on-surface-variant p-3 hover:text-primary` |

### Bottom Nav Bar (Mobile)
```
bg-surface/70 backdrop-blur-xl rounded-t-3xl
shadow-[0_-4px_40px_rgba(48,51,49,0.06)]
fixed bottom-0 left-0 w-full
px-6 pb-8 pt-4
```

### Floating Action Bar (Editor)
- Centered on mobile: `fixed bottom-12 left-1/2 -translate-x-1/2`
- Right-anchored on desktop: `md:translate-x-0 md:left-auto md:right-12`
- Contains: Dictate button (round, `surface-container-lowest`) + Save button (pill, primary gradient)

---

## Screens & Layout

### Screen 1: Login Page

**Layout:** Asymmetric split — 40–45% left form / 55–60% right atmospheric image (hidden on mobile)

**Left panel** (`bg-surface-container-lowest z-10`):
- Top: Logo mark (`w-10 h-10 bg-primary-container rounded-xl` + `edit_note` icon) + "The Quiet Sanctuary" wordmark
- Hero copy: `text-4xl font-extrabold` headline + subtitle
- Google Sign-In button (prominent, pill-shaped)
- Bottom: `"Privacy matters. Your thoughts are encrypted."` in `text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/60`

**Right panel** (desktop only, `md:flex-grow`):
- Full-bleed atmospheric photo (journal/desk/morning light) with `grayscale-[20%]`
- Natural paper texture overlay at 20% opacity
- Glassmorphism scripture card: `bg-surface/70 backdrop-blur-2xl rounded-[2rem] border border-surface-container-lowest/30`
  - `format_quote` icon, italic verse text `text-2xl font-light`, reference (e.g. "Psalm 46:10")
  - Uses a single hardcoded fallback verse (no API call on login — user not yet authenticated)

---

### Screen 2: App Shell (All authenticated pages)

**Desktop (≥768px):** Three-column layout
- **Left sidebar** (`w-64 fixed`, `bg-surface-container-low`):
  - Brand: "Reflect" + "The Quiet Sanctuary" subtitle
  - Nav items: Journal (edit_note), History (calendar_month), Insights (bar_chart), Settings (settings)
  - Bottom: "New Entry" primary pill button + user avatar + name + streak count
- **Main content** (`flex-1 md:ml-64`) — page-specific
- **Right panel** (`w-80 fixed right-0`, xl screens only, `bg-surface border-l border-outline-variant/10`):
  - Daily Scripture: `DailyScripture.tsx` — verse of the day via API.Bible, NLT/MSG/ESV toggle, `bg-surface-container-low rounded-3xl`
  - Sync status: `cloud_done` icon + "Synced to Cloud" when online; `cloud_off` icon + "Offline — changes will sync" when `!navigator.onLine`

**Mobile (<768px):**
- No sidebar
- Fixed top bar: date display (left) + "Draft saved Xm ago" + search icon (`search`) + avatar (right)
- Bottom nav: Entry (edit_note), History (calendar_month), Focus (visibility_off), Settings (settings)
- Insights accessible on mobile via a link in the History page header

---

### Screen 3: Daily Entry (Today / Entry Page)

**Top bar (desktop):**
- Day of week in `text-xs uppercase tracking-[0.2em] text-on-surface-variant`
- Date in `text-2xl font-bold text-primary tracking-tighter`
- Draft saved indicator (right)

**Editor area** (`max-w-3xl mx-auto pt-32 pb-24 px-8`):
- Metadata chips row (scrollable on mobile, `no-scrollbar`):
  - Mood chip: `bg-secondary-container` + Material Symbol icon + label
  - Tag chips: same style
  - Add button: `text-on-surface-variant/40` `add_circle` icon
- Writing textarea:
  - `bg-transparent border-none text-xl leading-relaxed font-light`
  - Placeholder: `"The silence this morning feels different..."`
- Inspiration image (optional): `rounded-3xl h-64` with gradient overlay and caption

**Floating Action Bar** (bottom-anchored):

- Dictate: `w-16 h-16 rounded-full bg-surface-container-lowest text-primary shadow-lg` + `mic` icon (hidden on iOS Safari)
- Word count: `text-xs text-on-surface-variant` counter between Dictate and Save
- Save: `px-10 h-16 rounded-full bg-gradient-to-r from-primary to-primary-dim` + `check_circle` icon + "Save Entry" text

---

### Screen 4: History Page

**Header** (`mb-16`):
- `text-[3.5rem] font-bold tracking-tight` — "Past Chapters"
- Subtitle in `text-on-surface-variant max-w-xl text-lg leading-relaxed`

**Bento grid** (`grid-cols-1 lg:grid-cols-12 gap-8`):

**Left: Mini Calendar** (`lg:col-span-5 bg-surface-container-low rounded-[2rem] p-8`):
- Month/year header + chevron nav
- 7-col grid, day labels in `text-[10px] uppercase tracking-widest`
- Date states:
  - Today: `bg-primary-container rounded-full` background + primary text + dot
  - Has entry: small `w-1 h-1 bg-primary rounded-full` dot below the number
  - Hover: `bg-primary-container/20 rounded-full` scale transition
  - Out of month: `text-on-surface-variant opacity-30`
- Mood Summary bar at bottom: 4 colored `h-1` bars + italic AI summary text

**Right: Entry Cards** (`lg:col-span-7`):
- Count label + search/filter icon buttons
- **List card** (`bg-surface-container-lowest rounded-[2rem]`):
  - Date label (`text-[10px] uppercase tracking-widest font-black`)
  - Title (`text-2xl font-bold`) + mood tag chip (top right)
  - Excerpt (`line-clamp-2 text-on-surface-variant`)
  - Arrow icon bottom-right (`arrow_forward`, shifts on hover)

---

### Screen 5: Search Modal

- Full-screen overlay, `backdrop-blur-md`
- Cmd/Ctrl+K trigger (desktop); search icon in mobile top bar
- Search input (prominent, auto-focused)
- Filter row: tag chips, mood selector (1–5), date range
- Results: same card style as History list cards
- Empty state: illustrated prompt

---

### Screen 6: Focus Mode

- Triggered by "Focus" nav item (`visibility_off` icon)
- Hides: sidebar, top bar, bottom nav, FABs (or reduces to minimal)
- Full-screen writing canvas only
- Subtle exit button (`visibility` icon) in corner

---

## Project Structure

```
journal/
├── public/
│   ├── icons/                         # PWA icons (192, 512)
│   └── textures/
│       └── natural-paper.png          # Grain overlay texture
├── src/
│   ├── components/
│   │   ├── editor/
│   │   │   ├── EntryEditor.tsx        # Tiptap rich text editor (replaces textarea)
│   │   │   ├── EditorToolbar.tsx      # Formatting controls (desktop)
│   │   │   ├── MetadataChips.tsx      # Mood + tag chips row above editor
│   │   ├── layout/
│   │   │   ├── AppShell.tsx           # Three-column shell (sidebar + main + right panel)
│   │   │   ├── SideNav.tsx            # Desktop left sidebar
│   │   │   ├── RightPanel.tsx         # xl desktop right panel (stats + quote)
│   │   │   ├── TopBar.tsx             # Fixed top bar (date + save status)
│   │   │   └── BottomNav.tsx          # Mobile bottom nav (glassmorphism)
│   │   ├── calendar/
│   │   │   └── MiniCalendar.tsx       # Month grid with entry dots + mood bar
│   │   ├── search/
│   │   │   ├── SearchModal.tsx        # Full-screen Algolia search overlay
│   │   │   └── SearchFilters.tsx      # Tag chips + mood + date range facets
│   │   ├── mood/
│   │   │   └── MoodPicker.tsx         # 5-emoji selector (inline chip style)
│   │   ├── tags/
│   │   │   └── TagInput.tsx           # Autocomplete tag input
│   │   ├── history/
│   │   │   ├── EntryListCard.tsx      # Standard list entry card
│   │   │   └── MoodSummaryBar.tsx     # Month mood bar + static caption
│   │   ├── insights/
│   │   │   ├── MoodSparkline.tsx      # Recharts line chart
│   │   │   └── TopTags.tsx            # Horizontal bar chart
│   │   ├── fab/
│   │   │   └── FloatingActionBar.tsx  # Dictate + Save buttons
│   │   ├── auth/
│   │   │   └── LoginPage.tsx          # Asymmetric login layout
│   │   └── ui/
│   │       ├── Chip.tsx               # Reusable secondary-container chip
│   │       ├── GlassCard.tsx          # Glassmorphism card (login quote, etc.)
│   │       └── DailyScripture.tsx     # Daily Bible verse (API.Bible) with NLT/MSG/ESV toggle
│   ├── hooks/
│   │   ├── useEntry.ts                # Firestore CRUD for a single entry
│   │   ├── useEntryDates.ts           # Which dates in a month have entries
│   │   ├── useStreak.ts               # Current + longest streak (used in SideNav from Phase 2)
│   │   ├── useDictation.ts            # Web Speech API wrapper
│   │   ├── useSearch.ts               # Algolia InstantSearch logic
│   │   ├── useInsights.ts             # Mood sparkline + top tags aggregations
│   │   └── useFocusMode.ts            # Focus mode toggle state
│   ├── lib/
│   │   ├── firebase.ts                # Firebase app init + exports
│   │   ├── firestore.ts               # Typed Firestore helpers
│   │   ├── algolia.ts                 # Algolia client init (secured key)
│   │   └── tiptap.ts                  # Tiptap extensions config
│   ├── types/
│   │   └── index.ts                   # Shared TypeScript types
│   ├── pages/
│   │   ├── TodayPage.tsx              # Landing: today's entry
│   │   ├── EntryPage.tsx              # /entry/:YYYY-MM-DD
│   │   ├── HistoryPage.tsx            # Calendar + entry cards
│   │   ├── InsightsPage.tsx           # Stats dashboard
│   │   ├── TrashPage.tsx              # Soft-deleted entries
│   │   └── SettingsPage.tsx           # Notification toggle + reminder time picker + sign out
│   ├── styles/
│   │   └── globals.css                # Manrope import, material symbols, base styles
│   ├── App.tsx
│   └── main.tsx
├── functions/
│   └── src/
│       └── index.ts                   # Cloud Functions: getSearchKey + sendDailyReminders
├── e2e/
│   ├── auth.spec.ts                   # Login / Google sign-in flow
│   ├── editor.spec.ts                 # Write, save, dictation
│   ├── history.spec.ts                # Calendar navigation, entry cards
│   ├── search.spec.ts                 # Algolia search + facets
│   └── focus-mode.spec.ts             # Focus mode toggle
├── .github/
│   └── workflows/
│       ├── ci.yml                         # Lint + unit tests + e2e on every PR
│       └── deploy.yml                     # Deploy to Firebase Hosting on merge to main
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── playwright.config.ts
├── vitest.config.ts
├── eslint.config.ts                       # ESLint flat config
├── prettier.config.ts                     # Prettier config
├── .prettierignore
└── .env.local
```

Test files co-located with source:

```text
src/
  components/editor/
    EntryEditor.test.tsx
    MetadataChips.test.tsx
  components/calendar/
    MiniCalendar.test.tsx
  components/ui/
    Chip.test.tsx
  hooks/
    useEntry.test.ts
    useEntryDates.test.ts
    useDictation.test.ts
    useInsights.test.ts
  lib/
    firestore.test.ts
  test/
    setup.ts                           # Global test setup (vi mocks, @testing-library/jest-dom)
    firebase-mocks.ts                  # Shared Firestore/Auth mock factories
    render.tsx                         # Custom render wrapper (Router + AuthContext)
```

---

## Tailwind Config

Tailwind v4 uses a **CSS-first config** — no `tailwind.config.ts`. All theme tokens live in `globals.css`:

```css
/* src/styles/globals.css */
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700;800&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap");

@theme {
  /* Colors */
  --color-background:                 #faf9f7;
  --color-surface:                    #faf9f7;
  --color-surface-bright:             #faf9f7;
  --color-surface-dim:                #d9dad8;
  --color-surface-variant:            #e1e3e0;
  --color-surface-container-lowest:   #ffffff;
  --color-surface-container-low:      #f4f4f1;
  --color-surface-container:          #edeeec;
  --color-surface-container-high:     #e7e8e6;
  --color-surface-container-highest:  #e1e3e0;
  --color-on-surface:                 #303331;
  --color-on-surface-variant:         #5d605e;
  --color-on-background:              #303331;
  --color-primary:                    #526448;
  --color-primary-dim:                #46583d;
  --color-primary-fixed:              #d4e9c5;
  --color-primary-fixed-dim:          #c6dbb8;
  --color-primary-container:          #d4e9c5;
  --color-on-primary:                 #ecffdd;
  --color-on-primary-fixed:           #33442a;
  --color-on-primary-fixed-variant:   #4f6145;
  --color-on-primary-container:       #45573b;
  --color-inverse-primary:            #e8fdd8;
  --color-surface-tint:               #526448;
  --color-secondary:                  #645e54;
  --color-secondary-dim:              #585348;
  --color-secondary-fixed:            #eae1d4;
  --color-secondary-fixed-dim:        #dcd3c6;
  --color-secondary-container:        #eae1d4;
  --color-on-secondary:               #fff8ef;
  --color-on-secondary-fixed:         #433f35;
  --color-on-secondary-fixed-variant: #605b51;
  --color-on-secondary-container:     #565147;
  --color-tertiary:                   #65612a;
  --color-tertiary-dim:               #58551f;
  --color-tertiary-fixed:             #fdf6b0;
  --color-tertiary-fixed-dim:         #eee8a3;
  --color-tertiary-container:         #fdf6b0;
  --color-on-tertiary:                #fffada;
  --color-on-tertiary-fixed:          #4f4b16;
  --color-on-tertiary-fixed-variant:  #6c6830;
  --color-on-tertiary-container:      #615d27;
  --color-outline:                    #797b79;
  --color-outline-variant:            #b0b2b0;
  --color-error:                      #a73b21;
  --color-error-dim:                  #791903;
  --color-error-container:            #fd795a;
  --color-on-error:                   #fff7f6;
  --color-on-error-container:         #6e1400;
  --color-inverse-surface:            #0d0e0e;
  --color-inverse-on-surface:         #9d9d9b;

  /* Border radius */
  --radius:      0.125rem;
  --radius-lg:   0.25rem;
  --radius-xl:   0.5rem;
  --radius-full: 0.75rem;

  /* Font families */
  --font-headline: "Manrope", sans-serif;
  --font-body:     "Manrope", sans-serif;
  --font-label:    "Manrope", sans-serif;
  --font-manrope:  "Manrope", sans-serif;
}

/* Material Symbols base */
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
}

/* Writing area selection */
::selection {
  background-color: var(--color-primary-container);
  color: var(--color-on-primary-container);
}
```

---

## Data Model

### Firestore

#### `users/{userId}`
```ts
{
  displayName: string
  email: string
  photoURL: string
  tagVocabulary: string[]       // all tags ever used, for autocomplete
  reminderEnabled: boolean      // daily writing reminder on/off
  reminderTime: string          // "HH:MM" in user's local timezone, e.g. "20:00"
  reminderTimezone: string      // IANA timezone, e.g. "Europe/London"
  grainEnabled: boolean         // paper grain overlay on/off, default true
  scriptureTranslation: 'NLT' | 'MSG' | 'ESV'  // daily scripture translation, default 'NLT'
  fcmToken: string | null       // Firebase Cloud Messaging token for push notifications
  createdAt: Timestamp
}
```

#### `users/{userId}/entries/{YYYY-MM-DD}`
```ts
{
  date: string                  // "2025-04-13" — also the document ID
  content: object               // Tiptap JSON document
  contentText: string           // Plain text extracted from Tiptap (word count + Algolia)
  mood: 1 | 2 | 3 | 4 | 5 | null
  moodLabel: string | null      // e.g. "Peaceful", "Grateful" — display label for mood chip
  tags: string[]
  wordCount: number
  deleted: boolean
  deletedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Mood Mapping
```ts
const MOODS = [
  { value: 1, emoji: "😔", label: "Heavy" },
  { value: 2, emoji: "😐", label: "Neutral" },
  { value: 3, emoji: "🙂", label: "Calm" },
  { value: 4, emoji: "😊", label: "Peaceful" },
  { value: 5, emoji: "🥳", label: "Radiant" },
]
```

### Algolia Record (index: `journal_entries`)
```ts
{
  objectID: string              // "{userId}_{YYYY-MM-DD}"
  userId: string
  date: string                  // "2025-04-13"
  dateTimestamp: number         // Unix epoch
  excerpt: string               // first 8KB of contentText
  mood: number | null
  moodLabel: string | null
  tags: string[]
  wordCount: number
}
```

### Firestore Indexes
```json
[
  {
    "collectionGroup": "entries",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "deleted", "order": "ASCENDING" },
      { "fieldPath": "date", "order": "DESCENDING" }
    ]
  },
  {
    "collectionGroup": "entries",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "deleted", "order": "ASCENDING" },
      { "fieldPath": "tags", "arrayConfig": "CONTAINS" },
      { "fieldPath": "date", "order": "DESCENDING" }
    ]
  }
]
```

---

## Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
      match /entries/{entryId} {
        allow read, write: if request.auth.uid == userId;
      }
    }
  }
}
```

---

## Cloud Function: `getSearchKey`

**Location:** `functions/src/index.ts`

- Callable function, requires Firebase Auth
- Generates an Algolia secured API key scoped to `userId == request.auth.uid`
- Key TTL: 1 hour; client requests fresh key on load / expiry
- Client stores key in memory only (never localStorage)

```ts
export const getSearchKey = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Login required')
  const key = algoliaAdminClient.generateSecuredApiKey(
    ALGOLIA_SEARCH_ONLY_KEY,
    { filters: `userId:${uid}`, validUntil: nowPlusOneHour() }
  )
  return { key }
})
```

---

## Algolia Sync Strategy

Use the **Firebase Algolia Search Extension** (`firestore-algolia-search`):
- Watches `users/{userId}/entries/{entryId}`
- On create/update: indexes record with `excerpt` truncated to 8KB
- On delete: removes from index
- Secured key default filter: `deleted:false` — soft-deleted entries never appear in search

---

## Linting & Formatting

### ESLint (flat config)

```ts
// eslint.config.ts
import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import importPlugin from 'eslint-plugin-import'

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'import/order': ['error', { 'newlines-between': 'always' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.spec.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]
```

### Prettier

```ts
// prettier.config.ts
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  plugins: ['prettier-plugin-tailwindcss'],  // auto-sorts Tailwind classes
}
```

```text
# .prettierignore
dist/
.firebase/
functions/lib/
coverage/
playwright-report/
```

`package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## GitHub Actions

### `ci.yml` — runs on every PR and push to `main`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Start Firebase Emulators
        run: npx firebase emulators:start --only auth,firestore &
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
      - name: Wait for emulators
        run: npx wait-on http://localhost:8080 http://localhost:9099 --timeout 60000
      - run: npm run test:e2e
        env:
          VITE_USE_EMULATOR: true
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### `deploy.yml` — runs on merge to `main` only

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []   # depends on CI passing via branch protection rules
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: journal-manna
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_ALGOLIA_APP_ID: ${{ secrets.VITE_ALGOLIA_APP_ID }}
          VITE_BIBLE_API_KEY: ${{ secrets.VITE_BIBLE_API_KEY }}
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live
          projectId: journal-manna
```

**Required GitHub Secrets:**

| Secret | Source |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase console |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase console |
| `VITE_FIREBASE_PROJECT_ID` | Firebase console |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase console |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase console |
| `VITE_FIREBASE_APP_ID` | Firebase console |
| `VITE_ALGOLIA_APP_ID` | Algolia dashboard |
| `VITE_BIBLE_API_KEY` | scripture.api.bible dashboard |
| `FIREBASE_SERVICE_ACCOUNT` | `firebase init hosting:github` generates this |
| `FIREBASE_TOKEN` | `firebase login:ci` |

---

## Testing Strategy

### Unit + Integration Tests — Vitest + React Testing Library

Run against jsdom. Firebase is mocked via `firebase-mocks.ts`; no emulator needed for unit tests.

**`vitest.config.ts`**
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80, functions: 80 },
    },
  },
})
```

**`src/test/setup.ts`**

```ts
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Firebase modules globally
vi.mock('../lib/firebase')
vi.mock('../lib/firestore')
```

**What to unit-test:**

- `useEntry` — returns null for missing date, creates doc on save, debounces correctly; remote snapshot ignored when isDirty
- `useEntryDates` — maps Firestore snapshots to date sets
- `useStreak` — streak calculation (consecutive days, broken streak)
- `useInsights` — top tags ranking, mood aggregation
- `useDictation` — start/stop state transitions, error states (mocked SpeechRecognition)
- `MiniCalendar` — renders dots on correct dates, fires onDateSelect, month navigation
- `MoodPicker` — selects/deselects, calls onChange with correct value
- `TagInput` — shows autocomplete suggestions, creates new tag, removes tag
- `MetadataChips` — renders mood chip + tag chips, add button opens pickers
- `Chip` — renders label + icon, applies correct color classes
- `EntryListCard` — renders date, title, excerpt, mood chip, links to correct route

### E2E Tests — Playwright

Run against Firebase Emulator Suite (Auth + Firestore). Each test file gets a fresh emulator state via `beforeEach` reset.

**`playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'vite --mode test',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
})
```

**E2E test coverage:**

| File | Scenarios |
| --- | --- |
| `auth.spec.ts` | Google sign-in redirects to today; unauthenticated redirects to login |
| `editor.spec.ts` | Write text → auto-saves → shows "Draft saved"; save button persists to Firestore; dictation button activates (mic mock) |
| `history.spec.ts` | Calendar shows dots on days with entries; clicking a date navigates to that entry; entry cards render title + excerpt |
| `search.spec.ts` | Cmd+K opens modal; typing returns results; tag filter narrows results; date range filters work |
| `focus-mode.spec.ts` | Focus button hides nav + sidebar; visibility icon exits focus mode |

---

## Implementation Phases

### Phase 1 — Foundation

- [ ] **Manual step**: download a tileable paper grain PNG from [Subtle Patterns](https://www.toptal.com/designers/subtlepatterns/) and place at `public/textures/natural-paper.png`
- [ ] Vite + React + TypeScript scaffold
- [ ] Tailwind v4 CSS config (`globals.css` with `@theme {}` block — all design tokens)
- [ ] `globals.css`: Manrope + Material Symbols imports, base body styles
- [ ] Firebase project init (Auth, Firestore, Hosting, Functions)
- [ ] `firebase.ts` init, `.env.local` config; enable Firestore offline persistence via `enableIndexedDbPersistence(db)`
- [ ] Google Sign-In (`LoginPage.tsx`) — asymmetric layout with atmospheric image + glassmorphism quote card; `signInWithPopup` on desktop, `signInWithRedirect` on mobile (detected via userAgent); `getRedirectResult()` called on mount to handle redirect return
- [ ] Auth-gated routing (React Router v7)
- [ ] Firestore security rules deployed
- [ ] **Linting**: `eslint.config.ts` — TS, react-hooks, react-refresh, import-order rules
- [ ] **Formatting**: `prettier.config.ts` + `prettier-plugin-tailwindcss` + `.prettierignore`
- [ ] **Testing setup**: Vitest config, `src/test/setup.ts`, `firebase-mocks.ts`, `render.tsx` wrapper
- [ ] **Testing setup**: Playwright config, Firebase Emulator Suite wired to test env
- [ ] **CI/CD**: `.github/workflows/ci.yml` (lint + typecheck + unit + e2e) + `deploy.yml` (Firebase Hosting on main)
- [ ] All `package.json` scripts wired: `lint`, `format:check`, `typecheck`, `test`, `test:coverage`, `test:e2e`

### Phase 2 — App Shell
- [ ] `AppShell.tsx` — three-column layout (sidebar + main + right panel)
- [ ] `SideNav.tsx` — brand, nav items with active states, New Entry button, user profile + streak
- [ ] `useStreak.ts` — queries most recent consecutive entry dates; returns `{ current: number, longest: number }`
- [ ] `TopBar.tsx` — date display, draft saved indicator, avatar
- [ ] `BottomNav.tsx` — mobile glassmorphism nav (Entry, History, Focus)
- [ ] `RightPanel.tsx` — Focus Score, Word Count progress bars, Sanctuary Prompt quote, sync status
- [ ] Routes wired: `/` → TodayPage, `/entry/:date` → EntryPage, `/history` → HistoryPage, `/insights` → InsightsPage, `/settings` → SettingsPage, `/trash` → TrashPage
- [ ] **E2E**: `auth.spec.ts` — sign-in redirect + unauthenticated redirect

### Phase 3 — Core Editor
- [ ] `EntryEditor.tsx` — Tiptap with StarterKit, Placeholder, CharacterCount; transparent writing area styles
- [ ] `EditorToolbar.tsx` — formatting controls (bold, italic, bullet list, H2 heading); desktop only, fixed below TopBar
- [ ] Tiptap `BubbleMenu` — appears on text selection on mobile (bold, italic, bullet list, H2); touch-friendly tap targets
- [ ] `MetadataChips.tsx` — scrollable row of mood + tag chips + add button
- [ ] `FloatingActionBar.tsx` — Dictate (round) + Save (pill gradient); centered mobile, right-anchored desktop
- [ ] `useEntry.ts` — read/write/create entry for a given date; uses `onSnapshot` for real-time cross-device sync
- [ ] `isDirty` flag in `useEntry`: set on keystroke, cleared on save; remote snapshots are ignored while dirty (prevents remote overwrite of in-progress typing)
- [ ] Auto-save debounced 1.5s; "Draft saved Xm ago" indicator in TopBar
- [ ] `TodayPage.tsx` — loads today, creates doc if missing, scrolls to editor
- [ ] **Unit**: `useEntry.test.ts` — null on miss, creates on save, debounce
- [ ] **Unit**: `MetadataChips.test.tsx` — renders chips, add button
- [ ] **E2E**: `editor.spec.ts` — write → auto-save → save button → Firestore verify

### Phase 4 — Mood + Tags
- [ ] `MoodPicker.tsx` — 5-emoji row rendered as `secondary-container` chips, tap to select/deselect; shows moodLabel
- [ ] `TagInput.tsx` — chip-style autocomplete from `tagVocabulary`, create new inline, Material Symbol icon per tag
- [ ] Wire mood + tags through `MetadataChips.tsx` into entry save
- [ ] Update `tagVocabulary` on user doc (array union) on new tag creation
- [ ] **Unit**: `MoodPicker.test.tsx` — select/deselect, onChange value
- [ ] **Unit**: `TagInput.test.tsx` — autocomplete suggestions, create new, remove

### Phase 5 — Date Navigation + History
- [ ] `useEntryDates.ts` — query which dates in a month have entries (for dot indicators)
- [ ] `MiniCalendar.tsx` — 7-col month grid, entry dots, today highlight, out-of-month fade, prev/next month nav
- [ ] `MoodSummaryBar.tsx` — 4 colored bars + italic caption below calendar
- [ ] `EntryListCard.tsx` — date label + title + excerpt + mood chip + arrow
- [ ] `HistoryPage.tsx` — editorial header + bento grid (calendar left, cards right)
- [ ] `EntryPage.tsx` — `/entry/:YYYY-MM-DD` route, same editor layout as Today
- [ ] **Unit**: `useEntryDates.test.ts` — maps snapshots to date sets correctly
- [ ] **Unit**: `MiniCalendar.test.tsx` — dots on correct dates, month navigation, onDateSelect
- [ ] **Unit**: `EntryListCard.test.tsx` — renders date, title, excerpt, mood chip, links to correct route
- [ ] **E2E**: `history.spec.ts` — calendar dots, click-to-navigate, card rendering

### Phase 6 — Dictation
- [ ] `useDictation.ts` — Web Speech API wrapper (start, stop, interim results, error states)
- [ ] Wire to `EntryEditor.tsx` — appends transcript at cursor position
- [ ] Dictate button in `FloatingActionBar.tsx` — pulsing animation while listening
- [ ] Feature detection on mount: hide Dictate button entirely if `SpeechRecognition` / `webkitSpeechRecognition` unavailable (iOS Safari) — no error shown, button simply absent
- [ ] Error handling: mic permission denied → inline message below FAB
- [ ] **Unit**: `useDictation.test.ts` — state transitions, mocked SpeechRecognition, error paths
- [ ] **E2E**: `editor.spec.ts` — dictation button mock activates, transcript appended

### Phase 7 — Focus Mode
- [ ] `useFocusMode.ts` — global toggle state
- [ ] When active: hide `SideNav`, `RightPanel`, `BottomNav`, `TopBar`; minimal exit button (`visibility` icon, top-right)
- [ ] Smooth CSS transitions on show/hide
- [ ] **E2E**: `focus-mode.spec.ts` — toggle hides chrome, exit button restores

### Phase 8 — Search
- [ ] Firebase Algolia Extension deployed + configured
- [ ] `getSearchKey` Cloud Function deployed
- [ ] `algolia.ts` — init client with secured key (fetched on login, stored in memory)
- [ ] `SearchModal.tsx` — full-screen overlay, auto-focused input, same card styles as History
- [ ] `SearchFilters.tsx` — tag filter chips (secondary-container), mood selector (1–5), date range
- [ ] Cmd/Ctrl+K shortcut to open search (desktop); search icon button in mobile `TopBar.tsx` opens same modal
- [ ] Result cards link to `EntryPage`
- [ ] Empty state with prompt
- [ ] **E2E**: `search.spec.ts` — Cmd+K opens, typing returns results, facet filters narrow results

### Phase 9 — Soft Delete + Trash
- [ ] Delete button on entry (confirmation dialog matching design system)
- [ ] Sets `deleted: true`, `deletedAt: now()`
- [ ] `TrashPage.tsx` — lists soft-deleted entries with restore / permanent delete
- [ ] Firestore TTL policy for hard-delete after 30 days
- [ ] **Unit**: delete sets `deleted: true`; restore clears flag
- [ ] **E2E**: delete entry → gone from History → appears in Trash → restore

### Phase 10 — Insights
- [ ] `useInsights.ts` — streak, mood aggregation, tag frequency
- [ ] `InsightsPage.tsx` — editorial header + cards layout
- [ ] `MoodSparkline.tsx` — Recharts line chart, last 30/90 day toggle
- [ ] `TopTags.tsx` — horizontal bar chart, top 10
- [ ] Longest streak surfaced in `InsightsPage.tsx` via `useStreak.ts` (already wired in SideNav)
- [ ] **Unit**: `useStreak.test.ts` — consecutive days, broken streak, longest streak
- [ ] **Unit**: `useInsights.test.ts` — top-N tags, mood aggregation

### Phase 11 — Settings + Notifications

- [ ] `SettingsPage.tsx` — notification toggle, `<input type="time">` reminder picker (default 20:00), grain texture toggle (default on), scripture translation selector (NLT / MSG / ESV, default NLT), sign-out button; user avatar + display name at top
- [ ] On notification toggle on: request `Notification` permission → get FCM token → save `fcmToken`, `reminderEnabled: true`, `reminderTime`, `reminderTimezone` to user doc
- [ ] On toggle off: save `reminderEnabled: false`, set `fcmToken: null`
- [ ] `sendDailyReminders` Cloud Function: scheduled via Cloud Scheduler (runs every 5 minutes), queries users where `reminderEnabled == true`, checks if `reminderTime` falls within current 5-minute window for user's timezone, checks if user has an entry for today, sends FCM push if no entry found
- [ ] FCM push payload: title "Time to reflect ✨", body "Your sanctuary is waiting."
- [ ] Wire Settings route `/settings` + nav item in `SideNav` + `BottomNav`
- [ ] **Unit**: notification toggle saves correct fields to Firestore

### Phase 12 — PWA + Polish
- [ ] `vite-plugin-pwa` — manifest, service worker, offline cache
- [ ] PWA icons (192×192, 512×512) — use brand mark
- [ ] `firebase.json` hosting config + deploy script
- [ ] Loading skeletons (card-shaped, matching `surface-container` bg)
- [ ] Empty states: no entry today, no history entries, no search results
- [ ] Responsive QA: iOS Safari, Android Chrome, desktop Chrome/Firefox
- [ ] `natural-paper.png` grain overlay: low-opacity pseudo-element on `AppShell` root; toggled via `grainEnabled` user preference; CSS class `grain-enabled` on `<body>` controls visibility
- [ ] **E2E**: Playwright `mobile-safari` project runs full smoke suite on iPhone 14 viewport

---

## Environment Variables

```bash
# .env.local
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ALGOLIA_APP_ID=
VITE_BIBLE_API_KEY=        # scripture.api.bible — free tier key
# NO Algolia search key — fetched at runtime via Cloud Function
```

---

## Key Dependencies

```json
{
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "react-router-dom": "^7",
    "firebase": "^11",
    "algoliasearch": "^5",
    "react-instantsearch": "^7",
    "@tiptap/react": "^2",
    "@tiptap/starter-kit": "^2",
    "@tiptap/extension-placeholder": "^2",
    "@tiptap/extension-character-count": "^2",
    "@tiptap/extension-bubble-menu": "^2",
    "@tiptap/extension-heading": "^2",
    "recharts": "^2",
    "date-fns": "^4",
    "tailwindcss": "^4",
    "clsx": "^2"
  },
  "devDependencies": {
    "vite": "^6",
    "@vitejs/plugin-react": "^4",
    "vite-plugin-pwa": "^1",
    "typescript": "^5",
    "firebase-tools": "^14",

    "vitest": "^3",
    "@vitest/coverage-v8": "^3",
    "@vitest/ui": "^3",
    "@testing-library/react": "^16",
    "@testing-library/user-event": "^14",
    "@testing-library/jest-dom": "^6",
    "jsdom": "^26",

    "@playwright/test": "^1",
    "@firebase/rules-unit-testing": "^3",

    "eslint": "^9",
    "@eslint/js": "^9",
    "@typescript-eslint/eslint-plugin": "^8",
    "@typescript-eslint/parser": "^8",
    "eslint-plugin-react-hooks": "^5",
    "eslint-plugin-react-refresh": "^0.4",
    "eslint-plugin-import": "^2",

    "prettier": "^3",
    "prettier-plugin-tailwindcss": "^0.6",
    "wait-on": "^8"
  }
}
```

> Note: No shadcn/ui — the design system is fully bespoke. All components are hand-built to spec.

---

## Open Questions (Decide Before Phase 8)

1. **Algolia plan** — Free tier (10K records, 10K searches/month) sufficient for MVP?
2. **Cloud Functions runtime** — Node 22 (current Firebase-supported LTS)
3. **Custom domain** — `journal-manna.web.app` for MVP; custom domain can be added later via Firebase Hosting console
4. **30-day hard delete** — Firestore TTL policy on `deletedAt` field (configured in Firestore console, no code needed)
5. **Inspiration image** — removed from MVP
6. **Mood AI caption** — static, derived client-side from average mood value (e.g. "A calm month — mostly peaceful days")
