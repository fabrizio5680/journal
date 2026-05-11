function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function fromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

const PBKDF2_ITERATIONS = import.meta.env.VITE_USE_EMULATOR === 'true' ? 10_000 : 310_000

export async function generateSalt(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return toBase64(bytes.buffer)
}

export async function deriveKey(passphrase: string, saltBase64: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(saltBase64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  )
  return { iv: toBase64(iv.buffer), ciphertext: toBase64(ciphertextBuffer) }
}

export async function decrypt(
  key: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivBase64) },
    key,
    fromBase64(ciphertextBase64),
  )
  return new TextDecoder().decode(decrypted)
}

// Excludes ambiguous chars: 0/O, 1/l/I
const RECOVERY_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes)
    .map((b) => RECOVERY_CHARSET[b % RECOVERY_CHARSET.length])
    .join('')
}

export async function exportKeyBytes(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key)
}

export async function importKeyBytes(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
}
