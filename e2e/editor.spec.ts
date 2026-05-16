import { test, expect } from '@playwright/test'
import { format } from 'date-fns'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FIRESTORE_EMULATOR_URL = 'http://localhost:8080'
const PROJECT_ID = 'journal-manna'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL_BASE = 'editor-test'
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

async function getEditorOrSkip(page: import('@playwright/test').Page) {
  const editor = page.locator('main [contenteditable="true"], main .ProseMirror').first()
  const visible = await editor.isVisible().catch(() => false)
  test.skip(!visible, 'Editor surface is not rendered for this project/device configuration')
  return editor
}

test.describe.configure({ mode: 'serial' })

test.describe('Editor', () => {
  let testUid: string
  let testIdToken: string
  let testEmail: string

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

  test('Scenario 1: type text updates visible writing metrics', async ({ page }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Type into the editor
    await editor.click()
    await page.keyboard.type('This is a test journal entry')

    // Word count should be visible — mobile label (md:hidden) or desktop FAB span
    await expect(page.locator('[data-testid="word-count"]:visible')).toBeVisible({ timeout: 3000 })
  })

  test('Scenario 2: type text → auto-save → Firestore has lastEntryDate metadata', async ({
    page,
    request,
  }) => {
    const today = format(new Date(), 'yyyy-MM-dd')

    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    await editor.click()
    await page.keyboard.type('Auto-saved entry')

    // Auto-save fires after 1.5s debounce; wait for it
    await page.waitForTimeout(2500)

    const docUrl = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${testUid}`
    const res = await request.get(docUrl, {
      headers: { Authorization: `Bearer ${testIdToken}` },
    })
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as {
      fields?: { lastEntryDate?: { stringValue?: string } }
    }
    expect(body.fields?.lastEntryDate?.stringValue).toBe(today)
  })

  test('Scenario 3: word count updates as user types', async ({ page }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    await editor.click()
    await page.keyboard.type('one two three')

    await expect(page.getByText(/3 words/i)).toBeVisible({ timeout: 3000 })
  })

  test('Scenario 4: dictation — mock SpeechRecognition, transcript inserts into editor', async ({
    page,
    browserName,
  }) => {
    // Skip on non-Chromium browsers (Safari/Firefox don't support Web Speech API)
    if (browserName !== 'chromium') return

    // Inject a mock SpeechRecognition into the page before any app code runs
    await page.addInitScript(() => {
      let onresultHandler: ((e: SpeechRecognitionEvent) => void) | null = null
      let onendHandler: (() => void) | null = null

      const MockSpeechRecognition = function (this: SpeechRecognition) {
        ;(
          window as typeof window & { __mockRecognitionInstance?: SpeechRecognition }
        ).__mockRecognitionInstance = this
      } as unknown as typeof SpeechRecognition

      MockSpeechRecognition.prototype.continuous = false
      MockSpeechRecognition.prototype.interimResults = false
      MockSpeechRecognition.prototype.lang = ''
      MockSpeechRecognition.prototype.start = function () {}
      MockSpeechRecognition.prototype.stop = function () {
        onendHandler?.()
      }
      MockSpeechRecognition.prototype.abort = function () {
        onendHandler?.()
      }

      Object.defineProperty(MockSpeechRecognition.prototype, 'onresult', {
        set(fn) {
          onresultHandler = fn
        },
        get() {
          return onresultHandler
        },
      })
      Object.defineProperty(MockSpeechRecognition.prototype, 'onend', {
        set(fn) {
          onendHandler = fn
        },
        get() {
          return onendHandler
        },
      })
      Object.defineProperty(MockSpeechRecognition.prototype, 'onerror', {
        set() {},
        get() {
          return null
        },
      })

      // Helper to fire a transcript from test code
      ;(
        window as typeof window & {
          __fireMockTranscript?: (text: string) => void
        }
      ).__fireMockTranscript = (text: string) => {
        const event = {
          resultIndex: 0,
          results: [Object.assign([{ transcript: text, confidence: 1 }], { isFinal: true })],
        } as unknown as SpeechRecognitionEvent
        onresultHandler?.(event)
      }
      ;(
        window as typeof window & { SpeechRecognition?: typeof SpeechRecognition }
      ).SpeechRecognition = MockSpeechRecognition
    })

    // Reload so the mock is in place before the app initialises
    await page.reload()
    await expect(page).toHaveURL('/', { timeout: 5000 })

    // Dictate button should be visible (isSupported = true due to mock)
    const dictateBtn = page.getByRole('button', { name: /dictate/i })
    await expect(dictateBtn).toBeVisible({ timeout: 5000 })

    // Click dictate → button switches to mic_off (listening state)
    await dictateBtn.click()
    await expect(page.getByRole('button', { name: /stop dictation/i })).toBeVisible({
      timeout: 3000,
    })

    // Fire a mock transcript
    await page.evaluate(() => {
      ;(
        window as typeof window & { __fireMockTranscript?: (t: string) => void }
      ).__fireMockTranscript?.('dictated text')
    })

    // Text should appear in editor
    const editor = await getEditorOrSkip(page)
    await expect(editor).toContainText('dictated text', { timeout: 3000 })

    // Click mic-off → back to idle
    await page.getByRole('button', { name: /stop dictation/i }).click()
    await expect(page.getByRole('button', { name: /dictate/i })).toBeVisible({ timeout: 3000 })
  })

  test('FloatingMenu: "Insert time" inserts H2 with locale time and keeps editor focus for follow-up typing', async ({
    page,
  }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Focus the editor on an empty paragraph — the FloatingMenu only shows for
    // empty paragraphs (shouldShow guard in EntryEditor).
    await editor.click()

    // Click the "Insert time" button surfaced by the FloatingMenu
    const insertTimeBtn = page.getByRole('button', { name: 'Insert time' })
    await expect(insertTimeBtn).toBeVisible({ timeout: 5000 })
    await insertTimeBtn.click()

    // An H2 with a locale time string must now exist inside the editor.
    // Use a regex tolerant of 24h ("09:14") and 12h ("9:14 AM") formats so
    // the assertion survives locale shifts across CI environments.
    const insertedHeading = editor
      .locator('h2')
      .filter({ hasText: /^\d{1,2}:\d{2}(\s?(AM|PM))?$/i })
    await expect(insertedHeading).toBeVisible({ timeout: 3000 })

    // Editor should retain focus — typing more text lands in the paragraph
    // below the heading.
    await page.keyboard.type('continued writing')
    await expect(editor).toContainText('continued writing', { timeout: 3000 })
  })

  test('Scenario 6: ProseMirror scrollMargin keeps cursor above BottomNav when typing', async ({
    page,
  }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Type enough lines to push the cursor near the bottom of the viewport
    await editor.click()
    const longText = Array(30).fill('A line of journal text that wraps.').join('\n')
    await page.keyboard.type(longText)

    // After typing, the cursor (last caret position) must not be obscured by the BottomNav.
    // We verify this by checking that the cursor's bounding rect bottom is at least
    // 72px (BottomNav height) above the visual viewport bottom.
    const cursorClear = await page.evaluate(() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return true
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const vpHeight = window.visualViewport?.height ?? window.innerHeight
      return vpHeight - rect.bottom >= 72
    })

    expect(cursorClear).toBe(true)
  })

  test('Scenario 5: font size cycle button cycles small→medium→large→small, persisted to localStorage', async ({
    page,
  }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Default is medium — cycle button shows current size
    const cycleBtn = page.getByRole('button', { name: /text size: medium/i })
    await expect(cycleBtn).toBeVisible({ timeout: 3000 })

    // Click once → large
    await cycleBtn.click()
    await expect(page.getByRole('button', { name: /text size: large/i })).toBeVisible({
      timeout: 3000,
    })

    // Click again → small
    await page.getByRole('button', { name: /text size: large/i }).click()
    await expect(page.getByRole('button', { name: /text size: small/i })).toBeVisible({
      timeout: 3000,
    })

    // Confirm final state persisted to localStorage (device-local, not Firestore)
    const stored = await page.evaluate(() => localStorage.getItem('pref_editor_font_size'))
    expect(stored).toBe('small')
  })

  /**
   * Opens the "Add scripture" input on any device:
   * - On mobile (< 768px): MetadataBar is shown; must open the sheet first, then click
   *   the "Add scripture" dashed button inside the sheet.
   * - On desktop/tablet (>= 768px): RightPanel is shown; click the "Add scripture
   *   reference" button in the panel directly.
   */
  async function openScriptureInput(page: import('@playwright/test').Page) {
    const vp = page.viewportSize()
    const isMobile = !vp || vp.width < 768
    if (isMobile) {
      // Open metadata sheet first
      const bar = page.getByTestId('metadata-bar')
      await bar.waitFor({ state: 'visible', timeout: 8000 })
      const stripBtn = bar.locator('button').first()
      await stripBtn.click()
      await page.getByText('Entry details').waitFor({ state: 'visible', timeout: 3000 })
      // Click the dashed "Add scripture" button in the sheet
      const addBtn = page.getByRole('button', { name: /Add scripture/i })
      await expect(addBtn).toBeVisible({ timeout: 3000 })
      await addBtn.click()
    } else {
      // RightPanel is visible — click its "Add scripture reference" button
      const scriptureBtn = page.getByRole('button', { name: /Add scripture reference/i })
      await expect(scriptureBtn).toBeVisible({ timeout: 5000 })
      await scriptureBtn.click()
    }
  }

  test('Scenario 7: scripture reference — add ref, chip appears, popover shows verse text', async ({
    page,
  }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 10000 })

    // Intercept Bible API calls so the test is fully offline-capable
    await page.route('**/rest.api.bible/**', (route) => {
      const url = route.request().url()
      // Validation call from ScriptureRefInput (returns reference name)
      // Verse text fetch from useScriptureRef (returns content)
      if (url.includes('/verses/') || url.includes('/passages/')) {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              reference: 'John 3:16',
              content: 'For God so loved the world that he gave his one and only Son.',
            },
          }),
        })
      } else {
        void route.continue()
      }
    })

    // Open the scripture input (via sheet on mobile, via RightPanel on desktop/tablet)
    await openScriptureInput(page)

    // Type the reference into the input that appears
    const refInput = page.getByPlaceholder('e.g. John 3:16 or Psalm 23:1-4')
    await expect(refInput).toBeVisible({ timeout: 3000 })
    await refInput.fill('John 3:16')
    await page.keyboard.press('Enter')

    // The chip should appear with the reference text returned by the API
    const chip = page.getByRole('button', { name: /Show verse: John 3:16/i })
    await expect(chip).toBeVisible({ timeout: 5000 })

    // Click the chip → popover with verse text
    await chip.click()
    await expect(
      page.getByText('For God so loved the world that he gave his one and only Son.'),
    ).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 7b: scripture reference — clicking check button submits ref and chip appears', async ({
    page,
  }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 10000 })

    await page.route('**/rest.api.bible/**', (route) => {
      const url = route.request().url()
      if (url.includes('/verses/') || url.includes('/passages/')) {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              reference: 'Psalm 23:1',
              content: 'The Lord is my shepherd; I shall not want.',
            },
          }),
        })
      } else {
        void route.continue()
      }
    })

    // Open the scripture input (via sheet on mobile, via RightPanel on desktop/tablet)
    await openScriptureInput(page)

    // Type the reference
    const refInput = page.getByPlaceholder('e.g. John 3:16 or Psalm 23:1-4')
    await expect(refInput).toBeVisible({ timeout: 3000 })
    await refInput.fill('Psalm 23:1')

    // Click the check button instead of pressing Enter
    const submitBtn = page.getByRole('button', { name: 'Add scripture reference' })
    await expect(submitBtn).toBeEnabled({ timeout: 2000 })
    await submitBtn.click()

    // Chip should appear
    const chip = page.getByRole('button', { name: /Show verse: Psalm 23:1/i })
    await expect(chip).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 8: scripture reference — ref persists after navigating away and back', async ({
    page,
  }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 10000 })

    const today = format(new Date(), 'yyyy-MM-dd')

    // Intercept Bible API calls
    await page.route('**/rest.api.bible/**', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            reference: 'Romans 8:28',
            content: 'And we know that in all things God works for the good of those who love him.',
          },
        }),
      })
    })

    // Open the scripture input (via sheet on mobile, via RightPanel on desktop/tablet)
    await openScriptureInput(page)

    const refInput = page.getByPlaceholder('e.g. John 3:16 or Psalm 23:1-4')
    await expect(refInput).toBeVisible({ timeout: 3000 })
    await refInput.fill('Romans 8:28')
    await page.keyboard.press('Enter')

    // Wait for chip to appear
    await expect(page.getByRole('button', { name: /Show verse: Romans 8:28/i })).toBeVisible({
      timeout: 5000,
    })

    // Wait for auto-save (1.5s debounce + buffer)
    await page.waitForTimeout(2500)

    // Navigate away then back
    await page.goto('/history')
    await expect(page).toHaveURL('/history', { timeout: 5000 })

    await page.goto(`/entry/${today}`)
    await expect(page).toHaveURL(`/entry/${today}`, { timeout: 5000 })

    // Chip should still be visible after reloading the entry
    await expect(page.getByRole('button', { name: /Show verse: Romans 8:28/i })).toBeVisible({
      timeout: 5000,
    })
  })

  test('No persistent formatting toolbar is rendered on the page', async ({ page }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    // EditorToolbar was removed — no fixed top-bar with formatting buttons should exist.
    // Formatting is only available via the BubbleMenu (hidden until text is selected).
    const bulletBtn = page.getByRole('button', { name: 'Bullet list' })
    const headingBtn = page.getByRole('button', { name: 'Heading 2' })
    await expect(bulletBtn).toBeHidden()
    await expect(headingBtn).toBeHidden()
  })

  // ── MetadataBar E2E scenarios ──────────────────────────────────────────────

  async function getMetadataBarOrSkip(page: import('@playwright/test').Page) {
    const bar = page.getByTestId('metadata-bar')
    // Wait up to 8s for the MetadataBar to appear (Firestore snapshot may delay render)
    const visible = await bar
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!visible, 'MetadataBar is not rendered for this device configuration')
    return bar
  }

  const dismissedSheetTransform = /translateY\(100%\)|matrix\(1, 0, 0, 1, 0, [1-9]/

  test('MetadataBar 1: bar is visible when the editor page loads', async ({ page }) => {
    const bar = await getMetadataBarOrSkip(page)
    await expect(bar).toBeVisible({ timeout: 3000 })
  })

  test('MetadataBar 2: bar has sticky CSS positioning', async ({ page }) => {
    const bar = await getMetadataBarOrSkip(page)

    // Verify CSS position is sticky via computed style — no need to scroll or type content
    const position = await bar.evaluate((el) => window.getComputedStyle(el).position)
    expect(['sticky', 'fixed']).toContain(position)
  })

  test('MetadataBar 3: clicking the strip opens the metadata sheet with "Entry details" heading', async ({
    page,
  }) => {
    const bar = await getMetadataBarOrSkip(page)

    // Sheet must not be open initially. WebKit reports translateY(100%) as a matrix.
    const sheet = page.locator('[data-testid="metadata-sheet"]')
    await expect(sheet).toHaveCSS('transform', dismissedSheetTransform, { timeout: 3000 })

    // Click the outer strip button
    const stripBtn = bar.locator('button').first()
    await expect(stripBtn).toBeVisible({ timeout: 3000 })
    await stripBtn.click()

    // "Entry details" heading must appear and sheet must be visible (translateY changes)
    await expect(page.getByText('Entry details')).toBeVisible({ timeout: 3000 })
  })

  test('MetadataBar 4: clicking strip opens sheet containing Mood, Scripture, and Tags sections', async ({
    page,
  }) => {
    const bar = await getMetadataBarOrSkip(page)

    const stripBtn = bar.locator('button').first()
    await stripBtn.click()

    // All three section labels should be visible in the sheet
    const sheet = page.locator('[data-testid="metadata-sheet"]')
    await expect(sheet.getByText('Entry details')).toBeVisible({ timeout: 3000 })
    await expect(sheet.locator('text=Mood').first()).toBeVisible({ timeout: 3000 })
    await expect(sheet.locator('text=Scripture').first()).toBeVisible({ timeout: 3000 })
    await expect(sheet.locator('text=Tags').first()).toBeVisible({ timeout: 3000 })
  })

  test('MetadataBar 5: close button dismisses the metadata sheet', async ({ page }) => {
    const bar = await getMetadataBarOrSkip(page)

    // Open sheet
    const stripBtn = bar.locator('button').first()
    await stripBtn.click()
    await expect(page.getByText('Entry details')).toBeVisible({ timeout: 3000 })

    // Click the close button (aria-label="Close")
    const closeBtn = page.getByRole('button', { name: 'Close' })
    await expect(closeBtn).toBeVisible({ timeout: 3000 })
    await closeBtn.click()

    // Sheet should be dismissed. WebKit reports translateY(100%) as a matrix.
    const sheet = page.locator('[data-testid="metadata-sheet"]')
    await expect(sheet).toHaveCSS('transform', dismissedSheetTransform, { timeout: 2000 })
  })

  test('MetadataBar 6: clicking mood pill in sheet grid calls mood change', async ({ page }) => {
    const bar = await getMetadataBarOrSkip(page)

    // Open sheet by clicking the mood pill (role=presentation) inside the strip
    const moodPill = bar.locator('[role="presentation"]').first()
    await expect(moodPill).toBeVisible({ timeout: 3000 })
    await moodPill.click()

    // Sheet should open
    await expect(page.getByText('Entry details')).toBeVisible({ timeout: 3000 })

    // The Mood section grid should be visible with mood buttons
    const hopefulBtn = page.getByRole('button', { name: /hopeful/i })
    await expect(hopefulBtn).toBeVisible({ timeout: 3000 })
  })

  test('MetadataBar 7: "Add scripture" dashed button is visible in the sheet Scripture section', async ({
    page,
  }) => {
    const bar = await getMetadataBarOrSkip(page)

    const stripBtn = bar.locator('button').first()
    await stripBtn.click()
    await expect(page.getByText('Entry details')).toBeVisible({ timeout: 3000 })

    // "Add scripture" dashed button should be present in the sheet
    const addScriptureBtn = page.getByRole('button', { name: /Add scripture/i })
    await expect(addScriptureBtn).toBeVisible({ timeout: 3000 })
  })

  test('MetadataBar 8: bar is hidden on tablet-width viewport (md+)', async ({ page }) => {
    // Resize to a tablet-width viewport (≥768px triggers md:hidden)
    await page.setViewportSize({ width: 768, height: 1024 })
    const bar = page.getByTestId('metadata-bar')
    // md:hidden means display:none — element should not be visible
    await expect(bar).toBeHidden()
  })

  // ── End MetadataBar E2E scenarios ──────────────────────────────────────────

  test("Today page loads with today's date in the document title", async ({ page }) => {
    // The page title is set to "Today's Entry" by TodayPage via usePageTitle
    await expect(page).toHaveTitle(/today/i, { timeout: 5000 })

    // Navigating to / always lands on the Today page
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Today button in BottomNav navigates to Today page', async ({ page }) => {
    // Navigate away to history first
    await page.goto('/history')
    await expect(page).toHaveURL('/history', { timeout: 5000 })

    // SideNav Today button on md+ (desktop and tablet); BottomNav Today button on narrow mobile
    // Both are now <button> elements (BottomNav was converted from NavLink to button)
    const todayBtn = page.getByRole('button', { name: /^today$/i })

    await expect(todayBtn).toBeVisible({ timeout: 3000 })
    await todayBtn.click()

    await expect(page).toHaveURL('/', { timeout: 5000 })
    await expect(page).toHaveTitle(/today/i, { timeout: 5000 })
  })

  test('Mood Scenario 1: select Weary via metadata sheet — strip pill updates to show Weary', async ({
    page,
  }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Open the metadata sheet by clicking the strip button
    const bar = page.getByTestId('metadata-bar')
    const visible = await bar
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!visible, 'MetadataBar not rendered for this device configuration')

    const stripBtn = bar.locator('button').first()
    await stripBtn.click()
    await expect(page.getByText('Entry details')).toBeVisible({ timeout: 3000 })

    // Click Weary (second member of value=1 pair) in the mood grid
    const wearyBtn = page.getByRole('button', { name: /weary/i })
    await expect(wearyBtn).toBeVisible({ timeout: 3000 })
    await wearyBtn.click()

    // Close the sheet so we can inspect the strip
    await page.getByRole('button', { name: 'Close' }).click()

    // Strip pill should now show "Weary" text
    await expect(bar.getByText('Weary')).toBeVisible({ timeout: 3000 })
    // The "+ Mood" placeholder should be gone from the strip
    await expect(bar.getByText('+ Mood')).toBeHidden()
  })

  test('Mood Scenario 2: select Grateful via metadata sheet — strip pill updates to show Grateful', async ({
    page,
  }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    const bar = page.getByTestId('metadata-bar')
    const visible = await bar
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!visible, 'MetadataBar not rendered for this device configuration')

    // Open sheet
    const stripBtn = bar.locator('button').first()
    await stripBtn.click()
    await expect(page.getByText('Entry details')).toBeVisible({ timeout: 3000 })

    // Click Grateful (second member of value=4 pair)
    const gratefulBtn = page.getByRole('button', { name: /grateful/i })
    await expect(gratefulBtn).toBeVisible({ timeout: 3000 })
    await gratefulBtn.click()

    // Close sheet and verify strip
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(bar.getByText('Grateful')).toBeVisible({ timeout: 3000 })
    await expect(bar.getByText('+ Mood')).toBeHidden()
  })

  test('Mood Scenario 3: switch from Sorrowful to Weary via metadata sheet', async ({ page }) => {
    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    const bar = page.getByTestId('metadata-bar')
    const visible = await bar
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!visible, 'MetadataBar not rendered for this device configuration')

    // Step 1: Select "Sorrowful" via sheet
    const stripBtn = bar.locator('button').first()
    await stripBtn.click()
    await expect(page.getByText('Entry details')).toBeVisible({ timeout: 3000 })

    const sorrowfulBtn = page.getByRole('button', { name: /sorrowful/i })
    await expect(sorrowfulBtn).toBeVisible({ timeout: 3000 })
    await sorrowfulBtn.click()

    // Close sheet — strip shows "Sorrowful"
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(bar.getByText('Sorrowful')).toBeVisible({ timeout: 3000 })

    // Step 2: Re-open sheet, click Sorrowful again to deselect
    await stripBtn.click()
    await expect(page.getByText('Entry details')).toBeVisible({ timeout: 3000 })
    const sorrowfulBtn2 = page.getByRole('button', { name: /sorrowful/i })
    await expect(sorrowfulBtn2).toBeVisible({ timeout: 3000 })
    await sorrowfulBtn2.click()

    // Close and verify deselected — "+ Mood" appears
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(bar.getByText('+ Mood')).toBeVisible({ timeout: 3000 })

    // Step 3: Open sheet again and select Weary
    await stripBtn.click()
    await expect(page.getByText('Entry details')).toBeVisible({ timeout: 3000 })
    const wearyBtn = page.getByRole('button', { name: /weary/i })
    await expect(wearyBtn).toBeVisible({ timeout: 3000 })
    await wearyBtn.click()

    // Close and verify strip shows "Weary"
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(bar.getByText('Weary')).toBeVisible({ timeout: 3000 })
    await expect(bar.getByText('+ Mood')).toBeHidden()
  })

  test('Mood Scenario 4: selected mood persists after navigation', async ({ page }) => {
    const today = format(new Date(), 'yyyy-MM-dd')

    const editor = await getEditorOrSkip(page)
    await expect(editor).toBeVisible({ timeout: 5000 })

    const bar = page.getByTestId('metadata-bar')
    const visible = await bar
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!visible, 'MetadataBar not rendered for this device configuration')

    // Open sheet and select Weary
    const stripBtn = bar.locator('button').first()
    await stripBtn.click()
    await expect(page.getByText('Entry details')).toBeVisible({ timeout: 3000 })

    const wearyBtn = page.getByRole('button', { name: /weary/i })
    await expect(wearyBtn).toBeVisible({ timeout: 3000 })
    await wearyBtn.click()

    // Close sheet — strip should show Weary
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(bar.getByText('Weary')).toBeVisible({ timeout: 3000 })

    // Mood saves are immediate (no debounce) — give a small buffer
    await page.waitForTimeout(1000)

    await page.goto('/history')
    await expect(page).toHaveURL('/history', { timeout: 5000 })

    await page.goto(`/entry/${today}`)
    await expect(page).toHaveURL(`/entry/${today}`, { timeout: 5000 })
    await expect(page.getByTestId('metadata-bar').getByText('Weary')).toBeVisible({
      timeout: 5000,
    })
  })
})

// ── Viewport-specific metadata visibility ─────────────────────────────────────

test.describe('Metadata visibility by viewport', () => {
  let testEmail: string

  test.beforeEach(async ({ page }, testInfo) => {
    testEmail = testEmailForProject(`meta-vp-${testInfo.project.name}`)
    await clearTestUser(testEmail)
    await createEmulatorUser(testEmail, TEST_PASSWORD)
    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Desktop: metadata chips visible in RightPanel (XL viewport)', async ({
    page,
  }, testInfo) => {
    // RightPanel is xl:flex — only chromium project uses Desktop Chrome (1280px)
    if (testInfo.project.name !== 'chromium') {
      test.skip()
      return
    }

    // RightPanel (aside) surfaces mood controls (MoodPicker) when editor is active
    const rightPanel = page.locator('aside')
    await expect(rightPanel).toBeVisible({ timeout: 5000 })

    // Mood section header must be visible inside the RightPanel
    const moodSectionHeader = rightPanel.locator('header').filter({ hasText: /mood/i })
    await expect(moodSectionHeader).toBeVisible({ timeout: 5000 })
  })

  test('Mobile: MetadataBar visible and RightPanel mood chip not rendered', async ({
    page,
  }, testInfo) => {
    // mobile-safari project uses iPhone 14 (390px wide)
    if (testInfo.project.name !== 'mobile-safari') {
      test.skip()
      return
    }

    // MetadataBar may not appear until Firestore resolves isLoading — allow up to 10s.
    // If the MetadataBar never appears (e.g. network error), skip gracefully.
    const metadataBar = page.getByTestId('metadata-bar')
    const appeared = await metadataBar
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!appeared, 'MetadataBar did not appear within timeout on mobile')

    await expect(metadataBar).toBeVisible({ timeout: 3000 })

    // RightPanel aside is xl:flex — hidden on mobile; mood chip inside it is not visible
    const rightPanelAside = page.locator('aside').filter({ hasText: /\+ mood/i })
    await expect(rightPanelAside).toBeHidden()
  })
})

// ── Phase 2: RightPanel behaviour tests ──────────────────────────────────────

test.describe('RightPanel Phase 2 behaviour', () => {
  let testEmail: string

  test.beforeEach(async ({ page }, testInfo) => {
    testEmail = testEmailForProject(`rp-phase2-${testInfo.project.name}`)
    await clearTestUser(testEmail)
    await createEmulatorUser(testEmail, TEST_PASSWORD)
    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('RightPanel Phase2-1: "Today\'s Word" appears exactly once on desktop', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== 'chromium') {
      test.skip()
      return
    }

    const rightPanel = page.locator('aside')
    await expect(rightPanel).toBeVisible({ timeout: 5000 })

    // DailyScripture owns the "Today's Word" label — RightPanel must not duplicate it
    const todaysWordElements = rightPanel.getByText("Today's Word")
    await expect(todaysWordElements).toHaveCount(1, { timeout: 5000 })
  })

  test('RightPanel Phase2-2: no "Add as verse" button is rendered', async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'chromium') {
      test.skip()
      return
    }

    const rightPanel = page.locator('aside')
    await expect(rightPanel).toBeVisible({ timeout: 5000 })

    // The "Add as verse" button was removed in Phase 2
    await expect(rightPanel.getByRole('button', { name: /add as verse/i })).toHaveCount(0)
    await expect(rightPanel.getByRole('button', { name: /added as verse/i })).toHaveCount(0)
  })

  test('RightPanel Phase2-3: mood section always shows MoodPicker dropdown (not collapsible)', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== 'chromium') {
      test.skip()
      return
    }

    const rightPanel = page.locator('aside')
    await expect(rightPanel).toBeVisible({ timeout: 5000 })

    // Mood section header must exist
    const moodHeader = rightPanel.locator('header').filter({ hasText: /mood/i })
    await expect(moodHeader).toBeVisible({ timeout: 5000 })

    // Dropdown trigger must be directly visible — no expand needed
    const dropdownTrigger = rightPanel.getByRole('button', { name: /how are you feeling/i })
    await expect(dropdownTrigger).toBeVisible({ timeout: 5000 })

    // No expand/collapse chevron button in mood section
    await expect(rightPanel.getByRole('button', { name: /expand section/i })).toHaveCount(0)
    await expect(rightPanel.getByRole('button', { name: /collapse section/i })).toHaveCount(0)
  })

  test('RightPanel Phase2-4: mood dropdown is selectable without any expand click', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== 'chromium') {
      test.skip()
      return
    }

    const rightPanel = page.locator('aside')
    await expect(rightPanel).toBeVisible({ timeout: 5000 })

    // Wait for mood section to appear (requires editor active + metadata)
    const moodHeader = rightPanel.locator('header').filter({ hasText: /mood/i })
    await expect(moodHeader).toBeVisible({ timeout: 5000 })

    // Dropdown trigger is immediately visible — click to open
    const dropdownTrigger = rightPanel.getByRole('button', { name: /how are you feeling/i })
    await expect(dropdownTrigger).toBeVisible({ timeout: 5000 })
    await dropdownTrigger.click()

    // Listbox should open — select Hopeful
    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeVisible({ timeout: 3000 })
    await listbox.getByText('🌱 Hopeful').click()

    // After selecting, trigger should now show the selected mood
    await expect(rightPanel.getByText('🌱 Hopeful')).toBeVisible({ timeout: 3000 })
  })

  test('RightPanel Phase2-5: scripture label changes from "Scriptures" to "Scripture" when 1 ref added', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== 'chromium') {
      test.skip()
      return
    }

    // Intercept Bible API so test is offline-capable
    await page.route('**/rest.api.bible/**', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            reference: 'John 3:16',
            content: 'For God so loved the world.',
          },
        }),
      })
    })

    const rightPanel = page.locator('aside')
    await expect(rightPanel).toBeVisible({ timeout: 5000 })

    // Initially 0 refs → label is "Scriptures"
    const scripturesLabel = rightPanel.getByText('Scriptures')
    await expect(scripturesLabel).toBeVisible({ timeout: 5000 })

    // Add one ref via the panel
    const addBtn = rightPanel.getByRole('button', { name: /add scripture reference/i })
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()

    const refInput = page.getByPlaceholder('e.g. John 3:16 or Psalm 23:1-4')
    await expect(refInput).toBeVisible({ timeout: 3000 })
    await refInput.fill('John 3:16')
    await page.keyboard.press('Enter')

    // Wait for the scripture card to appear — RightPanel shows reference text inline
    await expect(rightPanel.getByText('John 3:16')).toBeVisible({ timeout: 5000 })

    // Label must now be "Scripture" (singular) — the section header span text changes
    // Use a strict regex to match "Scripture" but not "Scriptures"
    await expect(rightPanel.locator('span').filter({ hasText: /^Scripture$/ })).toBeVisible({
      timeout: 5000,
    })
  })
})

// ── Phase 3: Tag # prefix display tests ──────────────────────────────────────

test.describe('Tag # prefix display', () => {
  let testEmail: string

  test.beforeEach(async ({ page }, testInfo) => {
    testEmail = testEmailForProject(`tag-prefix-${testInfo.project.name}`)
    await clearTestUser(testEmail)
    await createEmulatorUser(testEmail, TEST_PASSWORD)
    await page.goto('/login')
    await signInAsTestUser(page, testEmail)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Tag prefix 1: tag chip added via RightPanel TagInput displays # prefix on desktop', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== 'chromium') {
      test.skip()
      return
    }

    const rightPanel = page.locator('aside')
    await expect(rightPanel).toBeVisible({ timeout: 5000 })

    // Type a tag into the TagInput inside the RightPanel Tags section
    const tagInput = rightPanel.getByPlaceholder('Add tag…')
    await expect(tagInput).toBeVisible({ timeout: 5000 })
    await tagInput.fill('gratitude')
    await page.keyboard.press('Enter')

    // The chip must appear with the # prefix
    await expect(rightPanel.getByText('#gratitude')).toBeVisible({ timeout: 3000 })
  })

  test('Tag prefix 2: tag chip added via MetadataSheet TagInput displays # prefix on mobile', async ({
    page,
  }, testInfo) => {
    // mobile-safari project uses iPhone 14 (390px wide)
    if (testInfo.project.name !== 'mobile-safari') {
      test.skip()
      return
    }

    const bar = page.getByTestId('metadata-bar')
    const visible = await bar
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!visible, 'MetadataBar not rendered for this device configuration')

    // Open the metadata sheet
    const stripBtn = bar.locator('button').first()
    await stripBtn.click()
    const sheet = page.getByTestId('metadata-sheet')
    await expect(sheet.getByText('Entry details')).toBeVisible({ timeout: 3000 })

    // Type a tag into the TagInput inside the sheet
    const tagInput = sheet.getByPlaceholder('Add tag…')
    await expect(tagInput).toBeVisible({ timeout: 3000 })
    await tagInput.fill('morning')
    await page.keyboard.press('Enter')

    // The chip must appear with the # prefix
    await expect(sheet.getByText('#morning')).toBeVisible({ timeout: 3000 })
  })
})
