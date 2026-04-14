import { test, expect } from '@playwright/test'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const PROJECT_ID = 'journal-manna'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL = 'search-test@example.com'
const TEST_PASSWORD = 'password123'

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

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await clearEmulatorUsers()
    await createEmulatorUser(TEST_EMAIL, TEST_PASSWORD)

    await page.goto('/login')
    await signInAsTestUser(page)
    await expect(page).toHaveURL('/', { timeout: 5000 })

    // Inject mock client before any search interaction
    await injectMockAlgoliaClient(page)
  })

  test('Scenario 1: Cmd+K opens search modal with focused input', async ({ page }) => {
    await page.keyboard.press('Meta+k')

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })
    await expect(input).toBeFocused({ timeout: 3000 })
  })

  test('Scenario 2: typing a word shows matching results', async ({ page }) => {
    await page.keyboard.press('Meta+k')

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })

    await input.fill('grace')

    // All mock hits should appear (mock returns fixed hits regardless of query)
    await expect(page.getByText('Grace abounds in every season')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Quiet morning reflections on peace')).toBeVisible()
    await expect(page.getByText('Grateful for a new month ahead')).toBeVisible()
  })

  test('Scenario 3: empty state shown when no results', async ({ page }) => {
    // Inject client that returns no hits
    await injectMockAlgoliaClient(page, [])

    await page.keyboard.press('Meta+k')

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })

    await input.fill('xyzzy')

    await expect(page.getByText(/No entries found for/)).toBeVisible({ timeout: 3000 })
  })

  test('Scenario 4: clicking a result card navigates and closes modal', async ({ page }) => {
    await page.keyboard.press('Meta+k')

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill('grace')

    // Click first result
    await expect(page.getByText('Grace abounds in every season')).toBeVisible({ timeout: 3000 })
    await page.getByText('Grace abounds in every season').click()

    // Should navigate to the entry page
    await expect(page).toHaveURL('/entry/2026-04-10', { timeout: 3000 })

    // Modal should be closed
    await expect(input).not.toBeVisible()
  })

  test('Scenario 5: Esc closes the modal', async ({ page }) => {
    await page.keyboard.press('Meta+k')

    const input = page.getByRole('textbox', { name: 'Search entries' })
    await expect(input).toBeVisible({ timeout: 3000 })

    await page.keyboard.press('Escape')

    await expect(input).not.toBeVisible({ timeout: 2000 })
  })
})
