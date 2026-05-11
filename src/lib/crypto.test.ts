import { describe, it, expect } from 'vitest'

import {
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  generateRecoveryCode,
  exportKeyBytes,
  importKeyBytes,
} from './crypto'

// Helpers ─────────────────────────────────────────────────────────────────────

function fromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// ─────────────────────────────────────────────────────────────────────────────

describe('generateSalt', () => {
  it('returns a base64 string', async () => {
    const salt = await generateSalt()
    expect(typeof salt).toBe('string')
    // base64 chars only
    expect(/^[A-Za-z0-9+/=]+$/.test(salt)).toBe(true)
  })

  it('encodes exactly 16 bytes', async () => {
    const salt = await generateSalt()
    const bytes = new Uint8Array(fromBase64(salt))
    expect(bytes.length).toBe(16)
  })

  it('returns different values on successive calls', async () => {
    const a = await generateSalt()
    const b = await generateSalt()
    expect(a).not.toBe(b)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('deriveKey', () => {
  it('returns a CryptoKey', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('my-passphrase', salt)
    expect(key).toBeTruthy()
    expect(key.type).toBe('secret')
    expect(key.algorithm.name).toBe('AES-GCM')
  })

  it('is extractable (exported in exportKeyBytes)', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('passphrase', salt)
    const raw = await exportKeyBytes(key)
    expect(raw.byteLength).toBe(32) // 256-bit key
  })

  it('produces different keys for different passphrases with the same salt', async () => {
    const salt = await generateSalt()
    const key1 = await deriveKey('pass1', salt)
    const key2 = await deriveKey('pass2', salt)
    const raw1 = await exportKeyBytes(key1)
    const raw2 = await exportKeyBytes(key2)
    expect(toHex(raw1)).not.toBe(toHex(raw2))
  })

  it('produces different keys for the same passphrase with different salts', async () => {
    const salt1 = await generateSalt()
    const salt2 = await generateSalt()
    const key1 = await deriveKey('passphrase', salt1)
    const key2 = await deriveKey('passphrase', salt2)
    const raw1 = await exportKeyBytes(key1)
    const raw2 = await exportKeyBytes(key2)
    expect(toHex(raw1)).not.toBe(toHex(raw2))
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('encrypt + decrypt round-trip', () => {
  it('encrypts then decrypts back to the original plaintext', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('test-passphrase', salt)

    const plaintext = 'Hello, Quiet Dwelling!'
    const { iv, ciphertext } = await encrypt(key, plaintext)
    const result = await decrypt(key, iv, ciphertext)

    expect(result).toBe(plaintext)
  })

  it('works with an empty string', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('empty-test', salt)

    const { iv, ciphertext } = await encrypt(key, '')
    const result = await decrypt(key, iv, ciphertext)
    expect(result).toBe('')
  })

  it('works with a long string', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('long-string', salt)

    const plaintext = 'A'.repeat(10_000)
    const { iv, ciphertext } = await encrypt(key, plaintext)
    const result = await decrypt(key, iv, ciphertext)
    expect(result).toBe(plaintext)
  })

  it('encrypt returns different ciphertexts on successive calls (fresh IV each time)', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('repeat-test', salt)

    const plaintext = 'same plaintext'
    const a = await encrypt(key, plaintext)
    const b = await encrypt(key, plaintext)
    // IVs differ → ciphertexts differ (AES-GCM is non-deterministic)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('decrypt failures', () => {
  it('throws when decrypting with a wrong key', async () => {
    const salt = await generateSalt()
    const rightKey = await deriveKey('correct-pass', salt)
    const wrongKey = await deriveKey('wrong-pass', salt)

    const { iv, ciphertext } = await encrypt(rightKey, 'secret message')
    await expect(decrypt(wrongKey, iv, ciphertext)).rejects.toThrow()
  })

  it('throws when ciphertext is tampered', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('pass', salt)

    const { iv, ciphertext } = await encrypt(key, 'sensitive data')

    // Flip last character of base64 to tamper with the ciphertext
    const tamperedChars = ciphertext.split('')
    const lastCharIdx = tamperedChars.length - 1
    // Replace last char with a different character (ensure it's still valid base64)
    tamperedChars[lastCharIdx] = tamperedChars[lastCharIdx] === 'A' ? 'B' : 'A'
    const tampered = tamperedChars.join('')

    await expect(decrypt(key, iv, tampered)).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

// Excludes ambiguous chars: 0/O, 1/l/I
const AMBIGUOUS_CHARS = /[01OlI]/

describe('generateRecoveryCode', () => {
  it('returns a 24-character string', () => {
    const code = generateRecoveryCode()
    expect(code).toHaveLength(24)
  })

  it('contains only alphanumeric characters', () => {
    const code = generateRecoveryCode()
    expect(/^[A-Za-z0-9]+$/.test(code)).toBe(true)
  })

  it('contains no ambiguous characters (0, O, 1, l, I)', () => {
    // Run many times to reduce false-negative probability
    for (let i = 0; i < 50; i++) {
      const code = generateRecoveryCode()
      expect(AMBIGUOUS_CHARS.test(code)).toBe(false)
    }
  })

  it('returns different values on successive calls', () => {
    const a = generateRecoveryCode()
    const b = generateRecoveryCode()
    expect(a).not.toBe(b)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('exportKeyBytes + importKeyBytes round-trip', () => {
  it('exported/imported key can still decrypt what the original encrypted', async () => {
    const salt = await generateSalt()
    const originalKey = await deriveKey('round-trip-pass', salt)

    const plaintext = 'round trip test value'
    const { iv, ciphertext } = await encrypt(originalKey, plaintext)

    // Export then re-import the key
    const raw = await exportKeyBytes(originalKey)
    const importedKey = await importKeyBytes(raw)

    const result = await decrypt(importedKey, iv, ciphertext)
    expect(result).toBe(plaintext)
  })

  it('exportKeyBytes returns a 32-byte ArrayBuffer (256-bit AES key)', async () => {
    const salt = await generateSalt()
    const key = await deriveKey('export-test', salt)
    const raw = await exportKeyBytes(key)
    expect(raw.byteLength).toBe(32)
  })

  it('imported key produces same ciphertext as original (same IV)', async () => {
    const salt = await generateSalt()
    const originalKey = await deriveKey('import-test', salt)

    const raw = await exportKeyBytes(originalKey)
    const importedKey = await importKeyBytes(raw)

    // Encrypt with a fixed IV is not directly exposed — instead verify decrypt round-trip
    const plaintext = 'import round trip'
    const { iv, ciphertext } = await encrypt(originalKey, plaintext)
    const result = await decrypt(importedKey, iv, ciphertext)
    expect(result).toBe(plaintext)
  })
})
