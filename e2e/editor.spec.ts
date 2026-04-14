import { test, expect } from '@playwright/test'
import { format } from 'date-fns'

const EMULATOR_AUTH_URL = 'http://localhost:9099'
const FIRESTORE_EMULATOR_URL = 'http://localhost:8080'
const PROJECT_ID = 'journal-manna'
const FAKE_API_KEY = 'fake-api-key'

const TEST_EMAIL = 'editor-test@example.com'
const TEST_PASSWORD = 'password123'

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

test.describe('Editor', () => {
  let testUid: string

  test.beforeEach(async ({ page }) => {
    await clearEmulatorUsers()
    testUid = await createEmulatorUser(TEST_EMAIL, TEST_PASSWORD)
    await page.goto('/login')
    await signInAsTestUser(page)
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })

  test('Scenario 1: type text → "Draft saved" appears in TopBar', async ({ page }) => {
    // Wait for the editor to mount
    const editor = page.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    // Type into the editor
    await editor.click()
    await page.keyboard.type('This is a test journal entry')

    // After 2s the auto-save debounce fires and "Draft saved" should appear
    await expect(page.getByText(/Draft saved/i)).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 2: type text → click Save → Firestore emulator has entry doc', async ({
    page,
    request,
  }) => {
    const today = format(new Date(), 'yyyy-MM-dd')

    const editor = page.locator('.tiptap')
    await expect(editor).toBeVisible({ timeout: 5000 })

    await editor.click()
    await page.keyboard.type('Saved via button')

    // Click Save Entry button
    await page.getByRole('button', { name: /Save Entry/i }).click()

    // Give Firestore a moment to persist
    await page.waitForTimeout(1000)

    // Query Firestore emulator REST API for the doc
    const docUrl = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${testUid}/entries/${today}`
    const res = await request.get(docUrl)
    expect(res.ok()).toBeTruthy()
  })

  test('Scenario 3: word count updates as user types', async ({ page }) => {
    const editor = page.locator('.tiptap')
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
    const editor = page.locator('.tiptap')
    await expect(editor).toContainText('dictated text', { timeout: 3000 })

    // Click mic-off → back to idle
    await page.getByRole('button', { name: /stop dictation/i }).click()
    await expect(page.getByRole('button', { name: /dictate/i })).toBeVisible({ timeout: 3000 })
  })
})
