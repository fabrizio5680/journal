import { onCall, HttpsError } from 'firebase-functions/v2/https'
import Algolia from 'algoliasearch'

const algoliaClient = Algolia(process.env.ALGOLIA_APP_ID!, process.env.ALGOLIA_ADMIN_KEY!)

export const getSearchKey = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Login required')

  const nowPlusOneHour = Math.floor(Date.now() / 1000) + 3600

  const key = algoliaClient.generateSecuredApiKey(process.env.ALGOLIA_SEARCH_ONLY_KEY!, {
    filters: `userId:${uid} AND deleted:false`,
    validUntil: nowPlusOneHour,
    userToken: uid,
  })
  return { key }
})
