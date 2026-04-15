import { test, expect, type APIRequestContext } from '@playwright/test'
import { format, subDays } from 'date-fns'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FIRESTORE_EMULATOR_URL = 'http://localhost:8080'
const PROJECT_ID = 'journal-manna'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL_BASE = 'trash-test'
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
  request: APIRequestContext,
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
  const res = await request.patch(url, {
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
  expect(res.ok()).toBeTruthy()
}

async function moveEntryToTrash(page: import('@playwright/test').Page, date: string) {
  await page.goto(`/entry/${date}`)
  await expect(page.getByRole('button', { name: 'More options' })).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: 'More options' }).click()
  await expect(page.getByText('Move to Trash?')).toBeVisible({ timeout: 3000 })
  await page.getByRole('button', { name: 'Move to Trash' }).click()
  await expect(page).toHaveURL('/history', { timeout: 5000 })
}

test.describe.configure({ mode: 'serial' })

test.describe('Trash', () => {
  let testUid: string
  let testIdToken: string
  let testEmail: string
  const ENTRY_DATE = format(subDays(new Date(), 3), 'yyyy-MM-dd') // 3 days ago, not today

  test.beforeEach(async ({ page }, testInfo) => {
    testEmail = testEmailForProject(testInfo.project.name)
    await clearTestUser(testEmail)
    const user = await createEmulatorUser(testEmail, TEST_PASSWORD)
    testUid = user.uid
    testIdToken = user.idToken
    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
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
    await expect(
      page.locator('main [contenteditable="true"], main .ProseMirror, main p').first(),
    ).toBeVisible({ timeout: 5000 })

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
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Advanced trash flow is unstable on WebKit projects')

    // Seed a normal entry, then soft-delete through the UI flow
    await seedEntry(request, testUid, testIdToken, ENTRY_DATE, {
      contentText: 'Already trashed entry',
    })
    await moveEntryToTrash(page, ENTRY_DATE)

    await page.goto('/trash')
    await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible({
      timeout: 5000,
    })

    // Entry should appear
    await expect(page.getByText(ENTRY_DATE)).toBeVisible({ timeout: 10000 })

    // Days-remaining badge should be shown
    await expect(page.getByText(/\d+d left/)).toBeVisible({ timeout: 3000 })
  })

  test('Scenario 3: restore entry → back in History', async ({ page, request, browserName }) => {
    test.skip(browserName !== 'chromium', 'Advanced trash flow is unstable on WebKit projects')

    // Seed a normal entry, then soft-delete through the UI flow
    await seedEntry(request, testUid, testIdToken, ENTRY_DATE, {
      contentText: 'Entry to restore',
    })
    await moveEntryToTrash(page, ENTRY_DATE)

    await page.goto('/trash')
    await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText(ENTRY_DATE)).toBeVisible({ timeout: 10000 })

    // Click Restore on the card for this specific entry
    const entryCard = page.locator('div').filter({ hasText: ENTRY_DATE }).first()
    await entryCard.getByRole('button', { name: 'Restore' }).click()

    // Entry should disappear from Trash
    await expect(page.getByText(ENTRY_DATE)).not.toBeVisible({ timeout: 5000 })

    // Verify in Firestore that the entry is restored (deleted=false)
    const docUrl = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${testUid}/entries/${ENTRY_DATE}`
    const restoredDocRes = await request.get(docUrl, {
      headers: { Authorization: `Bearer ${testIdToken}` },
    })
    expect(restoredDocRes.ok()).toBeTruthy()

    await expect
      .poll(async () => {
        const res = await request.get(docUrl, {
          headers: { Authorization: `Bearer ${testIdToken}` },
        })
        const doc = (await res.json()) as {
          fields?: { deleted?: { booleanValue?: boolean } }
        }
        return doc.fields?.deleted?.booleanValue
      })
      .toBe(false)
  })

  test('Scenario 4: delete forever → entry removed from Trash', async ({ page, request, browserName }) => {
    test.skip(browserName !== 'chromium', 'Advanced trash flow is unstable on WebKit projects')

    // Seed a normal entry, then soft-delete through the UI flow
    await seedEntry(request, testUid, testIdToken, ENTRY_DATE, {
      contentText: 'Entry to nuke',
    })
    await moveEntryToTrash(page, ENTRY_DATE)

    await page.goto('/trash')
    await expect(page.getByRole('heading', { name: 'Entry to nuke' })).toBeVisible({
      timeout: 5000,
    })

    // Click Delete forever
    await page.getByRole('button', { name: 'Delete forever' }).click()

    // Confirmation dialog appears
    await expect(page.getByText('Permanently delete?')).toBeVisible({ timeout: 3000 })

    // Confirm (scoped to dialog to avoid matching card's "Delete forever" button)
    await page.getByRole('dialog').getByRole('button', { name: 'Delete Forever' }).click()

    // Entry should be gone from Trash
    await expect(page.getByRole('heading', { name: 'Entry to nuke' })).not.toBeVisible({
      timeout: 5000,
    })

    // Empty state should appear
    await expect(page.getByText('Your trash is empty.')).toBeVisible({ timeout: 3000 })
  })

  test('Scenario 5: empty Trash shows empty state', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Advanced trash flow is unstable on WebKit projects')

    await page.goto('/trash')
    await expect(page.getByText('Your trash is empty.')).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 6: cancel delete confirmation → entry stays', async ({ page, request, browserName }) => {
    test.skip(browserName !== 'chromium', 'Advanced trash flow is unstable on WebKit projects')

    await seedEntry(request, testUid, testIdToken, ENTRY_DATE, {
      contentText: 'Entry that survives',
    })
    await page.goto(`/entry/${ENTRY_DATE}`)
    await expect(
      page.locator('main [contenteditable="true"], main .ProseMirror, main p').first(),
    ).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'More options' }).click()
    await expect(page.getByText('Move to Trash?')).toBeVisible()

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Dialog closed, still on entry page
    await expect(page.getByText('Move to Trash?')).not.toBeVisible()
    await expect(page).toHaveURL(`/entry/${ENTRY_DATE}`)
  })
})
