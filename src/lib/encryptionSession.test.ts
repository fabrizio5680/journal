import { describe, it, expect, beforeEach } from 'vitest'

import { generateSalt, deriveKey, encrypt, decrypt } from './crypto'
import {
  setSessionKey,
  getSessionKey,
  clearSessionKey,
  isSessionUnlocked,
} from './encryptionSession'

// ─────────────────────────────────────────────────────────────────────────────

// jsdom provides sessionStorage; clear it before each test for isolation.
beforeEach(() => {
  sessionStorage.clear()
})

// ─────────────────────────────────────────────────────────────────────────────

describe('isSessionUnlocked', () => {
  it('returns false when sessionStorage is empty', () => {
    expect(isSessionUnlocked()).toBe(false)
  })

  it('returns true after setSessionKey', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('passphrase', salt)
    await setSessionKey(key)
    expect(isSessionUnlocked()).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('setSessionKey + getSessionKey round-trip', () => {
  it('stored key can decrypt what the original key encrypted', async () => {
    const salt = await generateSalt()
    const originalKey = await deriveKey('session-test', salt)

    const plaintext = 'A secret journal entry'
    const { iv, ciphertext } = await encrypt(originalKey, plaintext)

    // Store in sessionStorage
    await setSessionKey(originalKey)

    // Retrieve from sessionStorage
    const retrievedKey = await getSessionKey()
    expect(retrievedKey).not.toBeNull()

    const decrypted = await decrypt(retrievedKey!, iv, ciphertext)
    expect(decrypted).toBe(plaintext)
  })

  it('getSessionKey returns null when sessionStorage is empty', async () => {
    const key = await getSessionKey()
    expect(key).toBeNull()
  })

  it('returned key has encrypt + decrypt usages', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('usage-test', salt)
    await setSessionKey(key)

    const retrieved = await getSessionKey()
    expect(retrieved).not.toBeNull()
    expect(retrieved!.usages).toContain('encrypt')
    expect(retrieved!.usages).toContain('decrypt')
  })

  it('returned key has AES-GCM algorithm', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('algo-test', salt)
    await setSessionKey(key)

    const retrieved = await getSessionKey()
    expect(retrieved).not.toBeNull()
    expect(retrieved!.algorithm.name).toBe('AES-GCM')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('clearSessionKey', () => {
  it('removes the key so isSessionUnlocked returns false', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('clear-test', salt)
    await setSessionKey(key)
    expect(isSessionUnlocked()).toBe(true)

    clearSessionKey()
    expect(isSessionUnlocked()).toBe(false)
  })

  it('getSessionKey returns null after clearSessionKey', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('clear-get-test', salt)
    await setSessionKey(key)

    clearSessionKey()
    const retrieved = await getSessionKey()
    expect(retrieved).toBeNull()
  })

  it('is safe to call when no key is stored', () => {
    // Should not throw
    expect(() => clearSessionKey()).not.toThrow()
    expect(isSessionUnlocked()).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('getSessionKey with corrupted storage', () => {
  it('returns null and removes the corrupted entry when storage is invalid base64', async () => {
    // Manually inject an invalid value that fromBase64 / importKeyBytes would reject
    sessionStorage.setItem('eq_key', '!!!NOT_VALID_BASE64!!!')
    const key = await getSessionKey()
    expect(key).toBeNull()
    // Should have been cleaned up
    expect(isSessionUnlocked()).toBe(false)
  })
})
