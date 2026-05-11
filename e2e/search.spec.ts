import { test, expect } from '@playwright/test'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL_BASE = 'search-test'
const TEST_PASSWORD = 'password123'

function testEmailForProject(projectName: string) {
  return `${TEST_EMAIL_BASE}+${projectName}@example.com`
}

const MOCK_ENTRIES = [
  {
    date: '2026-04-10',
    content: { type: 'doc', content: [] },
    contentText: 'Grace abounds in every season',
    mood: 5,
    moodLabel: 'Radiant',
    tags: ['faith', 'gratitude'],
    wordCount: 5,
  },
  {
    date: '2026-04-05',
    content: { type: 'doc', content: [] },
    contentText: 'Quiet morning reflections on peace',
    mood: 3,
    moodLabel: 'Calm',
    tags: ['peace', 'morning'],
    wordCount: 5,
  },
  {
    date: '2026-04-01',
    content: { type: 'doc', content: [] },
    contentText: 'Grateful for a new month ahead',
    mood: 4,
    moodLabel: 'Peaceful',
    tags: ['gratitude'],
    wordCount: 6,
  },
]

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

async function seedLocalEntries(page: import('@playwright/test').Page, uid: string) {
  await page.evaluate(
    async ({ uid, entries }: { uid: string; entries: typeof MOCK_ENTRIES }) => {
      const seed = (
        window as typeof window & {
          __seedEntriesForTest?: (uid: string, entries: typeof MOCK_ENTRIES) => Promise<void>
        }
      ).__seedEntriesForTest
      if (!seed) throw new Error('__seedEntriesForTest not available')
      await seed(uid, entries)
    },
    { uid, entries: MOCK_ENTRIES },
  )
}

async function openSearchModal(page: import('@playwright/test').Page) {
  await page.keyboard.press('Meta+k')
  const input = page.getByRole('textbox', { name: 'Search entries' })
  if (await input.isVisible().catch(() => false)) return
  await page.getByRole('button', { name: 'Search' }).first().click()
}

test.describe.configure({ mode: 'serial' })

test.describe('Search', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const testEmail = testEmailForProject(testInfo.project.name)
    await clearTestUser(testEmail)
    const uid = await createEmulatorUser(testEmail, TEST_PASSWORD)

    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })
    await seedLocalEntries(page, uid)
  })

  test('Scenario 1: Cmd+K opens search modal with focused input', async ({ page }) => {
    await openSearchModal(page)

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })
    await expect(input).toBeFocused({ timeout: 3000 })
  })

  test('Scenario 2: typing a word shows matching results', async ({ page }) => {
    await openSearchModal(page)

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })

    await input.fill('grace')

    await expect(page.getByRole('heading', { name: 'Grace abounds in every season' })).toBeVisible({
      timeout: 3000,
    })
    await expect(
      page.getByRole('heading', { name: 'Quiet morning reflections on peace' }),
    ).not.toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Grateful for a new month ahead' }),
    ).not.toBeVisible()
  })

  test('Scenario 3: empty state shown when no results', async ({ page }) => {
    await openSearchModal(page)

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })

    await input.fill('xyzzy')

    await expect(page.getByText(/No entries found for/)).toBeVisible({ timeout: 3000 })
  })

  test('Scenario 4: clicking a result card navigates and closes modal', async ({ page }) => {
    await openSearchModal(page)

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill('grace')

    // Click first result
    const firstResultTitle = page.getByRole('heading', { name: 'Grace abounds in every season' })
    await expect(firstResultTitle).toBeVisible({ timeout: 3000 })
    await firstResultTitle.click()

    // Should navigate to the entry page
    await expect(page).toHaveURL('/entry/2026-04-10', { timeout: 3000 })

    // Modal should be closed
    await expect(input).not.toBeVisible()
  })

  test('Scenario 5: Esc closes the modal', async ({ page }) => {
    await openSearchModal(page)

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })

    await page.keyboard.press('Escape')

    await expect(input).not.toBeVisible({ timeout: 2000 })
  })

  test('Scenario 6: mood filter toggles active styling by moodLabel string', async ({ page }) => {
    await openSearchModal(page)

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })

    // Type a query so the client resolves and renders the filter bar
    await input.fill('peace')

    // The filter bar is the flex-wrap strip directly inside the modal container.
    // Scope mood buttons within it to avoid collisions with result cards or nav.
    const filterBar = page.locator('.border-outline-variant\\/10.flex.flex-wrap')

    // Wait for the filter bar to appear.
    await expect(filterBar).toBeVisible({ timeout: 5000 })

    // Use aria-label scoped to the filter bar to target the exact mood filter buttons
    const peacefulBtn = filterBar.getByRole('button', { name: 'Peaceful', exact: true })
    await expect(peacefulBtn).toBeVisible({ timeout: 3000 })

    // Initially not active
    await expect(peacefulBtn).not.toHaveClass(/bg-primary/)

    // Click to select — button should gain active styling
    await peacefulBtn.click()
    await expect(peacefulBtn).toHaveClass(/bg-primary/)

    // A different mood sharing no value overlap should remain inactive
    const hopefulBtn = filterBar.getByRole('button', { name: 'Hopeful', exact: true })
    await expect(hopefulBtn).not.toHaveClass(/bg-primary/)

    // Click 'Peaceful' again to deselect — active styling should be removed
    await peacefulBtn.click()
    await expect(peacefulBtn).not.toHaveClass(/bg-primary/)
  })
})
