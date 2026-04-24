# E2E Testing Conventions

- Each spec file uses a **unique test email** (e.g. `trash-test@example.com`) to avoid cross-spec collisions.
- `clearTestUser()` signs in with the spec's test credentials and self-deletes (via `accounts:delete`) rather than wiping all emulator users. This keeps parallel specs from invalidating each other's auth tokens.
- All specs that share emulator state across tests include `test.describe.configure({ mode: 'serial' })` to prevent within-file parallelism.
- Firestore REST seeding calls (`request.patch`) **must** include `Authorization: Bearer {idToken}` — the emulator enforces security rules on the `/v1/` REST path.
- `LoginPage` has an `onAuthStateChanged` listener that navigates to `/` on sign-in; this is what makes `__signInForTest` redirect E2E tests out of the login page.
