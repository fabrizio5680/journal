# Phase 6 — Dictation

## Goal

Wire up the Web Speech API for real-time voice-to-text dictation. Appends transcript at
cursor position in the Tiptap editor. Hidden on iOS Safari. Pulsing animation while active.

## Prerequisites

- Phase 3 complete — `EntryEditor` and `FloatingActionBar` built (dictate button is a stub)

## Checklist

- [ ] `useDictation.ts` — Web Speech API wrapper (see useDictation section)
- [ ] Wire `useDictation` into `EntryEditor.tsx` — interim results appended at cursor
- [ ] `FloatingActionBar.tsx` — activate dictation button: pulsing animation while listening, mic-off icon when active
- [ ] Feature detect on mount: hide Dictate button if `SpeechRecognition` / `webkitSpeechRecognition` unavailable (iOS Safari)
- [ ] Error state: mic permission denied → inline message below the FAB (`text-xs text-error`)
- [ ] **Unit**: `useDictation.test.ts`
- [ ] **E2E**: add dictation scenario to `e2e/editor.spec.ts`

## useDictation

**Location:** `src/hooks/useDictation.ts`

```ts
type DictationState = 'idle' | 'listening' | 'error'

interface UseDictationReturn {
  isSupported: boolean // false on iOS Safari
  state: DictationState
  errorMessage: string | null
  start: () => void
  stop: () => void
}

function useDictation(onTranscript: (text: string) => void): UseDictationReturn
```

**Implementation notes:**

```ts
// Feature detect
const SpeechRecognitionClass = window.SpeechRecognition || (window as any).webkitSpeechRecognition
const isSupported = Boolean(SpeechRecognitionClass)

// Setup
recognition.continuous = true
recognition.interimResults = true
recognition.lang = navigator.language || 'en-US'

// On result: fire onTranscript with the final segment when isFinal === true
// On error 'not-allowed': set state = 'error', errorMessage = 'Microphone permission denied'
// On error 'no-speech': restart silently after 2s
// On end: if state === 'listening', restart (continuous mode)
```

**Cleanup:** call `recognition.stop()` on unmount.

## FloatingActionBar (updated)

When `state === 'listening'`:

- Dictate button gets a pulsing ring animation:
  ```
  animate-pulse ring-2 ring-primary ring-offset-2
  ```
- Icon changes to `mic_off` (tap to stop)

When `state === 'error'`:

- Show `<p className="text-xs text-error absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">{errorMessage}</p>` above the FAB

## Transcript Insertion

In `EntryEditor.tsx`, pass a callback to `useDictation`:

```ts
const { isSupported, state, start, stop } = useDictation((text) => {
  editor
    .chain()
    .focus()
    .insertContent(text + ' ')
    .run()
})
```

This inserts transcript at the current cursor position. If the editor is unfocused, Tiptap
inserts at the end of the document.

## Unit Tests — useDictation.test.ts

Mock `window.SpeechRecognition` in the test environment:

```ts
// - isSupported = false when SpeechRecognition not in window
// - isSupported = true when mock SpeechRecognition is present
// - state transitions: idle → listening on start(), listening → idle on stop()
// - onTranscript called when final result fires
// - state = 'error' and errorMessage set when 'not-allowed' error fires
// - stop() called on unmount (cleanup)
```

## E2E — editor.spec.ts (additional scenario)

```ts
// Scenario: mock SpeechRecognition in Playwright browser context
// - Dictate button visible on Chromium (hidden on mobile-safari project)
// - Click Dictate → button gets pulsing ring
// - Mock fires onresult event → text appears in editor
// - Click mic-off → button returns to idle state
```
