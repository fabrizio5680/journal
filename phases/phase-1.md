# Phase 1 — Foundation

## Goal

Scaffold the entire project skeleton: Vite + React + TypeScript, Tailwind v4, Firebase init,
Google Sign-In, Firestore security rules, ESLint, Prettier, Vitest, Playwright, and GitHub Actions CI/CD.
No feature logic — just the foundation everything else builds on.

## Prerequisites

- Firebase project `journal-manna` already created in the Firebase console
- Google Auth provider enabled in Firebase console
- Node 22 installed locally
- `firebase-tools` v14 installed globally (`npm i -g firebase-tools`)
- Free API.Bible key obtained from scripture.api.bible (for `VITE_BIBLE_API_KEY`)

## Checklist

- [ ] **Manual step**: download a tileable paper grain PNG from [Subtle Patterns](https://www.toptal.com/designers/subtlepatterns/) and place at `public/textures/natural-paper.png`
- [ ] Scaffold with `npm create vite@latest . -- --template react-ts`
- [ ] Install all dependencies (see Dependencies section below)
- [ ] `src/styles/globals.css` — full `@theme {}` block with all color tokens, Manrope + Material Symbols Google Fonts imports, base body styles, Material Symbols base class, `::selection` override
- [ ] `vite.config.ts` — `@vitejs/plugin-react` + path alias `@` → `src/`
- [ ] `tsconfig.json` — strict mode, path aliases matching vite
- [ ] `firebase.ts` — Firebase app init, Auth, Firestore exports; enable `enableIndexedDbPersistence(db)` for offline write support
- [ ] `.env.local` — all `VITE_FIREBASE_*` vars + `VITE_ALGOLIA_APP_ID` + `VITE_BIBLE_API_KEY`
- [ ] `firestore.rules` — user-scoped read/write rules (see Rules section)
- [ ] `firestore.indexes.json` — composite indexes (see Indexes section)
- [ ] `firebase.json` — hosting + firestore + functions config
- [ ] `.firebaserc` — `{ "projects": { "default": "journal-manna" } }`
- [ ] `LoginPage.tsx` — asymmetric layout; Google Sign-In with popup (desktop) / redirect (mobile); `getRedirectResult()` on mount; scripture fallback verse on right panel
- [ ] `App.tsx` — auth state listener; routes: `/login` (public) + all others (auth-gated)
- [ ] React Router v7 routes: `/` → TodayPage stub, `/history` → stub, `/insights` → stub, `/settings` → stub, `/trash` → stub, `/entry/:date` → stub
- [ ] `eslint.config.ts` — flat config (see ESLint section)
- [ ] `prettier.config.ts` + `.prettierignore` (see Prettier section)
- [ ] `vitest.config.ts` (see Testing section)
- [ ] `src/test/setup.ts` — `@testing-library/jest-dom` import + global Firebase mocks
- [ ] `src/test/firebase-mocks.ts` — Firestore/Auth mock factories
- [ ] `src/test/render.tsx` — custom render wrapper (Router + AuthContext)
- [ ] `playwright.config.ts` (see Testing section)
- [ ] `.github/workflows/ci.yml` (see CI/CD section)
- [ ] `.github/workflows/deploy.yml` (see CI/CD section)
- [ ] All `package.json` scripts wired: `dev`, `build`, `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test`, `test:coverage`, `test:e2e`
- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (setup files only, no real tests yet)

## Login Page Design

**Layout:** Asymmetric split — `flex h-screen`

**Left panel** (`w-full md:w-[45%] bg-surface-container-lowest flex flex-col justify-center px-12 z-10`):

- Logo mark: `w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center` + `edit_note` Material Symbol icon
- Wordmark: "The Quiet Sanctuary" `text-xl font-black text-on-surface`
- Hero: `text-4xl font-extrabold text-on-surface` headline + `text-on-surface-variant` subtitle
- Google Sign-In button: `bg-surface-container border border-outline-variant/20 hover:bg-surface-container-high rounded-full py-4 px-6 font-semibold w-full flex items-center gap-3`
- Privacy note: `text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/60` at bottom

**Right panel** (desktop only, `hidden md:flex flex-grow relative overflow-hidden`):

- Full-bleed atmospheric photo with `grayscale-[20%] object-cover w-full h-full`
- Glassmorphism scripture card: `absolute bottom-12 left-12 right-12 bg-surface/70 backdrop-blur-2xl rounded-[2rem] border border-surface-container-lowest/30 p-8`
  - `format_quote` icon + hardcoded fallback verse (italic `text-2xl font-light`) + reference

**Mobile sign-in logic:**

```ts
const isMobile = /Mobi|Android/i.test(navigator.userAgent)
isMobile ? signInWithRedirect(auth, provider) : signInWithPopup(auth, provider)
// On mount:
getRedirectResult(auth).then((result) => {
  if (result) navigate('/')
})
```

## Tailwind v4 globals.css

```css
@import 'tailwindcss';
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');

@theme {
  --color-background: #faf9f7;
  --color-surface: #faf9f7;
  --color-surface-bright: #faf9f7;
  --color-surface-dim: #d9dad8;
  --color-surface-variant: #e1e3e0;
  --color-surface-container-lowest: #ffffff;
  --color-surface-container-low: #f4f4f1;
  --color-surface-container: #edeeec;
  --color-surface-container-high: #e7e8e6;
  --color-surface-container-highest: #e1e3e0;
  --color-on-surface: #303331;
  --color-on-surface-variant: #5d605e;
  --color-on-background: #303331;
  --color-primary: #526448;
  --color-primary-dim: #46583d;
  --color-primary-fixed: #d4e9c5;
  --color-primary-fixed-dim: #c6dbb8;
  --color-primary-container: #d4e9c5;
  --color-on-primary: #ecffdd;
  --color-on-primary-fixed: #33442a;
  --color-on-primary-fixed-variant: #4f6145;
  --color-on-primary-container: #45573b;
  --color-inverse-primary: #e8fdd8;
  --color-surface-tint: #526448;
  --color-secondary: #645e54;
  --color-secondary-dim: #585348;
  --color-secondary-fixed: #eae1d4;
  --color-secondary-fixed-dim: #dcd3c6;
  --color-secondary-container: #eae1d4;
  --color-on-secondary: #fff8ef;
  --color-on-secondary-fixed: #433f35;
  --color-on-secondary-fixed-variant: #605b51;
  --color-on-secondary-container: #565147;
  --color-tertiary: #65612a;
  --color-tertiary-dim: #58551f;
  --color-tertiary-fixed: #fdf6b0;
  --color-tertiary-fixed-dim: #eee8a3;
  --color-tertiary-container: #fdf6b0;
  --color-on-tertiary: #fffada;
  --color-on-tertiary-fixed: #4f4b16;
  --color-on-tertiary-fixed-variant: #6c6830;
  --color-on-tertiary-container: #615d27;
  --color-outline: #797b79;
  --color-outline-variant: #b0b2b0;
  --color-error: #a73b21;
  --color-error-dim: #791903;
  --color-error-container: #fd795a;
  --color-on-error: #fff7f6;
  --color-on-error-container: #6e1400;
  --color-inverse-surface: #0d0e0e;
  --color-inverse-on-surface: #9d9d9b;

  --radius: 0.125rem;
  --radius-lg: 0.25rem;
  --radius-xl: 0.5rem;
  --radius-full: 0.75rem;

  --font-headline: 'Manrope', sans-serif;
  --font-body: 'Manrope', sans-serif;
  --font-label: 'Manrope', sans-serif;
  --font-manrope: 'Manrope', sans-serif;
}

.material-symbols-outlined {
  font-variation-settings:
    'FILL' 0,
    'wght' 400,
    'GRAD' 0,
    'opsz' 24;
}

::selection {
  background-color: var(--color-primary-container);
  color: var(--color-on-primary-container);
}

body {
  font-family: 'Manrope', sans-serif;
  background-color: var(--color-background);
  color: var(--color-on-surface);
}
```

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

## Firestore Composite Indexes (firestore.indexes.json)

```json
{
  "indexes": [
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
  ],
  "fieldOverrides": []
}
```

## ESLint (eslint.config.ts)

```ts
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

## Prettier (prettier.config.ts)

```ts
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  plugins: ['prettier-plugin-tailwindcss'],
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

## Vitest Config (vitest.config.ts)

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
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

## Playwright Config (playwright.config.ts)

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

## GitHub Actions

### .github/workflows/ci.yml

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
        with: { name: coverage, path: coverage/ }

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
        with: { name: playwright-report, path: playwright-report/ }
```

### .github/workflows/deploy.yml

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
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

## Required GitHub Secrets

| Secret                              | Source                         |
| ----------------------------------- | ------------------------------ |
| `VITE_FIREBASE_API_KEY`             | Firebase console               |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Firebase console               |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Firebase console               |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase console               |
| `VITE_FIREBASE_APP_ID`              | Firebase console               |
| `VITE_ALGOLIA_APP_ID`               | Algolia dashboard              |
| `VITE_BIBLE_API_KEY`                | scripture.api.bible dashboard  |
| `FIREBASE_SERVICE_ACCOUNT`          | `firebase init hosting:github` |
| `FIREBASE_TOKEN`                    | `firebase login:ci`            |

## Dependencies

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
