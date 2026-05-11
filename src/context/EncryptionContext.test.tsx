import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { ReactNode } from 'react'

// ── Firebase mocks ────────────────────────────────────────────────────────────

let snapshotCallback: ((snap: unknown) => void) | null = null
let snapshotErrorCallback: ((err: unknown) => void) | null = null
const mockUnsub = vi.fn()
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockGetDoc = vi.fn()
const mockDoc = vi.fn().mockReturnValue({ id: 'mock-ref', path: 'users/test-uid' })
const mockOnSnapshot = vi.fn(
  (_ref: unknown, cb: (snap: unknown) => void, errCb?: (err: unknown) => void) => {
    snapshotCallback = cb
    snapshotErrorCallback = errCb ?? null
    return mockUnsub
  },
)

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...(args as [unknown, ...unknown[]])),
  onSnapshot: (ref: unknown, cb: (snap: unknown) => void, errCb?: (err: unknown) => void) =>
    mockOnSnapshot(ref, cb, errCb),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...(args as [unknown, ...unknown[]])),
  getDoc: (...args: unknown[]) => mockGetDoc(...(args as [unknown, ...unknown[]])),
}))

let authCallback: ((user: { uid: string } | null) => void) | null = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_: unknown, cb: (user: { uid: string } | null) => void) => {
    authCallback = cb
    return vi.fn()
  },
}))

// firebase.ts mock is already in setup.ts

// ── Encryption session mocks ──────────────────────────────────────────────────
// Use real crypto + encryptionSession to keep tests trustworthy.
// sessionStorage is provided by jsdom; clear it in beforeEach.

// ── Helpers ───────────────────────────────────────────────────────────────────

import { EncryptionProvider, useEncryption } from './EncryptionContext'

import { generateSalt, deriveKey, encrypt, exportKeyBytes } from '@/lib/crypto'

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

const CANARY_PLAINTEXT = 'QUIET_DWELLING_CANARY'
const CANARY_SEPARATOR = '|'

function wrapper({ children }: { children: ReactNode }) {
  return <EncryptionProvider>{children}</EncryptionProvider>
}

/** Fire the Firestore user doc snapshot with the given data. */
function fireUserSnapshot(data: Record<string, unknown> | undefined) {
  act(() => {
    snapshotCallback?.({
      data: () => data,
      exists: () => data !== undefined,
    })
  })
}

/** Fire the auth callback with the given user (or null to sign out). */
function fireAuth(uid: string | null = 'test-uid') {
  act(() => {
    authCallback?.(uid ? { uid } : null)
  })
}

/** Build a Firestore user doc snapshot data block with encryption enabled. */
async function buildEncryptedUserData(passphrase: string) {
  const salt = await generateSalt()
  const key = await deriveKey(passphrase, salt)
  const { iv: canaryIv, ciphertext: canaryCipher } = await encrypt(key, CANARY_PLAINTEXT)
  const canaryEncoded = `${canaryIv}${CANARY_SEPARATOR}${canaryCipher}`

  // Also build recoveryData (needed for unlockWithRecovery)
  const recoveryCode = 'ABCDEFGH23456789abcdefgh'
  const recoveryKey = await deriveKey(recoveryCode, salt)
  const primaryKeyBytes = await exportKeyBytes(key)
  const primaryKeyBase64 = toBase64(primaryKeyBytes)
  const { iv: recovIv, ciphertext: recovCipher } = await encrypt(recoveryKey, primaryKeyBase64)
  const recoveryEncoded = `${recovIv}${CANARY_SEPARATOR}${recovCipher}`

  return { salt, canaryEncoded, recoveryEncoded, key, recoveryCode }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('EncryptionContext — initial state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    snapshotErrorCallback = null
    authCallback = null
    sessionStorage.clear()
    mockGetDoc.mockResolvedValue({ data: () => undefined, exists: () => false })
  })

  it('starts with isLoading: true, isEnabled: false, isUnlocked: false', () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    // Before auth resolves
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isEnabled).toBe(false)
    expect(result.current.isUnlocked).toBe(false)
  })

  it('resolves isLoading: false after Firestore snapshot fires (encryption disabled)', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: false })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEnabled).toBe(false)
    expect(result.current.isUnlocked).toBe(false)
  })

  it('resolves isLoading: false after Firestore snapshot fires (no encryption data)', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot(undefined)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEnabled).toBe(false)
  })

  it('resolves isLoading: false on Firestore error', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    act(() => {
      snapshotErrorCallback?.(new Error('Firestore error'))
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('resolves isLoading: false immediately when user is not authenticated', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth(null)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEnabled).toBe(false)
    expect(result.current.isUnlocked).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('EncryptionContext — enable()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    snapshotErrorCallback = null
    authCallback = null
    sessionStorage.clear()
    mockGetDoc.mockResolvedValue({ data: () => undefined, exists: () => false })
    mockUpdateDoc.mockResolvedValue(undefined)
  })

  it('sets isEnabled and isUnlocked to true and returns a recoveryCode string', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: false })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let recoveryCode = ''
    await act(async () => {
      const res = await result.current.enable('my-passphrase')
      recoveryCode = res.recoveryCode
    })

    expect(result.current.isEnabled).toBe(true)
    expect(result.current.isUnlocked).toBe(true)
    expect(typeof recoveryCode).toBe('string')
    expect(recoveryCode.length).toBeGreaterThan(0)
  })

  it('recovery code is 24 chars long (from generateRecoveryCode)', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: false })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let recoveryCode = ''
    await act(async () => {
      const res = await result.current.enable('passphrase-123')
      recoveryCode = res.recoveryCode
    })

    expect(recoveryCode).toHaveLength(24)
  })

  it('calls updateDoc with encryptionEnabled: true and required fields', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: false })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.enable('passphrase')
    })

    expect(mockUpdateDoc).toHaveBeenCalledOnce()
    const [, payload] = mockUpdateDoc.mock.calls[0]
    expect(payload.encryptionEnabled).toBe(true)
    expect(typeof payload.encryptionSalt).toBe('string')
    expect(typeof payload.encryptionCanary).toBe('string')
    expect(typeof payload.encryptionRecoveryData).toBe('string')
  })

  it('throws if not authenticated', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth(null)
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(
      act(async () => {
        await result.current.enable('passphrase')
      }),
    ).rejects.toThrow('Not authenticated')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('EncryptionContext — unlock()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    snapshotErrorCallback = null
    authCallback = null
    sessionStorage.clear()
  })

  it('returns true and sets isUnlocked when passphrase is correct', async () => {
    const passphrase = 'correct-passphrase'
    const { salt, canaryEncoded, recoveryEncoded } = await buildEncryptedUserData(passphrase)

    // Set up getDoc to return the user doc with canary
    mockGetDoc.mockResolvedValue({
      data: () => ({
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
        encryptionRecoveryData: recoveryEncoded,
      }),
      exists: () => true,
    })

    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({
      encryptionEnabled: true,
      encryptionSalt: salt,
      encryptionCanary: canaryEncoded,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEnabled).toBe(true)
    expect(result.current.isUnlocked).toBe(false)

    let unlockResult = false
    await act(async () => {
      unlockResult = await result.current.unlock(passphrase)
    })

    expect(unlockResult).toBe(true)
    expect(result.current.isUnlocked).toBe(true)
  })

  it('returns false when passphrase is wrong', async () => {
    const passphrase = 'correct-passphrase'
    const { salt, canaryEncoded, recoveryEncoded } = await buildEncryptedUserData(passphrase)

    mockGetDoc.mockResolvedValue({
      data: () => ({
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
        encryptionRecoveryData: recoveryEncoded,
      }),
      exists: () => true,
    })

    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({
      encryptionEnabled: true,
      encryptionSalt: salt,
      encryptionCanary: canaryEncoded,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let unlockResult = true
    await act(async () => {
      unlockResult = await result.current.unlock('wrong-passphrase')
    })

    expect(unlockResult).toBe(false)
    expect(result.current.isUnlocked).toBe(false)
  })

  it('returns false when user doc has no canary', async () => {
    const { salt } = await buildEncryptedUserData('passphrase')

    mockGetDoc.mockResolvedValue({
      data: () => ({
        encryptionEnabled: true,
        encryptionSalt: salt,
        // no canary
      }),
      exists: () => true,
    })

    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: true, encryptionSalt: salt })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let unlockResult = true
    await act(async () => {
      unlockResult = await result.current.unlock('passphrase')
    })

    expect(unlockResult).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('EncryptionContext — lock()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    snapshotErrorCallback = null
    authCallback = null
    sessionStorage.clear()
    mockUpdateDoc.mockResolvedValue(undefined)
  })

  it('clears isUnlocked after being unlocked via enable()', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: false })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.enable('passphrase')
    })

    expect(result.current.isUnlocked).toBe(true)

    act(() => result.current.lock())

    expect(result.current.isUnlocked).toBe(false)
  })

  it('is safe to call when already locked', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: false })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Should not throw
    expect(() => act(() => result.current.lock())).not.toThrow()
    expect(result.current.isUnlocked).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('EncryptionContext — encryptFields() + decryptFields()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    snapshotErrorCallback = null
    authCallback = null
    sessionStorage.clear()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockGetDoc.mockResolvedValue({ data: () => undefined, exists: () => false })
  })

  it('encryptFields returns contentEncrypted: false when encryption is not enabled', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: false })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const content = { type: 'doc', content: [] }
    const contentText = 'Hello world'

    let output: { content: object; contentText: string; contentEncrypted: boolean } | null = null
    await act(async () => {
      output = await result.current.encryptFields(content, contentText)
    })

    expect(output!.contentEncrypted).toBe(false)
    expect(output!.content).toBe(content)
    expect(output!.contentText).toBe(contentText)
  })

  it('encryptFields returns contentEncrypted: true and encrypted content when unlocked', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: false })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Enable encryption first
    await act(async () => {
      await result.current.enable('passphrase')
    })

    const content = { type: 'doc', content: [{ type: 'paragraph', content: [] }] }
    const contentText = 'My secret journal entry'

    let output: { content: object; contentText: string; contentEncrypted: boolean } | null = null
    await act(async () => {
      output = await result.current.encryptFields(content, contentText)
    })

    expect(output!.contentEncrypted).toBe(true)
    // Encrypted content should not equal the original plaintext
    expect(JSON.stringify(output!.content)).not.toBe(JSON.stringify(content))
    expect(output!.contentText).not.toBe(contentText)
  })

  it('decryptFields returns content unchanged when contentEncrypted is false', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: false })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const content = { type: 'doc', content: [] }
    const contentText = 'Plain text entry'

    let output: { content: object; contentText: string } | null = null
    await act(async () => {
      output = await result.current.decryptFields({ content, contentText, contentEncrypted: false })
    })

    expect(output!.content).toBe(content)
    expect(output!.contentText).toBe(contentText)
  })

  it('encryptFields + decryptFields round-trip restores original content', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({ encryptionEnabled: false })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.enable('round-trip-pass')
    })

    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Secret' }] }],
    }
    const contentText = 'Secret'

    let encrypted: { content: object; contentText: string; contentEncrypted: boolean } | null = null
    await act(async () => {
      encrypted = await result.current.encryptFields(content, contentText)
    })

    expect(encrypted!.contentEncrypted).toBe(true)

    let decrypted: { content: object; contentText: string } | null = null
    await act(async () => {
      decrypted = await result.current.decryptFields(encrypted!)
    })

    expect(decrypted!.contentText).toBe(contentText)
    expect(JSON.stringify(decrypted!.content)).toBe(JSON.stringify(content))
  })

  it('decryptFields throws EncryptionLockedError when session is locked but contentEncrypted is true', async () => {
    const passphrase = 'test-passphrase'
    const { salt, canaryEncoded, recoveryEncoded } = await buildEncryptedUserData(passphrase)

    // Set up a session that is "enabled" but locked (no key in session)
    mockGetDoc.mockResolvedValue({
      data: () => ({
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
        encryptionRecoveryData: recoveryEncoded,
      }),
      exists: () => true,
    })

    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    // Fire snapshot with encryption enabled but no session key in storage → isUnlocked stays false
    fireUserSnapshot({
      encryptionEnabled: true,
      encryptionSalt: salt,
      encryptionCanary: canaryEncoded,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEnabled).toBe(true)
    expect(result.current.isUnlocked).toBe(false)

    // Calling decryptFields with contentEncrypted: true while locked should throw
    await expect(
      act(async () => {
        await result.current.decryptFields({
          content: { iv: 'someIv', ciphertext: 'someCipher' },
          contentText: 'iv|cipher',
          contentEncrypted: true,
        })
      }),
    ).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('EncryptionContext — unlockWithRecovery()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    snapshotErrorCallback = null
    authCallback = null
    sessionStorage.clear()
    mockUpdateDoc.mockResolvedValue(undefined)
  })

  it('unlock() also works from this describe block setup (sanity check)', async () => {
    // Verify that the test infrastructure works correctly in this describe block
    // by checking that unlock() works with the same setup pattern.
    const passphrase = 'sanity-check-pass'
    const { salt, canaryEncoded, recoveryEncoded } = await buildEncryptedUserData(passphrase)

    mockGetDoc.mockResolvedValue({
      data: () => ({
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
        encryptionRecoveryData: recoveryEncoded,
      }),
      exists: () => true,
    })

    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({
      encryptionEnabled: true,
      encryptionSalt: salt,
      encryptionCanary: canaryEncoded,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let unlockResult = false
    await act(async () => {
      unlockResult = await result.current.unlock(passphrase)
    })

    // If this passes, the test infrastructure is working
    expect(unlockResult).toBe(true)
    expect(result.current.isUnlocked).toBe(true)
  })

  it('returns true when recovery code is correct', async () => {
    // Build encryption data upfront using the same crypto primitives as the context.
    // Mirror the structure of the `unlock() returns true` test which passes.
    const passphrase = 'recovery-unlock-test-pass'
    const { salt, canaryEncoded, recoveryEncoded, recoveryCode } =
      await buildEncryptedUserData(passphrase)

    // First verify unlock() works with this data (sanity check inline)
    {
      const mockData = {
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
        encryptionRecoveryData: recoveryEncoded,
      }
      mockGetDoc.mockResolvedValue({ data: () => mockData, exists: () => true })

      const { result: r } = renderHook(() => useEncryption(), { wrapper })
      fireAuth('test-uid')
      fireUserSnapshot({
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
      })
      await waitFor(() => expect(r.current.isLoading).toBe(false))

      let unlockRes = false
      await act(async () => {
        unlockRes = await r.current.unlock(passphrase)
      })
      expect(unlockRes).toBe(true) // If this fails, it's an infrastructure issue
    }

    // Now test unlockWithRecovery with the same data
    sessionStorage.clear()
    mockGetDoc.mockResolvedValue({
      data: () => ({
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
        encryptionRecoveryData: recoveryEncoded,
      }),
      exists: () => true,
    })

    const { result } = renderHook(() => useEncryption(), { wrapper })
    fireAuth('test-uid')
    fireUserSnapshot({
      encryptionEnabled: true,
      encryptionSalt: salt,
      encryptionCanary: canaryEncoded,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isEnabled).toBe(true)
    expect(result.current.isUnlocked).toBe(false)

    let unlockResult = false
    await act(async () => {
      unlockResult = await result.current.unlockWithRecovery(recoveryCode)
    })

    expect(unlockResult).toBe(true)
    expect(result.current.isUnlocked).toBe(true)
  })

  it('returns false when recovery code is wrong', async () => {
    const passphrase = 'passphrase'
    const { salt, canaryEncoded, recoveryEncoded } = await buildEncryptedUserData(passphrase)

    mockGetDoc.mockResolvedValue({
      data: () => ({
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
        encryptionRecoveryData: recoveryEncoded,
      }),
      exists: () => true,
    })

    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({
      encryptionEnabled: true,
      encryptionSalt: salt,
      encryptionCanary: canaryEncoded,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let unlockResult = true
    await act(async () => {
      unlockResult = await result.current.unlockWithRecovery('WRONGCODE00000000WRONG00')
    })

    expect(unlockResult).toBe(false)
    expect(result.current.isUnlocked).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('EncryptionContext — disable()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshotCallback = null
    snapshotErrorCallback = null
    authCallback = null
    sessionStorage.clear()
    mockUpdateDoc.mockResolvedValue(undefined)
  })

  it('sets isEnabled and isUnlocked to false when passphrase is correct', async () => {
    const passphrase = 'disable-test-pass'
    const { salt, canaryEncoded, recoveryEncoded } = await buildEncryptedUserData(passphrase)

    mockGetDoc.mockResolvedValue({
      data: () => ({
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
        encryptionRecoveryData: recoveryEncoded,
      }),
      exists: () => true,
    })

    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    // Fire snapshot as encryption enabled
    fireUserSnapshot({
      encryptionEnabled: true,
      encryptionSalt: salt,
      encryptionCanary: canaryEncoded,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // First, unlock
    await act(async () => {
      await result.current.unlock(passphrase)
    })
    expect(result.current.isUnlocked).toBe(true)

    // Then disable
    await act(async () => {
      await result.current.disable(passphrase)
    })

    expect(result.current.isEnabled).toBe(false)
    expect(result.current.isUnlocked).toBe(false)
  })

  it('calls updateDoc with encryptionEnabled: false', async () => {
    const passphrase = 'disable-doc-test'
    const { salt, canaryEncoded, recoveryEncoded } = await buildEncryptedUserData(passphrase)

    mockGetDoc.mockResolvedValue({
      data: () => ({
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
        encryptionRecoveryData: recoveryEncoded,
      }),
      exists: () => true,
    })

    const { result } = renderHook(() => useEncryption(), { wrapper })

    fireAuth('test-uid')
    fireUserSnapshot({
      encryptionEnabled: true,
      encryptionSalt: salt,
      encryptionCanary: canaryEncoded,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.unlock(passphrase)
    })

    const updateDocCallsBefore = (mockUpdateDoc as Mock).mock.calls.length

    await act(async () => {
      await result.current.disable(passphrase)
    })

    // A new updateDoc call should have happened
    expect((mockUpdateDoc as Mock).mock.calls.length).toBeGreaterThan(updateDocCallsBefore)
    const lastCall = (mockUpdateDoc as Mock).mock.calls[
      (mockUpdateDoc as Mock).mock.calls.length - 1
    ]
    expect(lastCall[1].encryptionEnabled).toBe(false)
  })
})
