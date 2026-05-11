import { exportKeyBytes, importKeyBytes } from './crypto'

const SESSION_KEY = 'eq_key'

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function fromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export async function setSessionKey(key: CryptoKey): Promise<void> {
  const raw = await exportKeyBytes(key)
  sessionStorage.setItem(SESSION_KEY, toBase64(raw))
}

export async function getSessionKey(): Promise<CryptoKey | null> {
  const stored = sessionStorage.getItem(SESSION_KEY)
  if (!stored) return null
  try {
    return await importKeyBytes(fromBase64(stored))
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function clearSessionKey(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

export function isSessionUnlocked(): boolean {
  return sessionStorage.getItem(SESSION_KEY) !== null
}
