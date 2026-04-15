import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

let dbInstance

if (import.meta.env.VITE_USE_EMULATOR !== 'true') {
  try {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({}),
      }),
    })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'failed-precondition') {
      console.warn('Firestore persistence unavailable: multiple tabs open')
    } else if (code === 'unimplemented') {
      console.warn('Firestore persistence not supported in this browser')
    }
    dbInstance = getFirestore(app)
  }
} else {
  dbInstance = getFirestore(app)
}

export const db = dbInstance

// FCM messaging — only available outside the emulator and in supported browsers
export const messagingPromise: Promise<ReturnType<typeof getMessaging> | null> =
  import.meta.env.VITE_USE_EMULATOR === 'true'
    ? Promise.resolve(null)
    : isSupported().then((ok) => (ok ? getMessaging(app) : null))

if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  const { connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth')
  const { connectFirestoreEmulator } = await import('firebase/firestore')
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  } catch (e) {
    console.warn('[firebase] auth emulator connect failed:', e)
  }
  try {
    connectFirestoreEmulator(db, 'localhost', 8080)
  } catch (e) {
    console.warn('[firebase] firestore emulator connect failed:', e)
  }
  // Expose a test sign-in helper so Playwright E2E tests can authenticate
  ;(
    window as typeof window & {
      __signInForTest: (email: string, password: string) => Promise<void>
    }
  ).__signInForTest = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }
} else {
  // Persistence is configured via Firestore initialization settings above.
}

export default app
