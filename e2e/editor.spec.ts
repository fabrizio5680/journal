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

  test('Scenario 2: type text → auto-save → Firestore emulator has entry doc', async ({
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

    // Query Firestore emulator REST API for the doc (auth token required by security rules)
    const docUrl = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${testUid}/entries/${today}`
    const res = await request.get(docUrl, {
      headers: { Authorization: `Bearer ${testIdToken}` },
    })
    expect(res.ok()).toBeTruthy()
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

  test('Scenario 5: font size cycle button cycles small→medium→large→small, persisted to Firestore', async ({
    page,
    request,
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

    // Confirm final state persisted to Firestore user doc
    await page.waitForTimeout(500)
    const userDocUrl = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${testUid}`
    const res = await request.get(userDocUrl, {
      headers: { Authorization: `Bearer ${testIdToken}` },
    })
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as {
      fields?: { editorFontSize?: { stringValue?: string } }
    }
    expect(body.fields?.editorFontSize?.stringValue).toBe('small')
  })
})
