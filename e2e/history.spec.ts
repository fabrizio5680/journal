import { test, expect } from '@playwright/test'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FIRESTORE_EMULATOR_URL = 'http://localhost:8080'
const PROJECT_ID = 'journal-manna'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL_BASE = 'history-test'
const TEST_PASSWORD = 'password123'

function testEmailForProject(projectName: string) {
  return `${TEST_EMAIL_BASE}+${projectName}@example.com`
}

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

async function createEmulatorUser(
  email: string,
  password: string,
): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FAKE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  const data = await res.json()
  return { uid: data.localId as string, idToken: data.idToken as string }
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

async function seedEntry(
  request: import('@playwright/test').APIRequestContext,
  uid: string,
  idToken: string,
  date: string,
  data: Record<string, unknown>,
) {
  const url = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/entries/${date}`
  await request.patch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
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

test.describe.configure({ mode: 'serial' })

test.describe('History', () => {
  let testUid: string
  let testIdToken: string
  let testEmail: string

  test.beforeEach(async ({ page, request }, testInfo) => {
    testEmail = testEmailForProject(testInfo.project.name)
    await clearTestUser(testEmail)
    const user = await createEmulatorUser(testEmail, TEST_PASSWORD)
    testUid = user.uid
    testIdToken = user.idToken

    // Seed 3 entries with different dates in the current month
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')

    await seedEntry(request, testUid, testIdToken, `${year}-${month}-01`, {
      contentText: 'First entry of the month',
      mood: 5,
      moodLabel: 'Radiant',
    })
    await seedEntry(request, testUid, testIdToken, `${year}-${month}-05`, {
      contentText: 'Mid month reflection',
      mood: 3,
      moodLabel: 'Calm',
    })
    await seedEntry(request, testUid, testIdToken, `${year}-${month}-10`, {
      contentText: 'Another quiet day of writing',
      mood: 4,
      moodLabel: 'Peaceful',
    })

    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })
    await page.goto('/history')
    await expect(page.getByText('Past Chapters')).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 1: calendar shows dots on dates with entries', async ({ page }) => {
    const now = new Date()
    const year = now.getFullYear()
    const monthName = now.toLocaleString('en-US', { month: 'long' })

    // Entry dot should be present on the 1st
    const day1Button = page.getByRole('button', {
      name: `${monthName} 1, ${year}`,
    })
    await expect(day1Button).toBeVisible({ timeout: 5000 })
    // The dot is the absolute rounded span inside the calendar date button
    await expect(day1Button.locator('span.absolute.rounded-full')).toBeVisible()

    // Verify the 5th also has a dot
    const day5Button = page.getByRole('button', {
      name: `${monthName} 5, ${year}`,
    })
    await expect(day5Button.locator('span.absolute.rounded-full')).toBeVisible()
  })

  test('Scenario 2: clicking a calendar date navigates to /entry/{YYYY-MM-DD}', async ({
    page,
  }) => {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = now.getFullYear()
    const monthName = now.toLocaleString('en-US', { month: 'long' })

    const day1Button = page.getByRole('button', {
      name: `${monthName} 1, ${year}`,
    })
    await day1Button.click()
    await expect(page).toHaveURL(`/entry/${year}-${month}-01`, { timeout: 5000 })
  })

  test('Scenario 3: entry cards render title and excerpt correctly', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'First entry of the month' })).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByRole('heading', { name: 'Mid month reflection' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Another quiet day of writing' })).toBeVisible()
  })

  test('Scenario 4: month navigation updates dots correctly', async ({ page }) => {
    // Navigate to the previous month
    await page.getByRole('button', { name: 'Previous month' }).click()
    await page.waitForTimeout(500)

    // Previous month should show no dots (no seeded entries)
    const allButtons = await page
      .locator('button[aria-label*="2026"]')
      .filter({ has: page.locator('span.absolute.rounded-full') })
      .count()
    expect(allButtons).toBe(0)

    // Navigate back to current month
    await page.getByRole('button', { name: 'Next month' }).click()
    await page.waitForTimeout(500)

    // Current month should show dots again
    const now = new Date()
    const year = now.getFullYear()
    const monthName = now.toLocaleString('en-US', { month: 'long' })
    const day1Button = page.getByRole('button', {
      name: `${monthName} 1, ${year}`,
    })
    await expect(day1Button.locator('span.absolute.rounded-full')).toBeVisible({ timeout: 5000 })
  })
})
