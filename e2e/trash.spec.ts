import { test, expect } from '@playwright/test'
import { format, subDays } from 'date-fns'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FIRESTORE_EMULATOR_URL = 'http://localhost:8080'
const PROJECT_ID = 'journal-manna'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL = 'trash-test@example.com'
const TEST_PASSWORD = 'password123'

async function clearTestUser() {
  try {
    const signInRes = await fetch(
      `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FAKE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, returnSecureToken: true }),
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
  idToken: string,
  date: string,
  opts: { contentText?: string; deleted?: boolean; deletedDaysAgo?: number } = {},
) {
  const { contentText = 'Test entry content', deleted = false, deletedDaysAgo } = opts
  const deletedAt =
    deleted && deletedDaysAgo != null
      ? subDays(new Date(), deletedDaysAgo).toISOString()
      : new Date().toISOString()

  const url = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/entries/${date}`
  await request.patch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
    data: {
      fields: {
        date: { stringValue: date },
        contentText: { stringValue: contentText },
        content: {
          mapValue: {
            fields: {
              type: { stringValue: 'doc' },
              content: { arrayValue: { values: [] } },
            },
          },
        },
        mood: { nullValue: null },
        moodLabel: { nullValue: null },
        tags: { arrayValue: { values: [] } },
        wordCount: { integerValue: contentText.split(' ').length },
        deleted: { booleanValue: deleted },
        deletedAt: deleted ? { timestampValue: deletedAt } : { nullValue: null },
        createdAt: { timestampValue: new Date().toISOString() },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    },
  })
}

test.describe.configure({ mode: 'serial' })

test.describe('Trash', () => {
  let testUid: string
  let testIdToken: string
  const ENTRY_DATE = format(subDays(new Date(), 3), 'yyyy-MM-dd') // 3 days ago, not today

  test.beforeEach(async ({ page }) => {
    await clearTestUser()
    const user = await createEmulatorUser(TEST_EMAIL, TEST_PASSWORD)
    testUid = user.uid
    testIdToken = user.idToken
    await page.goto('/login')
    await signInAsTestUser(page)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Scenario 1: delete entry from EntryPage → gone from History', async ({
    page,
    request,
  }) => {
    // Seed a non-deleted entry
    await seedEntry(request, testUid, testIdToken, ENTRY_DATE, {
      contentText: 'Entry to be trashed',
    })

    // Navigate to the entry
    await page.goto(`/entry/${ENTRY_DATE}`)
    await expect(page.locator('.tiptap')).toBeVisible({ timeout: 5000 })

    // Click more_vert
    await page.getByRole('button', { name: 'More options' }).click()

    // Confirmation dialog appears
    await expect(page.getByText('Move to Trash?')).toBeVisible({ timeout: 3000 })

    // Confirm deletion
    await page.getByRole('button', { name: 'Move to Trash' }).click()

    // Should navigate to /history
    await expect(page).toHaveURL('/history', { timeout: 5000 })

    // Entry should NOT appear in history list
    await expect(page.getByText('Entry to be trashed')).not.toBeVisible({ timeout: 3000 })
  })

  test('Scenario 2: deleted entry appears in Trash with days-remaining badge', async ({
    page,
    request,
  }) => {
    // Seed a soft-deleted entry (5 days ago → 25 days remaining)
    await seedEntry(request, testUid, testIdToken, ENTRY_DATE, {
      contentText: 'Already trashed entry',
      deleted: true,
      deletedDaysAgo: 5,
    })

    await page.goto('/trash')

    // Entry should appear (title h3)
    await expect(page.getByRole('heading', { name: 'Already trashed entry' })).toBeVisible({
      timeout: 5000,
    })

    // Days-remaining badge should show ~25d left
    await expect(page.getByText('25d left')).toBeVisible({ timeout: 3000 })
  })

  test('Scenario 3: restore entry → back in History', async ({ page, request }) => {
    // Seed a soft-deleted entry
    await seedEntry(request, testUid, testIdToken, ENTRY_DATE, {
      contentText: 'Entry to restore',
      deleted: true,
      deletedDaysAgo: 2,
    })

    await page.goto('/trash')
    await expect(page.getByRole('heading', { name: 'Entry to restore' })).toBeVisible({
      timeout: 5000,
    })

    // Click Restore
    await page.getByRole('button', { name: 'Restore' }).click()

    // Entry should disappear from Trash
    await expect(page.getByRole('heading', { name: 'Entry to restore' })).not.toBeVisible({
      timeout: 5000,
    })

    // Navigate to History — entry should be present
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Entry to restore' })).toBeVisible({
      timeout: 5000,
    })
  })

  test('Scenario 4: delete forever → entry removed from Trash', async ({ page, request }) => {
    // Seed a soft-deleted entry
    await seedEntry(request, testUid, testIdToken, ENTRY_DATE, {
      contentText: 'Entry to nuke',
      deleted: true,
      deletedDaysAgo: 1,
    })

    await page.goto('/trash')
    await expect(page.getByRole('heading', { name: 'Entry to nuke' })).toBeVisible({
      timeout: 5000,
    })

    // Click Delete forever
    await page.getByRole('button', { name: 'Delete forever' }).click()

    // Confirmation dialog appears
    await expect(page.getByText('Permanently delete this entry?')).toBeVisible({ timeout: 3000 })

    // Confirm (scoped to dialog to avoid matching card's "Delete forever" button)
    await page.getByRole('dialog').getByRole('button', { name: 'Delete Forever' }).click()

    // Entry should be gone from Trash
    await expect(page.getByRole('heading', { name: 'Entry to nuke' })).not.toBeVisible({
      timeout: 5000,
    })

    // Empty state should appear
    await expect(page.getByText('Your trash is empty.')).toBeVisible({ timeout: 3000 })
  })

  test('Scenario 5: empty Trash shows empty state', async ({ page }) => {
    await page.goto('/trash')
    await expect(page.getByText('Your trash is empty.')).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 6: cancel delete confirmation → entry stays', async ({ page, request }) => {
    await seedEntry(request, testUid, testIdToken, ENTRY_DATE, {
      contentText: 'Entry that survives',
    })
    await page.goto(`/entry/${ENTRY_DATE}`)
    await expect(page.locator('.tiptap')).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'More options' }).click()
    await expect(page.getByText('Move to Trash?')).toBeVisible()

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Dialog closed, still on entry page
    await expect(page.getByText('Move to Trash?')).not.toBeVisible()
    await expect(page).toHaveURL(`/entry/${ENTRY_DATE}`)
  })
})
