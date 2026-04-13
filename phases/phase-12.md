# Phase 12 — PWA + Polish

## Goal

Make the app installable as a PWA, add loading skeletons, empty states, and complete
responsive QA on mobile Safari and desktop. This is the final phase before launch.

## Prerequisites

- All phases 1–11 complete

## Checklist

### PWA

- [ ] `vite.config.ts` — add `vite-plugin-pwa` with manifest + service worker config (see PWA section)
- [ ] `public/icons/icon-192.png` + `public/icons/icon-512.png` — brand mark PWA icons (**manual**: create using the app logo mark)
- [ ] Verify installable: Chrome → address bar → install icon appears
- [ ] Verify offline: disable network → previously visited entries load from cache
- [ ] Service worker caches: app shell, Tailwind CSS, Google Fonts, Tiptap assets

### Loading Skeletons

- [ ] `EntryListCard` skeleton — card-shaped with animated pulse
- [ ] `MiniCalendar` skeleton — grid-shaped pulse
- [ ] `RightPanel` scripture skeleton — text lines pulse
- [ ] `InsightsPage` stats + charts skeleton
- [ ] All skeletons use `bg-surface-container animate-pulse rounded-xl` blocks

### Empty States

- [ ] `TodayPage` — first time ever: "Welcome to your sanctuary. Start writing." prompt
- [ ] `HistoryPage` — no entries: "Your story begins here." with a gentle prompt
- [ ] `TrashPage` — empty: "Your trash is empty." with `delete` icon
- [ ] `InsightsPage` — not enough data: "Write a few entries to see your patterns."
- [ ] `SearchModal` — no results for query: "No entries found for '{query}'"
- [ ] All empty states use `text-on-surface-variant` + `text-center` + appropriate Material Symbol icon

### Responsive QA

- [ ] Test all pages on iPhone 14 viewport (Playwright `mobile-safari` project)
- [ ] Test all pages on iPad viewport (`tablet` Playwright project — add `{ name: 'tablet', use: { ...devices['iPad Pro'] } }`)
- [ ] Verify: no horizontal overflow on any page
- [ ] Verify: bottom nav doesn't overlap FAB
- [ ] Verify: search modal input is keyboard-accessible on mobile
- [ ] Verify: Tiptap editor doesn't zoom on focus (add `user-scalable=no` to viewport meta? Or `font-size: 16px` on input — preferred)

### Polish

- [ ] `firebase.json` — hosting rewrites: `{ "source": "**", "destination": "/index.html" }` for SPA routing
- [ ] 404 page — minimal, redirects to `/` after 3s
- [ ] `<title>` updates per page via React Router (use `document.title` or a custom hook)
- [ ] Favicon — use brand mark icon

## PWA Config (vite.config.ts)

```ts
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com/,
        handler: 'CacheFirst',
        options: { cacheName: 'google-fonts', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com/,
        handler: 'CacheFirst',
        options: { cacheName: 'gstatic-fonts', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } },
      },
    ],
  },
  manifest: {
    name: 'The Quiet Sanctuary',
    short_name: 'Reflect',
    description: 'Your personal journalling sanctuary',
    theme_color: '#526448',
    background_color: '#faf9f7',
    display: 'standalone',
    orientation: 'portrait',
    start_url: '/',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  },
})
```

## firebase.json (hosting section)

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

## Skeleton Component Pattern

```tsx
// Example: EntryListCard skeleton
function EntryListCardSkeleton() {
  return (
    <div className="bg-surface-container-lowest animate-pulse rounded-[2rem] p-6">
      <div className="bg-surface-container mb-3 h-3 w-24 rounded-xl" />
      <div className="bg-surface-container mb-2 h-6 w-3/4 rounded-xl" />
      <div className="bg-surface-container mb-1 h-4 w-full rounded-xl" />
      <div className="bg-surface-container h-4 w-2/3 rounded-xl" />
    </div>
  )
}
```

## Mobile Safari Gotcha

Tiptap editor on iOS Safari may zoom in when focused (browser default for inputs < 16px font).
Fix: ensure the editor's font size is `text-xl` (20px) or add to `globals.css`:

```css
input,
textarea,
[contenteditable] {
  font-size: max(16px, 1em);
}
```

## E2E — mobile-safari project

The `playwright.config.ts` `mobile-safari` project already defined in Phase 1 runs all existing
specs on iPhone 14 viewport. No new spec file needed — existing specs cover the smoke suite.

Add to `playwright.config.ts`:

```ts
{ name: 'tablet', use: { ...devices['iPad Pro 11'] } },
```

Run with: `npx playwright test --project=mobile-safari`
