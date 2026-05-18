# Quiet Dwelling - Agent Notes

Keep this file lean. It should orient a coding assistant quickly, capture only
the highest-priority project rules, and point to deeper docs instead of
repeating them.

## Working Rules

- Skip files over 100KB unless the task clearly requires them.
- Prefer the existing architecture and component patterns over new abstractions.
- Keep journal content out of Firestore. Runtime entry bodies must flow through
  `EntryRepository` and the local/Drive storage path.
- Do not revert unrelated local changes. This repo often has work in progress.
- For library, framework, SDK, API, CLI, or cloud-service details, use Context7
  before relying on memory. Start with library resolution, then query the
  selected docs with the full implementation question.
- Do not use Context7 for app-specific business logic, refactors that do not
  depend on external APIs, one-off scripts, or code review.

## Product

- App: Quiet Dwelling
- Tagline: A quiet place to reflect, pray, and journal.
- Domain: `thequietdwelling.com`
- Firebase project: `journal-manna`
- Hosting: `journal-manna.web.app`

## Stack

- React 19, Vite 8, TypeScript 6
- React Router 7
- Tailwind CSS 4 with CSS-first tokens in `src/styles/globals.css` under
  `@theme`; there is no `tailwind.config.ts`
- Firebase 12: Auth, Firestore, Hosting, Cloud Functions on Node 22
- Tiptap 3: StarterKit, Placeholder, CharacterCount, BubbleMenu, FloatingMenu,
  Heading H2 only
- date-fns 4, Recharts 3, clsx 2
- ESLint 9, Vitest, Playwright
- Material Symbols Outlined and Manrope from Google Fonts

## Commands

```sh
npm run dev            # Vite dev server
npm run build          # tsc && vite build
npm run lint           # eslint . --max-warnings 0
npm run lint:fix
npm run format
npm run format:check
npm run typecheck      # tsc --noEmit
npm run test           # vitest run
npm run test:run       # app + functions tests
npm run test:coverage
npm run test:e2e       # playwright test
npm run precommit      # format + lint + typecheck
```

Use `VITE_FAKE_DRIVE=true` for E2E sync tests. The fake Drive backend is
`src/lib/storage/providers/fakeGoogleDriveBackend.ts` and seeds from
`window.__fakeDriveSeedData`.

## Important Paths

```text
src/components/editor/    editor, metadata sheet/bar, remote-update UI
src/components/layout/    shell, nav, top bar, right panel
src/components/search/    local-first search UI
src/context/              save status, focus mode, preferences, editor controls
src/hooks/                entry, search, insights, dictation, sync hooks
src/lib/storage/          repository, cache, Drive sync, merge, delta polling
functions/src/index.ts    reminders and Google Drive token broker
docs/                     durable architecture, data model, design, testing notes
e2e/                      Playwright specs
```

## Reference Docs

- `docs/architecture.md`: durable architecture decisions around entries, auth,
  contexts, notifications, preferences, and scripture.
- `docs/storage-sync.md`: local-first storage, Google Drive sync, manifests,
  sync APIs, retry/abort policy, conflicts, and repository save guards.
- `docs/ui-runtime.md`: UI behavior worth preserving, navigation details, search
  empty states, dictation, and device-local state.
- `docs/data-model.md`: Firestore metadata, entry file contract, mood mapping,
  and scripture refs.
- `docs/design-system.md`: tokens and component patterns.
- `docs/testing.md`: E2E conventions, emulator seeding, serial mode.
- `docs/environment.md`: browser and Functions environment variables.
