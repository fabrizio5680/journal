import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

import { auth, db } from '@/lib/firebase'
import {
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  generateRecoveryCode,
  exportKeyBytes,
  importKeyBytes,
} from '@/lib/crypto'
import {
  setSessionKey,
  getSessionKey,
  clearSessionKey,
  isSessionUnlocked,
} from '@/lib/encryptionSession'
import { EncryptionLockedError } from '@/lib/encryptionErrors'

export { EncryptionLockedError }

const CANARY_PLAINTEXT = 'QUIET_DWELLING_CANARY'
const CANARY_SEPARATOR = '|'

interface EncryptedFields {
  content: object
  contentText: string
  contentEncrypted: true
}

interface PlainFields {
  content: object
  contentText: string
  contentEncrypted: false
}

interface EncryptionContextValue {
  isEnabled: boolean
  isUnlocked: boolean
  isLoading: boolean
  unlock(passphrase: string): Promise<boolean>
  unlockWithRecovery(code: string): Promise<boolean>
  lock(): void
  enable(passphrase: string): Promise<{ recoveryCode: string }>
  disable(passphrase: string): Promise<void>
  encryptFields(content: object, contentText: string): Promise<EncryptedFields | PlainFields>
  decryptFields(doc: {
    content: object
    contentText: string
    contentEncrypted?: boolean
  }): Promise<{ content: object; contentText: string }>
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null)

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function fromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null | undefined>(undefined)
  const [isEnabled, setIsEnabled] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const saltRef = useRef<string | null>(null)
  const keyRef = useRef<CryptoKey | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null)
      if (!user) {
        setIsEnabled(false)
        setIsUnlocked(false)
        setIsLoading(false)
        saltRef.current = null
        keyRef.current = null
        clearSessionKey()
      }
    })
  }, [])

  useEffect(() => {
    if (uid === undefined) return
    if (uid === null) {
      setIsLoading(false)
      return
    }

    const userRef = doc(db, 'users', uid)
    const unsub = onSnapshot(
      userRef,
      async (snap) => {
        const data = snap.data()
        const enabled = data?.encryptionEnabled === true
        const salt: string | undefined = data?.encryptionSalt

        setIsEnabled(enabled)
        saltRef.current = salt ?? null

        if (enabled && salt && isSessionUnlocked()) {
          const cached = await getSessionKey()
          if (cached) {
            keyRef.current = cached
            setIsUnlocked(true)
          } else {
            setIsUnlocked(false)
          }
        } else if (!enabled) {
          setIsUnlocked(false)
        }

        setIsLoading(false)
      },
      () => {
        setIsLoading(false)
      },
    )

    return unsub
  }, [uid])

  const unlock = useCallback(
    async (passphrase: string): Promise<boolean> => {
      if (!uid || !saltRef.current) return false
      try {
        const userSnap = await import('firebase/firestore').then(({ getDoc }) =>
          getDoc(doc(db, 'users', uid)),
        )
        const canaryEncoded: string | undefined = userSnap.data()?.encryptionCanary
        if (!canaryEncoded) return false

        const [iv, ciphertext] = canaryEncoded.split(CANARY_SEPARATOR)
        if (!iv || !ciphertext) return false

        const key = await deriveKey(passphrase, saltRef.current)
        const result = await decrypt(key, iv, ciphertext)
        if (result !== CANARY_PLAINTEXT) return false

        keyRef.current = key
        await setSessionKey(key)
        setIsUnlocked(true)
        return true
      } catch {
        return false
      }
    },
    [uid],
  )

  const unlockWithRecovery = useCallback(
    async (code: string): Promise<boolean> => {
      if (!uid || !saltRef.current) return false
      try {
        const userSnap = await import('firebase/firestore').then(({ getDoc }) =>
          getDoc(doc(db, 'users', uid)),
        )
        const recoveryData: string | undefined = userSnap.data()?.encryptionRecoveryData
        if (!recoveryData) return false

        const [iv, ciphertext] = recoveryData.split(CANARY_SEPARATOR)
        if (!iv || !ciphertext) return false

        const recoveryKey = await deriveKey(code, saltRef.current)
        const rawBase64 = await decrypt(recoveryKey, iv, ciphertext)
        const primaryKey = await importKeyBytes(fromBase64(rawBase64))

        keyRef.current = primaryKey
        await setSessionKey(primaryKey)
        setIsUnlocked(true)
        return true
      } catch {
        return false
      }
    },
    [uid],
  )

  const lock = useCallback(() => {
    keyRef.current = null
    clearSessionKey()
    setIsUnlocked(false)
  }, [])

  const enable = useCallback(
    async (passphrase: string): Promise<{ recoveryCode: string }> => {
      if (!uid) throw new Error('Not authenticated')

      const salt = await generateSalt()
      const primaryKey = await deriveKey(passphrase, salt)

      const { iv: canaryIv, ciphertext: ciphertext } = await encrypt(primaryKey, CANARY_PLAINTEXT)
      const canaryEncoded = `${canaryIv}${CANARY_SEPARATOR}${ciphertext}`

      const recoveryCode = generateRecoveryCode()
      const recoveryKey = await deriveKey(recoveryCode, salt)
      const primaryKeyBytes = await exportKeyBytes(primaryKey)
      const primaryKeyBase64 = toBase64(primaryKeyBytes)
      const { iv: recovIv, ciphertext: recovCipher } = await encrypt(recoveryKey, primaryKeyBase64)
      const recoveryEncoded = `${recovIv}${CANARY_SEPARATOR}${recovCipher}`

      await updateDoc(doc(db, 'users', uid), {
        encryptionEnabled: true,
        encryptionSalt: salt,
        encryptionCanary: canaryEncoded,
        encryptionRecoveryData: recoveryEncoded,
      })

      keyRef.current = primaryKey
      saltRef.current = salt
      await setSessionKey(primaryKey)
      setIsEnabled(true)
      setIsUnlocked(true)

      return { recoveryCode }
    },
    [uid],
  )

  const disable = useCallback(
    async (passphrase: string): Promise<void> => {
      if (!uid || !saltRef.current) throw new Error('Not authenticated or salt missing')

      const key = await deriveKey(passphrase, saltRef.current)

      const userSnap = await import('firebase/firestore').then(({ getDoc }) =>
        getDoc(doc(db, 'users', uid)),
      )
      const canaryEncoded: string | undefined = userSnap.data()?.encryptionCanary
      if (!canaryEncoded) throw new Error('Canary not found')

      const [iv, ciphertext] = canaryEncoded.split(CANARY_SEPARATOR)
      const result = await decrypt(key, iv, ciphertext)
      if (result !== CANARY_PLAINTEXT) throw new Error('Wrong passphrase')

      await updateDoc(doc(db, 'users', uid), {
        encryptionEnabled: false,
        encryptionSalt: null,
        encryptionCanary: null,
        encryptionRecoveryData: null,
      })

      keyRef.current = null
      saltRef.current = null
      clearSessionKey()
      setIsEnabled(false)
      setIsUnlocked(false)
    },
    [uid],
  )

  const encryptFields = useCallback(
    async (content: object, contentText: string): Promise<EncryptedFields | PlainFields> => {
      if (!isEnabled || !keyRef.current) {
        return { content, contentText, contentEncrypted: false }
      }
      const key = keyRef.current
      const { iv: contentIv, ciphertext: contentCipher } = await encrypt(
        key,
        JSON.stringify(content),
      )
      const { iv: textIv, ciphertext: textCipher } = await encrypt(key, contentText)
      return {
        content: { iv: contentIv, ciphertext: contentCipher } as unknown as object,
        contentText: `${textIv}${CANARY_SEPARATOR}${textCipher}`,
        contentEncrypted: true,
      }
    },
    [isEnabled],
  )

  const decryptFields = useCallback(
    async (entry: {
      content: object
      contentText: string
      contentEncrypted?: boolean
    }): Promise<{ content: object; contentText: string }> => {
      if (!entry.contentEncrypted) {
        return { content: entry.content, contentText: entry.contentText }
      }
      if (!keyRef.current) {
        throw new EncryptionLockedError()
      }
      const key = keyRef.current
      const encContent = entry.content as { iv: string; ciphertext: string }
      const decryptedContentJson = await decrypt(key, encContent.iv, encContent.ciphertext)
      const content = JSON.parse(decryptedContentJson) as object

      const [textIv, textCipher] = entry.contentText.split(CANARY_SEPARATOR)
      const contentText = await decrypt(key, textIv, textCipher)

      return { content, contentText }
    },
    [],
  )

  return (
    <EncryptionContext.Provider
      value={{
        isEnabled,
        isUnlocked,
        isLoading,
        unlock,
        unlockWithRecovery,
        lock,
        enable,
        disable,
        encryptFields,
        decryptFields,
      }}
    >
      {children}
    </EncryptionContext.Provider>
  )
}

// Context files legitimately export both a provider component and a consumer hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useEncryption() {
  const ctx = useContext(EncryptionContext)
  if (!ctx) throw new Error('useEncryption must be used within EncryptionProvider')
  return ctx
}
