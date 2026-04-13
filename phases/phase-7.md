# Phase 7 — Focus Mode

## Goal

Distraction-free writing mode. Hides all app chrome — sidebar, top bar, bottom nav, right panel,
FABs — leaving only the writing canvas. Smooth CSS transitions. Exit button top-right.

## Prerequisites

- Phase 3 complete — editor works
- Phase 2 complete — AppShell chrome elements exist

## Checklist

- [ ] `useFocusMode.ts` — global toggle state (see below)
- [ ] `AppShell.tsx` — reads `useFocusMode`, conditionally hides `SideNav`, `RightPanel`, `TopBar`, `BottomNav`
- [ ] Focus exit button: `visibility` icon, `fixed top-4 right-4 z-50`, appears only when focus is active
- [ ] Smooth transitions: `transition-all duration-500` on show/hide of each chrome element (slide + fade)
- [ ] Focus nav item in `BottomNav` toggles focus mode
- [ ] **E2E**: `e2e/focus-mode.spec.ts`

## useFocusMode

**Location:** `src/hooks/useFocusMode.ts`

```ts
// Simple module-level state or React context — accessible from AppShell + BottomNav
// { isFocused: boolean, toggle: () => void, exit: () => void }
// Use React context so both AppShell and BottomNav share the same state
```

## AppShell (updated)

```tsx
const { isFocused } = useFocusMode()

// Each chrome element gets:
// SideNav:    className={clsx('...', isFocused && 'hidden md:-translate-x-full opacity-0 pointer-events-none')}
// RightPanel: className={clsx('...', isFocused && 'xl:hidden')}
// TopBar:     className={clsx('...', isFocused && '-translate-y-full opacity-0 pointer-events-none')}
// BottomNav:  className={clsx('...', isFocused && 'translate-y-full opacity-0 pointer-events-none')}
// All with: transition-all duration-500
```

Exit button (always mounted, visible only when focused):

```tsx
{isFocused && (
  <button
    onClick={exit}
    className="fixed top-4 right-4 z-50 p-2 bg-surface-container/80 backdrop-blur-sm rounded-full
               text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
  >
    <span className="material-symbols-outlined">visibility</span>
  </button>
)}
```

Editor area padding: when focused, expand to full screen (`md:ml-0 xl:mr-0` overrides).

## E2E — focus-mode.spec.ts

```ts
// Setup: sign in, navigate to /
// Scenario 1: click Focus in BottomNav (mobile) → SideNav hidden, BottomNav hidden, TopBar hidden
// Scenario 2: visibility exit button visible in focus mode → clicking it restores all chrome
// Scenario 3: writing area is still functional in focus mode (type text, verify it appears)
```
