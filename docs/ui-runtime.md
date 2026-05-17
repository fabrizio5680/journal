# UI and Runtime Behavior

These are behavior details worth preserving when editing navigation, editor
metadata, search, dictation, and local state.

## Search and Empty States

`SearchModal` loads available tags from the local metadata index, sorted by
frequency, when it opens. `SearchFilters` renders a `TagFilter` chip row showing
tags with `#` prefix. Selecting tags narrows results to entries that contain all
selected tags.

When no local entries exist and Google Drive is not connected, `SearchModal`
shows a Drive connection notice. `InsightsPage` shows an inline Drive connection
prompt when `totalEntries === 0` and Drive is disconnected, so users understand
why charts are empty.

## Navigation

- The Today button in `SideNav` and `BottomNav` navigates with
  `state: { navigatedAt: Date.now() }` so React Router always generates a new
  location key, even when the user is already at `/`. This is intentional.
- `TodayPage` derives `today` via
  `useMemo(() => format(new Date(), 'yyyy-MM-dd'), [locationKey, reactiveToday])`.
  The `locationKey` dependency ensures a fresh `new Date()` read on every
  navigation event; `reactiveToday` from `useToday()` keeps midnight rollover
  working as belt-and-suspenders.
- `BottomNav` uses a `<button>` for Today, not a `<NavLink>`. Active styling is
  computed from `pathname === '/'` rather than React Router's `isActive`.

## UI Rules

- Mobile metadata lives in `MetadataBar` and `MetadataSheet`. The sheet is a
  `document.body` portal and supports `initialSection` deep links for mood,
  scripture, and tags.
- In focus mode, mobile metadata slides away with the same transition as
  `TopBar`.
- Desktop/tablet metadata lives in `RightPanel`.
- On desktop, `RightPanel` renders Mood as a custom button/listbox dropdown with
  placeholder `How are you feeling?` when unset and `emoji label` when selected.
  A `— No mood` option at the top of the list deselects the mood.
- `MoodPicker` accepts `variant?: 'pills' | 'dropdown'`, defaulting to `pills`.
  `RightPanel` passes `variant="dropdown"`; mobile `MetadataSheet` keeps the
  pill row.
- `RightPanel` Mood section is always expanded and never collapsible.
- `RightPanel` Scripture label is singular only for exactly one item.
- Tags are stored without `#` and displayed with `#`. Use `normalizeTag` before
  storing and add the prefix only at render time.
- `TagInput` dropdown opens upward in the right panel.
- `EntryEditor` renders a Tiptap `BubbleMenu` for bold/italic on selection and a
  `FloatingMenu` on empty paragraphs offering an `Insert time` action that
  inserts a level-2 heading containing the current locale time
  (`format(new Date(), 'p')`) followed by an empty paragraph, for marking
  timestamped sections within an entry.
- The `FloatingMenu` is configured with floating-ui `placement: 'left'`,
  `offset: 12`, and `flip: { fallbackPlacements: ['right'] }`, so the
  `Insert time` button sits in the desktop left gutter outside the writing zone
  and flips to the right of the cursor on narrow viewports. The button is a
  standalone 28px round icon button (`schedule` material symbol) with no
  surrounding container chrome.

## Dictation

`useDictation` wraps the Web Speech API in continuous mode.

- `interimTranscript` flows through `EditorControlsContext.DictationControls`.
- Explicit stop uses `abort()` to discard in-flight audio.
- Handled errors include `not-allowed`, `service-not-allowed`, `network`,
  `audio-capture`, `language-not-supported`, and `aborted`.

## Device-Local State

Important localStorage keys:

- `pref_editor_font_size`: `small | medium | large`; device-local only.
- `scripture_<T>_<date>`: cached daily verse.
- `fcm_device_token_<uid>`: per-device FCM token.
- `google_drive_connection_<uid>`: cached Drive provider metadata, no tokens.
- `google_drive_disconnected_<uid>`: device opt-out for Drive auto-hydration.

IndexedDB database `quiet-dwelling` contains `entries`, `metadata`, `syncState`,
and `deviceIdentity` stores. `syncState` tracks Drive polling state such as
start-page token, entry folder ID, month folder IDs, and last poll time.
`deviceIdentity` stores account-bound device fingerprints keyed by user and
browser fingerprint; conflict attribution should use `getDeviceFingerprint(uid)`
rather than localStorage.

`UserPreferencesContext` initializes editor font size from localStorage, may seed
once from Firestore if absent, and then writes only to localStorage.
