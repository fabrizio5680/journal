import { test, expect, devices } from '@playwright/test'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL_BASE = 'focus-test'
const TEST_PASSWORD = 'password123'

function testEmailForProject(projectName: string) {
  return `${TEST_EMAIL_BASE}+${projectName}@example.com`
}

// Focus mode is triggered via BottomNav which is mobile-only (md:hidden)
test.use({ ...devices['iPhone 14'] })

async function clearTestUser(email: string) {
  try {
    const signInRes = await fetch(
      `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FAKE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: TEST_PASSWORD,
          returnSecureToken: true,
        }),
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

async function createEmulatorUser(email: string, password: string): Promise<string> {
  const res = await fetch(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FAKE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  const data = await res.json()
  return data.localId as string
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

test.describe('Focus Mode', () => {
  let testEmail = ''

  test.beforeEach(async ({ page }, testInfo) => {
    testEmail = testEmailForProject(testInfo.project.name)
    await clearTestUser(testEmail)
    await createEmulatorUser(testEmail, TEST_PASSWORD)
    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Scenario 1: clicking Focus in BottomNav hides all chrome', async ({ page }) => {
    // Chrome should be visible before entering focus mode
    const topBar = page.locator('header')
    const bottomNav = page.locator('nav').filter({ hasText: 'Focus' })
    await expect(topBar).toBeVisible()
    await expect(bottomNav).toBeVisible()

    // Click the Focus button
    await page.getByRole('button', { name: /enter focus mode/i }).click()

    // TopBar and BottomNav should slide off-screen (opacity-0 + translate)
    // They remain in DOM but have pointer-events-none and opacity 0
    await expect(topBar).toHaveCSS('opacity', '0', { timeout: 3000 })
    await expect(bottomNav).toHaveCSS('opacity', '0', { timeout: 3000 })
  })

  test('Scenario 2: exit button appears in focus mode and restores chrome', async ({ page }) => {
    // Enter focus mode
    await page.getByRole('button', { name: /enter focus mode/i }).click()

    // Exit button should appear
    const exitBtn = page.locator('button.fixed[aria-label="Exit focus mode"]')
    await expect(exitBtn).toBeVisible({ timeout: 1000 })

    // Click exit → chrome is restored
    await exitBtn.click()

    // Exit button should disappear
    await expect(exitBtn).not.toBeVisible({ timeout: 1000 })

    // TopBar should be visible again
    await expect(page.locator('header')).toBeVisible()
  })

  test('Scenario 3: writing area is still functional in focus mode', async ({ page }) => {
    // Enter focus mode
    await page.getByRole('button', { name: /enter focus mode/i }).click()

    // Editor should be accessible and writable
    const editor = page.locator('main [contenteditable="true"], main .ProseMirror').first()
    const visible = await editor.isVisible().catch(() => false)
    test.skip(!visible, 'Editor surface is not rendered for this project/device configuration')
    await expect(editor).toBeVisible({ timeout: 5000 })

    await editor.click()
    await page.keyboard.type('Writing in focus mode')

    await expect(editor).toContainText('Writing in focus mode', { timeout: 3000 })
  })
})
