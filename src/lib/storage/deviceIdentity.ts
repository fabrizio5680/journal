import { getDeviceFingerprint } from './deviceFingerprint'

interface DeviceIdentityRecord {
  id: string
  label: string
}

let cached: DeviceIdentityRecord | null = null

export function getDeviceIdentity(): { id: string; label: string } {
  if (!cached) {
    cached = { id: 'unknown-device', label: 'Unknown Device' }
  }
  return cached
}

export async function getDeviceIdentityForUser(
  userId: string,
): Promise<{ id: string; label: string }> {
  const fingerprint = await getDeviceFingerprint(userId)
  cached = { id: fingerprint.deviceId, label: fingerprint.deviceLabel }
  return cached
}
