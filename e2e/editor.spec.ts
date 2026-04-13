import { test, expect } from '@playwright/test'
import { format } from 'date-fns'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FIRESTORE_EMULATOR_URL = 'http://localhost:8080'
const PROJECT_ID = 'journal-manna'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL = 'editor-test@example.com'
const TEST_PASSWORD = 'password123'

async function clearEmulatorUsers() {
  await fetch(`${EMULATOR_AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  }).catch(() => {})
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

async function signInAsTestUser(page: import('@playwright/test').Page) {
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
    { email: TEST_EMAIL, password: TEST_PASSWORD },
  )
}

test.describe('Editor', () => {
  let testUid: string

  test.beforeEach(async ({ page }) => {
    await clearEmulatorUsers()
    testUid = await createEmulatorUser(TEST_EMAIL, TEST_PASSWORD)
    await page.goto('/login')
    await signInAsTestUser(page)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Scenario 1: type text → "Draft saved" appears in TopBar', async ({ page }) => {
    // Wait for the editor to mount
    const editor = page.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Type into the editor
    await editor.click()
    await page.keyboard.type('This is a test journal entry')

    // After 2s the auto-save debounce fires and "Draft saved" should appear
    await expect(page.getByText(/Draft saved/i)).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 2: type text → click Save → Firestore emulator has entry doc', async ({
    page,
    request,
  }) => {
    const today = format(new Date(), 'yyyy-MM-dd')

    const editor = page.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    await editor.click()
    await page.keyboard.type('Saved via button')

    // Click Save Entry button
    await page.getByRole('button', { name: /Save Entry/i }).click()

    // Give Firestore a moment to persist
    await page.waitForTimeout(1000)

    // Query Firestore emulator REST API for the doc
    const docUrl = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${testUid}/entries/${today}`
    const res = await request.get(docUrl)
    expect(res.ok()).toBeTruthy()
  })

  test('Scenario 3: word count updates as user types', async ({ page }) => {
    const editor = page.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    await editor.click()
    await page.keyboard.type('one two three')

    await expect(page.getByText(/3 words/i)).toBeVisible({ timeout: 3000 })
  })
})
