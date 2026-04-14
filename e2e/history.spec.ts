import { test, expect } from '@playwright/test'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FIRESTORE_EMULATOR_URL = 'http://localhost:8080'
const PROJECT_ID = 'journal-manna'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL = 'history-test@example.com'
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

async function seedEntry(
  request: import('@playwright/test').APIRequestContext,
  uid: string,
  date: string,
  data: Record<string, unknown>,
) {
  const url = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/entries/${date}`
  await request.patch(url, {
    data: {
      fields: {
        date: { stringValue: date },
        contentText: { stringValue: (data.contentText as string) ?? '' },
        content: {
          mapValue: {
            fields: {
              type: { stringValue: 'doc' },
              content: { arrayValue: { values: [] } },
            },
          },
        },
        mood: data.mood != null ? { integerValue: data.mood } : { nullValue: null },
        moodLabel:
          data.moodLabel != null ? { stringValue: data.moodLabel as string } : { nullValue: null },
        tags: { arrayValue: { values: [] } },
        wordCount: { integerValue: (data.contentText as string)?.split(' ').length ?? 0 },
        deleted: { booleanValue: false },
        deletedAt: { nullValue: null },
        createdAt: { timestampValue: new Date().toISOString() },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    },
  })
}

test.describe('History', () => {
  let testUid: string

  test.beforeEach(async ({ page, request }) => {
    await clearEmulatorUsers()
    testUid = await createEmulatorUser(TEST_EMAIL, TEST_PASSWORD)

    // Seed 3 entries with different dates in the current month
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')

    await seedEntry(request, testUid, `${year}-${month}-01`, {
      contentText: 'First entry of the month',
      mood: 5,
      moodLabel: 'Radiant',
    })
    await seedEntry(request, testUid, `${year}-${month}-05`, {
      contentText: 'Mid month reflection',
      mood: 3,
      moodLabel: 'Calm',
    })
    await seedEntry(request, testUid, `${year}-${month}-10`, {
      contentText: 'Another quiet day of writing',
      mood: 4,
      moodLabel: 'Peaceful',
    })

    await page.goto('/login')
    await signInAsTestUser(page)
    await expect(page).toHaveURL('/', { timeout: 5000 })
    await page.goto('/history')
    await expect(page.getByText('Past Chapters')).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 1: calendar shows dots on dates with entries', async ({ page }) => {
    const now = new Date()
    const year = now.getFullYear()

    // Entry dot should be present on the 1st
    const day1Button = page.getByRole('button', {
      name: new RegExp(`\\w+ 1, ${year}`),
    })
    await expect(day1Button).toBeVisible({ timeout: 5000 })
    // The dot is a span with bg-primary rounded-full inside the button
    await expect(day1Button.locator('.rounded-full.bg-primary')).toBeVisible()

    // Verify the 5th also has a dot
    const day5Button = page.getByRole('button', {
      name: new RegExp(`\\w+ 5, ${year}`),
    })
    await expect(day5Button.locator('.rounded-full.bg-primary')).toBeVisible()
  })

  test('Scenario 2: clicking a calendar date navigates to /entry/{YYYY-MM-DD}', async ({
    page,
  }) => {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = now.getFullYear()

    const day1Button = page.getByRole('button', {
      name: new RegExp(`\\w+ 1, ${year}`),
    })
    await day1Button.click()
    await expect(page).toHaveURL(`/entry/${year}-${month}-01`, { timeout: 5000 })
  })

  test('Scenario 3: entry cards render title and excerpt correctly', async ({ page }) => {
    await expect(page.getByText('First entry of the month')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Mid month reflection')).toBeVisible()
    await expect(page.getByText('Another quiet day of writing')).toBeVisible()
  })

  test('Scenario 4: month navigation updates dots correctly', async ({ page }) => {
    // Navigate to the previous month
    await page.getByRole('button', { name: 'Previous month' }).click()
    await page.waitForTimeout(500)

    // Previous month should show no dots (no seeded entries)
    const allButtons = await page
      .locator('button[aria-label*="2026"]')
      .filter({ has: page.locator('.bg-primary.rounded-full') })
      .count()
    expect(allButtons).toBe(0)

    // Navigate back to current month
    await page.getByRole('button', { name: 'Next month' }).click()
    await page.waitForTimeout(500)

    // Current month should show dots again
    const now = new Date()
    const year = now.getFullYear()
    const day1Button = page.getByRole('button', {
      name: new RegExp(`\\w+ 1, ${year}`),
    })
    await expect(day1Button.locator('.rounded-full.bg-primary')).toBeVisible({ timeout: 5000 })
  })
})
