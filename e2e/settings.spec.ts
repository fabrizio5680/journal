import { test, expect } from '@playwright/test'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FIRESTORE_EMULATOR_URL = 'http://127.0.0.1:8080'
const FIREBASE_PROJECT_ID = 'journal-manna'
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

async function patchUserDoc(uid: string, idToken: string, fields: Record<string, string>) {
  const updateMask = Object.keys(fields)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&')
  const res = await fetch(
    `${FIRESTORE_EMULATOR_URL}/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}?${updateMask}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [key, { stringValue: value }]),
        ),
      }),
    },
  )
  if (!res.ok) {
    throw new Error(`Failed to patch Firestore user doc: ${res.status} ${await res.text()}`)
  }
}

async function readUserDoc(uid: string, idToken: string) {
  const res = await fetch(
    `${FIRESTORE_EMULATOR_URL}/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  )
  return (await res.json()) as { fields?: Record<string, { stringValue?: string }> }
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

test.describe('Settings — Google Drive account connection', () => {
  let driveIdToken: string
  let driveUid: string

  test.beforeEach(async ({ page }, testInfo) => {
    const email = testEmail(`drive-${testInfo.project.name}`)
    await clearTestUser(email)
    const created = (await createEmulatorUser(email)) as { idToken: string; localId: string }
    driveIdToken = created.idToken
    driveUid = created.localId
    await patchUserDoc(driveUid, driveIdToken, {
      activeStorageProvider: 'googleDrive',
      storageAccountEmail: 'drive@example.com',
      storageRootFolderId: 'drive-root',
      storageConnectedAt: '2026-04-13T00:00:00.000Z',
      storageTokenStatus: 'valid',
    })
    await page.goto('/login')
    await signInAsTestUser(page, email)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('disconnect is local to this device and leaves account Drive metadata intact', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(page.getByText(/Google Drive · drive@example.com · connected/i)).toBeVisible({
      timeout: 5000,
    })

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('on this device')
      await dialog.accept()
    })
    await page.getByRole('button', { name: /disconnect google drive/i }).click()

    await expect(page.getByText('Not connected')).toBeVisible()
    await expect(page.getByRole('button', { name: /connect google drive/i })).toBeVisible()

    const localDisconnect = await page.evaluate(() =>
      Object.entries(localStorage).find(
        ([key, value]) => key.startsWith('google_drive_disconnected_') && value === 'true',
      ),
    )
    expect(localDisconnect).toBeTruthy()

    const publicDoc = await readUserDoc(driveUid, driveIdToken)
    expect(publicDoc.fields?.activeStorageProvider?.stringValue).toBe('googleDrive')
    expect(publicDoc.fields?.storageRootFolderId?.stringValue).toBe('drive-root')
  })

  test('shows Drive usage row with a non-dash byte value when Drive is connected', async ({
    page,
  }, testInfo) => {
    // Only assert this on chromium to keep the suite fast; the row is a
    // device-agnostic feature and Mobile Safari + Tablet collapse to the same
    // SettingsPage layout, so chromium coverage is enough.
    if (testInfo.project.name !== 'chromium') {
      test.skip()
      return
    }

    // Seed the fake Drive backend so getStorageUsage() returns a deterministic
    // byte total > 0. Without seed the fake returns folderBytes=0 ("0 B"),
    // which we still want to allow — but to assert a concrete byte unit we
    // pre-populate one entry.
    await page.addInitScript(() => {
      type WinExt = typeof window & {
        __fakeDriveSeedData?: Array<{
          date: string
          content: { type: string; content: Array<{ type: string; content: unknown[] }> }
          searchText: string
          wordCount: number
        }>
      }
      const w = window as WinExt
      w.__fakeDriveSeedData = [
        {
          date: '2026-04-13',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Drive usage e2e seed entry' } as unknown as never],
              },
            ],
          },
          searchText: 'Drive usage e2e seed entry',
          wordCount: 5,
        },
      ]
    })

    // Re-sign-in inside the new init-script context so the seed is applied.
    await page.goto('/settings')

    // Wait until the Settings page shows the connected Drive state. The
    // Firestore snapshot drives this — the beforeEach already patched it.
    await expect(page.getByText(/Google Drive · drive@example.com · connected/i)).toBeVisible({
      timeout: 5000,
    })

    // The new Drive usage row should be visible.
    await expect(page.getByText('Drive usage')).toBeVisible({ timeout: 5000 })

    // The value should resolve from "—" to a formatted byte string within a
    // few seconds. We don't assert an exact number — only that it leaves the
    // dash placeholder and includes a byte unit (B/KB/MB/GB).
    const driveUsageLabel = page.getByText('Drive usage')
    const row = driveUsageLabel.locator('xpath=ancestor::div[1]')
    await expect(row).toContainText(/\b(?:B|KB|MB|GB|TB)\b/, { timeout: 8000 })
  })
})
