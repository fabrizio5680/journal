import { signOut } from 'firebase/auth'

import { auth } from '@/lib/firebase'
import { localEntryCache } from '@/lib/storage/localEntryCache'

const ACCOUNT_DOC_SEEN_PREFIX = 'quiet_dwelling_account_doc_seen_'

export function accountDocSeenKey(userId: string): string {
  return `${ACCOUNT_DOC_SEEN_PREFIX}${userId}`
}

export function hasSeenAccountDocument(userId: string): boolean {
  return localStorage.getItem(accountDocSeenKey(userId)) === 'true'
}

export function markAccountDocumentSeen(userId: string): void {
  localStorage.setItem(accountDocSeenKey(userId), 'true')
}

export function clearLocalStorageForUser(userId: string): void {
  const exactKeys = [
    `fcm_device_token_${userId}`,
    `google_drive_connection_${userId}`,
    `google_drive_disconnected_${userId}`,
    `drive_token_refresh_lock_${userId}`,
    accountDocSeenKey(userId),
  ]
  exactKeys.forEach((key) => localStorage.removeItem(key))
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i)
    if (key?.includes(userId)) localStorage.removeItem(key)
  }
}

export async function clearDeviceDataForUser(userId: string): Promise<void> {
  await localEntryCache.clearUserData(userId)
  clearLocalStorageForUser(userId)
}

export async function signOutDeletedAccount(userId: string): Promise<void> {
  await clearDeviceDataForUser(userId)
  await signOut(auth).catch(() => undefined)
}
