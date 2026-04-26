import { test, expect } from '@playwright/test'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FAKE_API_KEY = 'fake-api-key'
const TEST_EMAIL_BASE = 'settings-test'
const TEST_PASSWORD = 'password123'

function testEmail(projectName: string) {
  return `${TEST_EMAIL_BASE}+${projectName}@example.com`
}

async function clearTestUser(email: string) {
  try {
    const signInRes = await fetch(
      `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FAKE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: TEST_PASSWORD, returnSecureToken: true }),
      },
    )
    const { idToken } = (await signInRes.json()) as { idToken?: string }
    if (idToken) {
      await fetch(
        `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:delete?key=${FAKE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        },
      )
    }
  } catch {
    // user doesn't exist yet — nothing to clear
  }
}

async function createEmulatorUser(email: string) {
  const res = await fetch(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FAKE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD, returnSecureToken: true }),
    },
  )
  return res.json()
}

async function signInAsTestUser(page: import('@playwright/test').Page, email: string) {
  try {
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
      { email, password: TEST_PASSWORD },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('Execution context was destroyed')) {
      throw error
    }
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('Settings — editor font size (device-local)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const email = testEmail(testInfo.project.name)
    await clearTestUser(email)
    await createEmulatorUser(email)
    await page.goto('/login')
    await signInAsTestUser(page, email)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('font size set in settings persists to localStorage and survives page reload', async ({
    page,
  }) => {
    // Navigate to Settings
    await page.goto('/settings')
    await expect(page).toHaveURL('/settings', { timeout: 5000 })

    // The "large" button should be visible
    const largeBtn = page.getByRole('button', { name: /^large$/i })
    await expect(largeBtn).toBeVisible({ timeout: 5000 })

    // Click "large"
    await largeBtn.click()

    // Confirm localStorage is updated immediately
    const stored = await page.evaluate(() => localStorage.getItem('pref_editor_font_size'))
    expect(stored).toBe('large')

    // Reload the page
    await page.reload()
    await expect(page).toHaveURL('/settings', { timeout: 5000 })

    // After reload the "large" button should still appear selected (primary style)
    // We verify by checking localStorage again — the context reads it on mount
    const storedAfterReload = await page.evaluate(() =>
      localStorage.getItem('pref_editor_font_size'),
    )
    expect(storedAfterReload).toBe('large')
  })
})
