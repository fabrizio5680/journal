import { liteClient } from 'algoliasearch/lite'
import { getFunctions, httpsCallable } from 'firebase/functions'

import app from './firebase'

let securedKey: string | null = null
let keyExpiry = 0
let cachedClient: ReturnType<typeof liteClient> | null = null

export async function getAlgoliaClient() {
  // In emulator/test mode, use a mock client injected by Playwright tests
  if (import.meta.env.VITE_USE_EMULATOR === 'true') {
    const mockClient = (
      window as typeof window & { __mockAlgoliaClient?: ReturnType<typeof liteClient> }
    ).__mockAlgoliaClient
    if (mockClient) return mockClient
  }

  const now = Math.floor(Date.now() / 1000)
  if (!securedKey || now >= keyExpiry - 60) {
    const fn = httpsCallable(getFunctions(app), 'getSearchKey')
    const result = await fn()
    securedKey = (result.data as { key: string }).key
    keyExpiry = now + 3600
    cachedClient = liteClient(import.meta.env.VITE_ALGOLIA_APP_ID, securedKey)
  }
  return cachedClient!
}
