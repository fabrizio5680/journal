import { test, expect } from '@playwright/test'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const PROJECT_ID = 'journal-manna'
const FAKE_API_KEY = 'fake-api-key'

async function clearEmulatorUsers() {
  await fetch(`${EMULATOR_AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  }).catch(() => {
    /* ignore if emulator not running */
  })
}

async function createEmulatorUser(email: string, password: string) {
  const res = await fetch(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FAKE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  return res.json()
}

test.describe('Auth redirects', () => {
  test.beforeEach(async () => {
    await clearEmulatorUsers()
  })

  test('unauthenticated user visiting / is redirected to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('authenticated users visiting /login are redirected to /', async ({ page }) => {
    const email = 'test@example.com'
    const password = 'password123'

    await createEmulatorUser(email, password)

    // First navigate so the app loads and connects to the emulator
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)

    // Sign in via the test helper exposed in emulator mode
    await page.evaluate(
      async ({ email, password }: { email: string; password: string }) => {
        const signIn = (
          window as typeof window & {
            __signInForTest?: (e: string, p: string) => Promise<void>
          }
        ).__signInForTest
        if (!signIn) throw new Error('__signInForTest not available — is VITE_USE_EMULATOR=true?')
        await signIn(email, password)
      },
      { email, password },
    )

    // After sign-in the app should navigate to /
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })
})
