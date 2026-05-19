import {
  DEVICE_IDENTITY_STORE,
  openQuietDwellingDb,
  requestToPromise,
  txDone,
} from './quietDwellingDb'

interface DeviceFingerprintRecord {
  key: string
  userId: string
  browserHash: string
  installSalt: string
  deviceId: string
  deviceLabel: string
  generatedAt: number
}

export interface DeviceFingerprint {
  deviceId: string
  deviceLabel: string
  generatedAt: number
}

const memoryRecords = new Map<string, DeviceFingerprintRecord>()
const inFlight = new Map<string, Promise<DeviceFingerprint>>()

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined'
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function randomSalt(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
    return bytesToHex(bytes)
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

async function sha256(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(input)
    const digest = await crypto.subtle.digest('SHA-256', encoded)
    return bytesToHex(new Uint8Array(digest))
  }

  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function parseDeviceLabel(ua: string, hint?: string): string {
  let os = 'Device'
  if (/iPhone/i.test(ua)) os = 'iPhone'
  else if (/iPad/i.test(ua)) os = 'iPad'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/Mac/i.test(ua)) os = 'Mac'
  else if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Linux/i.test(ua)) os = 'Linux'

  let browser = 'Browser'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/Chrome/i.test(ua)) browser = 'Chrome'
  else if (/Firefox/i.test(ua)) browser = 'Firefox'
  else if (/Safari/i.test(ua)) browser = 'Safari'

  return hint ? `${hint} · ${browser}` : `${os} · ${browser}`
}

function browserInput(): string {
  if (typeof navigator === 'undefined') return 'server'
  const screenPart =
    typeof screen === 'undefined'
      ? 'no-screen'
      : `${screen.width}x${screen.height}x${screen.colorDepth}`
  return [navigator.userAgent, navigator.platform, screenPart].join('|')
}

function toFingerprint(record: DeviceFingerprintRecord): DeviceFingerprint {
  return {
    deviceId: record.deviceId,
    deviceLabel: record.deviceLabel,
    generatedAt: record.generatedAt,
  }
}

async function buildRecord(
  userId: string,
  browserHash: string,
  hint?: string,
): Promise<DeviceFingerprintRecord> {
  const installSalt = randomSalt()
  const generatedAt = Date.now()
  return {
    key: `${userId}:${browserHash}`,
    userId,
    browserHash,
    installSalt,
    deviceId: await sha256(`${userId}:${browserHash}:${installSalt}`),
    deviceLabel: parseDeviceLabel(
      typeof navigator === 'undefined' ? '' : navigator.userAgent,
      hint,
    ),
    generatedAt,
  }
}

async function readIndexedRecord(key: string): Promise<DeviceFingerprintRecord | null> {
  const db = await openQuietDwellingDb()
  const tx = db.transaction(DEVICE_IDENTITY_STORE, 'readonly')
  const record = await requestToPromise<DeviceFingerprintRecord | undefined>(
    tx.objectStore(DEVICE_IDENTITY_STORE).get(key),
  )
  db.close()
  return record ?? null
}

async function saveNewIndexedRecord(
  record: DeviceFingerprintRecord,
): Promise<DeviceFingerprintRecord> {
  const db = await openQuietDwellingDb()
  const tx = db.transaction(DEVICE_IDENTITY_STORE, 'readwrite')
  try {
    tx.objectStore(DEVICE_IDENTITY_STORE).add(record)
    await txDone(tx)
    return record
  } catch {
    db.close()
    const existing = await readIndexedRecord(record.key)
    if (existing) return existing
    throw new Error('Unable to persist device fingerprint.')
  } finally {
    db.close()
  }
}

async function updateIndexedRecord(
  record: DeviceFingerprintRecord,
): Promise<DeviceFingerprintRecord> {
  const db = await openQuietDwellingDb()
  const tx = db.transaction(DEVICE_IDENTITY_STORE, 'readwrite')
  tx.objectStore(DEVICE_IDENTITY_STORE).put(record)
  await txDone(tx)
  db.close()
  return record
}

async function getOrCreateRecord(
  userId: string,
  key: string,
  browserHash: string,
  hint?: string,
): Promise<DeviceFingerprintRecord> {
  if (!hasIndexedDB()) {
    const existing = memoryRecords.get(key)
    if (existing) return existing
    const record = await buildRecord(userId, browserHash, hint)
    memoryRecords.set(key, record)
    return record
  }

  const existing = await readIndexedRecord(key)
  if (existing) return existing

  return saveNewIndexedRecord(await buildRecord(userId, browserHash, hint))
}

export async function getDeviceFingerprint(userId: string): Promise<DeviceFingerprint> {
  const browserHash = await sha256(browserInput())
  const key = `${userId}:${browserHash}`
  const existing = inFlight.get(key)
  if (existing) return existing

  const promise = getOrCreateRecord(userId, key, browserHash).then(toFingerprint)
  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

export async function refreshDeviceLabel(
  userId: string,
  hint?: string,
): Promise<DeviceFingerprint> {
  const browserHash = await sha256(browserInput())
  const key = `${userId}:${browserHash}`
  const current = await getOrCreateRecord(userId, key, browserHash, hint)
  const next = {
    ...current,
    deviceLabel: parseDeviceLabel(
      typeof navigator === 'undefined' ? '' : navigator.userAgent,
      hint,
    ),
  }

  if (!hasIndexedDB()) {
    memoryRecords.set(key, next)
    return toFingerprint(next)
  }

  return toFingerprint(await updateIndexedRecord(next))
}
