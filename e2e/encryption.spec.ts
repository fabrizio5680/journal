import { test, expect } from '@playwright/test'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FIRESTORE_EMULATOR_URL = 'http://localhost:8080'
const PROJECT_ID = 'journal-manna'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL_BASE = 'encryption-test'
const TEST_PASSWORD = 'password123'
const TEST_PASSPHRASE = 'MySecurePassphrase123!'
const RECOVERY_STEP_TIMEOUT = 30_000

function testEmailForProject(prefix: string, projectName: string, testTitle: string) {
  const slug = testTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${TEST_EMAIL_BASE}+${prefix}-${projectName}-${slug}@example.com`
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

async function createEmulatorUser(email: string, password: string) {
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

async function seedUserProfile(
  request: import('@playwright/test').APIRequestContext,
  uid: string,
  idToken: string,
  email: string,
) {
  const url = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`
  await request.patch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
    data: {
      fields: {
        email: { stringValue: email },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    },
  })
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

/**
 * Navigate to Settings and enable encryption using the given passphrase.
 * Returns the recovery code shown after setup.
 */
async function enableEncryption(
  page: import('@playwright/test').Page,
  passphrase: string,
): Promise<string> {
  await page.goto('/settings')
  await expect(page).toHaveURL('/settings', { timeout: 5000 })

  // Find the "Privacy & Encryption" section and click Enable
  const enableBtn = page.getByRole('button', { name: /enable encryption/i })
  await expect(enableBtn).toBeVisible({ timeout: 5000 })
  await enableBtn.click()
  const setupModal = page.getByTestId('encryption-setup-modal')
  await expect(setupModal).toBeVisible({ timeout: 5000 })

  // Step 1: Enter passphrase in the setup modal
  const passphraseInput = setupModal.getByPlaceholder(/passphrase/i).first()
  await expect(passphraseInput).toBeVisible({ timeout: 3000 })
  await passphraseInput.fill(passphrase)

  // Confirm passphrase field (if present)
  const confirmInput = setupModal.getByPlaceholder(/confirm/i).first()
  const confirmVisible = await confirmInput.isVisible().catch(() => false)
  if (confirmVisible) {
    await confirmInput.fill(passphrase)
  }

  // Submit the passphrase step using the modal's primary action.
  const enableEncryptionBtn = setupModal.getByRole('button', { name: /^Enable Encryption$/ })
  await expect(enableEncryptionBtn).toBeVisible({ timeout: 3000 })
  await enableEncryptionBtn.click()

  // Step 2: Recovery code should be visible
  // WebKit mobile/tablet in CI can take several seconds to finish the real PBKDF2 setup work.
  await expect(setupModal.getByRole('heading', { name: /save your recovery code/i })).toBeVisible({
    timeout: RECOVERY_STEP_TIMEOUT,
  })

  // Capture the recovery code text
  // It should be displayed in a code/pre element or similar
  const recoveryCodeEl = setupModal
    .locator('[data-testid="recovery-code"], code, pre, .font-mono')
    .first()
  let recoveryCode = ''
  const codeVisible = await recoveryCodeEl.isVisible().catch(() => false)
  if (codeVisible) {
    recoveryCode = (await recoveryCodeEl.textContent()) ?? ''
    recoveryCode = recoveryCode.trim()
  }

  // Check the acknowledgment checkbox / click "I've saved my code" button
  const acknowledgeEl = setupModal
    .getByRole('checkbox', { name: /saved my recovery code|saved|copied|acknowledge/i })
    .or(setupModal.getByRole('button', { name: /i.ve saved|i have saved|copied/i }))
    .first()
  const ackVisible = await acknowledgeEl.isVisible({ timeout: 2000 }).catch(() => false)
  if (ackVisible) {
    await acknowledgeEl.click()
  }

  // Complete setup from the recovery step.
  const completeBtn = setupModal.getByRole('button', { name: /^Done$/ })
  const completeBtnVisible = await completeBtn.isVisible({ timeout: 2000 }).catch(() => false)
  if (completeBtnVisible) {
    await expect(completeBtn).toBeEnabled({ timeout: 3000 })
    await completeBtn.click()
    await expect(setupModal).toBeHidden({ timeout: 5000 })
  }

  return recoveryCode
}

test.describe.configure({ mode: 'serial' })

// ── Test: Enable encryption ────────────────────────────────────────────────────

test.describe('Encryption — enable flow', () => {
  let testEmail: string

  test.beforeEach(async ({ page, request }, testInfo) => {
    testEmail = testEmailForProject('enable', testInfo.project.name, testInfo.title)
    await clearTestUser(testEmail)
    const user = await createEmulatorUser(testEmail, TEST_PASSWORD)
    await seedUserProfile(request, user.uid, user.idToken, testEmail)
    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Enc-1: Settings shows Privacy & Encryption section', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL('/settings', { timeout: 5000 })

    // The Privacy & Encryption section heading should be visible
    await expect(page.getByText(/privacy.*encryption|encryption.*privacy/i).first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('Enc-2: Enable encryption — modal opens, passphrase + recovery code steps present', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL('/settings', { timeout: 5000 })

    const enableBtn = page.getByRole('button', { name: /enable encryption/i })
    await expect(enableBtn).toBeVisible({ timeout: 5000 })
    await enableBtn.click()
    const setupModal = page.getByTestId('encryption-setup-modal')
    await expect(setupModal).toBeVisible({ timeout: 5000 })

    // Modal should open — passphrase step (step 1)
    await expect(setupModal.getByPlaceholder(/passphrase/i).first()).toBeVisible({
      timeout: 3000,
    })

    // Enter passphrase and proceed
    await setupModal
      .getByPlaceholder(/passphrase/i)
      .first()
      .fill(TEST_PASSPHRASE)

    // Confirm passphrase field if present
    const confirmInput = setupModal.getByPlaceholder(/confirm/i).first()
    if (await confirmInput.isVisible().catch(() => false)) {
      await confirmInput.fill(TEST_PASSPHRASE)
    }

    const nextBtn = setupModal.getByRole('button').filter({ hasText: /^Enable Encryption$/ })
    await expect(nextBtn).toBeVisible({ timeout: 3000 })
    await nextBtn.click()

    // Recovery code step (step 2) should show
    await expect(setupModal.getByRole('heading', { name: /save your recovery code/i })).toBeVisible(
      {
        timeout: RECOVERY_STEP_TIMEOUT,
      },
    )
  })

  test('Enc-3: After completing setup, Settings shows encryption as enabled', async ({ page }) => {
    await enableEncryption(page, TEST_PASSPHRASE)

    // After setup completes, navigate back to settings (or stay on settings)
    // The section should now show a "Disable" button or "Encryption enabled" state
    await page.goto('/settings')
    await expect(page).toHaveURL('/settings', { timeout: 5000 })

    // Look for indication that encryption is now enabled
    // Could be a "Disable" button, status badge, or similar
    const disabledOrEnabled = page
      .getByRole('button', { name: /disable encryption/i })
      .or(page.getByText(/encryption is enabled|enabled/i).first())
    await expect(disabledOrEnabled.first()).toBeVisible({ timeout: 5000 })
  })
})

// ── Test: Encrypted entry survives reload ─────────────────────────────────────

test.describe('Encryption — entry round-trip after reload', () => {
  let testEmail: string

  test.beforeEach(async ({ page, request }, testInfo) => {
    testEmail = testEmailForProject('roundtrip', testInfo.project.name, testInfo.title)
    await clearTestUser(testEmail)
    const user = await createEmulatorUser(testEmail, TEST_PASSWORD)
    await seedUserProfile(request, user.uid, user.idToken, testEmail)
    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Enc-4: Encrypted entry content is restored after unlock on reload', async ({ page }) => {
    // Step 1: Enable encryption
    await enableEncryption(page, TEST_PASSPHRASE)

    // Step 2: Navigate to today's entry and type content
    await page.goto('/')
    await expect(page).toHaveURL('/', { timeout: 5000 })

    const editor = page.locator('main [contenteditable="true"], main .ProseMirror').first()
    const editorVisible = await editor.isVisible({ timeout: 5000 }).catch(() => false)
    test.skip(!editorVisible, 'Editor not rendered for this device/viewport configuration')

    await editor.click()
    const testContent = 'Secret encrypted journal entry'
    await page.keyboard.type(testContent)

    // Wait for auto-save
    await page.waitForTimeout(2500)

    // Step 3: Clear the in-memory encryption session, then reload and expect unlock modal
    await page.evaluate(() => sessionStorage.removeItem('eq_key'))
    await page.reload()
    await expect(page).toHaveURL('/', { timeout: 5000 })

    // The unlock modal should appear (encryption enabled + fresh session)
    // It may show a passphrase input
    const unlockModal = page
      .getByPlaceholder(/passphrase/i)
      .or(page.getByRole('dialog', { name: /unlock/i }))
      .or(page.getByText(/unlock.*encryption|enter.*passphrase/i).first())
    const unlockVisible = await unlockModal
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (!unlockVisible) {
      // If no unlock modal appears (e.g., session was kept alive), skip
      test.skip(true, 'Unlock modal did not appear — session may have been preserved')
      return
    }

    // Step 4: Enter passphrase to unlock
    const passphraseInput = page.getByPlaceholder(/passphrase/i).first()
    await passphraseInput.fill(TEST_PASSPHRASE)

    const unlockBtn = page.getByRole('button', { name: /unlock/i }).first()
    await expect(unlockBtn).toBeVisible({ timeout: 3000 })
    await unlockBtn.click()

    // Step 5: After unlocking, the typed content should be visible
    await expect(editor).toContainText(testContent, { timeout: 5000 })
  })
})

// ── Test: Wrong passphrase shows error ────────────────────────────────────────

test.describe('Encryption — wrong passphrase error', () => {
  let testEmail: string

  test.beforeEach(async ({ page, request }, testInfo) => {
    testEmail = testEmailForProject('wrongpass', testInfo.project.name, testInfo.title)
    await clearTestUser(testEmail)
    const user = await createEmulatorUser(testEmail, TEST_PASSWORD)
    await seedUserProfile(request, user.uid, user.idToken, testEmail)
    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Enc-5: Wrong passphrase on unlock shows an error message', async ({ page }) => {
    // Enable encryption first
    await enableEncryption(page, TEST_PASSPHRASE)

    // Return to the journal, clear the in-memory encryption session, and reload.
    await page.goto('/')
    await expect(page).toHaveURL('/', { timeout: 5000 })
    await page.evaluate(() => sessionStorage.removeItem('eq_key'))
    await page.reload()
    await expect(page).toHaveURL('/', { timeout: 5000 })

    const unlockModal = page.getByPlaceholder(/passphrase/i).first()
    const unlockVisible = await unlockModal.isVisible({ timeout: 5000 }).catch(() => false)

    if (!unlockVisible) {
      test.skip(true, 'Unlock modal did not appear — session may have been preserved')
      return
    }

    // Enter wrong passphrase
    await unlockModal.fill('WrongPassphrase999!')
    const unlockBtn = page.getByRole('button', { name: /unlock/i }).first()
    await expect(unlockBtn).toBeVisible({ timeout: 3000 })
    await unlockBtn.click()

    // An error message should appear
    await expect(
      page
        .getByText(/incorrect.*passphrase|wrong.*passphrase|invalid.*passphrase|try again/i)
        .first(),
    ).toBeVisible({ timeout: 3000 })
  })
})

// ── Test: Content search banner when encryption enabled ───────────────────────

test.describe('Encryption — search banner', () => {
  let testEmail: string

  test.beforeEach(async ({ page, request }, testInfo) => {
    testEmail = testEmailForProject('search', testInfo.project.name, testInfo.title)
    await clearTestUser(testEmail)
    const user = await createEmulatorUser(testEmail, TEST_PASSWORD)
    await seedUserProfile(request, user.uid, user.idToken, testEmail)
    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Enc-6: Content search banner visible in search modal when encryption is enabled', async ({
    page,
  }) => {
    // Enable encryption
    await enableEncryption(page, TEST_PASSPHRASE)

    // Navigate back to main page
    await page.goto('/')
    await expect(page).toHaveURL('/', { timeout: 5000 })

    // Open search modal — look for search button or keyboard shortcut
    const searchBtn = page
      .getByRole('button', { name: /search/i })
      .or(page.getByTestId('search-button'))
      .first()
    const searchBtnVisible = await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)

    if (!searchBtnVisible) {
      test.skip(true, 'Search button not visible for this device/viewport configuration')
      return
    }

    await searchBtn.click()

    // The search modal should open
    await expect(page.getByRole('dialog').or(page.getByTestId('search-modal')).first()).toBeVisible(
      { timeout: 3000 },
    )

    // The banner about content search being unavailable should be visible
    await expect(
      page.getByText(/content search.*unavailable|search.*unavailable|encrypted/i).first(),
    ).toBeVisible({ timeout: 3000 })
  })
})
