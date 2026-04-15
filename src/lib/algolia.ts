import { liteClient } from 'algoliasearch/lite'
import { getFunctions, httpsCallable } from 'firebase/functions'

import app from './firebase'

const FUNCTIONS_REGION = 'europe-west2'
const DEFAULT_INDEX_NAME = 'journal_entries'

let securedKey: string | null = null
let keyExpiry = 0
let cachedClient: ReturnType<typeof liteClient> | null = null
let cachedIndexName = DEFAULT_INDEX_NAME

export interface AlgoliaSearchConfig {
  client: ReturnType<typeof liteClient>
  indexName: string
}

export async function getAlgoliaClient(): Promise<AlgoliaSearchConfig> {
  // In emulator/test mode, use a mock client injected by Playwright tests
  if (import.meta.env.VITE_USE_EMULATOR === 'true') {
    const mockClient = (
      window as typeof window & { __mockAlgoliaClient?: ReturnType<typeof liteClient> }
    ).__mockAlgoliaClient
    if (mockClient) return { client: mockClient, indexName: DEFAULT_INDEX_NAME }
  }

  const now = Math.floor(Date.now() / 1000)
  if (!securedKey || now >= keyExpiry - 60) {
    const fn = httpsCallable(getFunctions(app, FUNCTIONS_REGION), 'getSearchKey')
    const result = await fn()
    const data = result.data as { key: string; appId?: string; indexName?: string }
    securedKey = data.key
    keyExpiry = now + 3600
    cachedIndexName = data.indexName || DEFAULT_INDEX_NAME
    cachedClient = liteClient(data.appId || import.meta.env.VITE_ALGOLIA_APP_ID, securedKey)
  }
  return { client: cachedClient!, indexName: cachedIndexName }
}
