import { test, expect } from '@playwright/test'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL_BASE = 'search-test'
const TEST_PASSWORD = 'password123'

function testEmailForProject(projectName: string) {
  return `${TEST_EMAIL_BASE}+${projectName}@example.com`
}

// Fake Algolia search client injected via window.__mockAlgoliaClient
// Returns a fixed list of hits that mirror the seeded entries.
const MOCK_HITS = [
  {
    objectID: 'mock-uid_2026-04-10',
    date: '2026-04-10',
    excerpt: 'Grace abounds in every season',
    mood: 5,
    moodLabel: 'Radiant',
    tags: ['faith', 'gratitude'],
    wordCount: 5,
    userId: 'mock-uid',
    deleted: false,
  },
  {
    objectID: 'mock-uid_2026-04-05',
    date: '2026-04-05',
    excerpt: 'Quiet morning reflections on peace',
    mood: 3,
    moodLabel: 'Calm',
    tags: ['peace', 'morning'],
    wordCount: 5,
    userId: 'mock-uid',
    deleted: false,
  },
  {
    objectID: 'mock-uid_2026-04-01',
    date: '2026-04-01',
    excerpt: 'Grateful for a new month ahead',
    mood: 4,
    moodLabel: 'Peaceful',
    tags: ['gratitude'],
    wordCount: 6,
    userId: 'mock-uid',
    deleted: false,
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

/** Inject a mock Algolia client that returns fixed hits regardless of the query */
async function injectMockAlgoliaClient(
  page: import('@playwright/test').Page,
  hits: typeof MOCK_HITS = MOCK_HITS,
) {
  await page.evaluate((mockHits) => {
    const mockClient = {
      search: async () => ({
        results: [
          {
            hits: mockHits,
            nbHits: mockHits.length,
            page: 0,
            nbPages: 1,
            hitsPerPage: 20,
            exhaustiveNbHits: true,
            processingTimeMS: 1,
            query: '',
            params: '',
            index: 'journal_entries',
          },
        ],
      }),
      searchForFacetValues: async () => ({ facetHits: [], exhaustiveFacetsCount: true }),
    }
    ;(
      window as typeof window & {
        __mockAlgoliaClient?: typeof mockClient
      }
    ).__mockAlgoliaClient = mockClient
  }, hits)
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
    await createEmulatorUser(testEmail, TEST_PASSWORD)

    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })

    // Inject mock client before any search interaction
    await injectMockAlgoliaClient(page)
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

    // All mock hits should appear (mock returns fixed hits regardless of query)
    await expect(page.getByRole('heading', { name: 'Grace abounds in every season' })).toBeVisible({
      timeout: 3000,
    })
    await expect(
      page.getByRole('heading', { name: 'Quiet morning reflections on peace' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Grateful for a new month ahead' }),
    ).toBeVisible()
  })

  test('Scenario 3: empty state shown when no results', async ({ page }) => {
    // Inject client that returns no hits
    await injectMockAlgoliaClient(page, [])

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
})
