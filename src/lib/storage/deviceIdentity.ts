const STORAGE_KEY = 'device_identity'

interface DeviceIdentityRecord {
  id: string
  label: string
  createdAt: string
}

function parseDeviceLabel(ua: string): string {
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

  return `${os} ${browser}`
}

function readRecord(): DeviceIdentityRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DeviceIdentityRecord) : null
  } catch {
    return null
  }
}

function writeRecord(record: DeviceIdentityRecord) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // localStorage unavailable — silently ignore
  }
}

let cached: DeviceIdentityRecord | null = null

export function getDeviceIdentity(): { id: string; label: string } {
  if (cached) return { id: cached.id, label: cached.label }

  const stored = readRecord()
  if (stored?.id && stored?.label) {
    cached = stored
    return { id: stored.id, label: stored.label }
  }

  const id = crypto.randomUUID()
  const label =
    typeof navigator !== 'undefined' ? parseDeviceLabel(navigator.userAgent) : 'Unknown Device'
  const record: DeviceIdentityRecord = {
    id,
    label,
    createdAt: new Date().toISOString(),
  }

  writeRecord(record)
  cached = record
  return { id, label }
}
