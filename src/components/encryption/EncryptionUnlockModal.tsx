import { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'

import { useEncryption } from '@/context/EncryptionContext'

interface Props {
  onClose?: () => void
}

export function EncryptionUnlockModal({ onClose }: Props) {
  const { unlock, unlockWithRecovery } = useEncryption()
  const [passphrase, setPassphrase] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [mode])

  async function handleUnlock() {
    setError(null)
    setIsSubmitting(true)
    try {
      const success =
        mode === 'passphrase' ? await unlock(passphrase) : await unlockWithRecovery(recoveryCode)
      if (!success) {
        setError(mode === 'passphrase' ? 'Incorrect passphrase.' : 'Invalid recovery code.')
      } else {
        onClose?.()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm md:items-center">
      <div className="bg-surface-container-lowest flex w-full max-w-lg flex-col rounded-t-[2rem] shadow-2xl md:rounded-2xl">
        <div className="bg-outline-variant/30 mx-auto mt-3 mb-1 h-1 w-10 rounded-full md:hidden" />

        {/* Header */}
        <div className="border-outline-variant/15 flex items-center gap-3 border-b px-6 py-4">
          <span className="material-symbols-outlined text-primary text-[20px]">lock</span>
          <h2 className="text-on-surface font-display text-lg font-semibold">Unlock Journal</h2>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <p className="text-on-surface-variant text-sm">
            Your entries are encrypted. Enter your passphrase to unlock this session.
          </p>

          {error && <p className="text-error text-sm">{error}</p>}

          {mode === 'passphrase' ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="unlock-passphrase"
                className="text-on-surface-variant text-xs font-medium"
              >
                Passphrase
              </label>
              <input
                ref={inputRef}
                id="unlock-passphrase"
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && passphrase.length > 0) void handleUnlock()
                }}
                disabled={isSubmitting}
                className="bg-surface-container text-on-surface rounded-xl px-4 py-2.5 text-sm focus:outline-none disabled:opacity-50"
                placeholder="Enter your passphrase…"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="unlock-recovery"
                className="text-on-surface-variant text-xs font-medium"
              >
                Recovery Code
              </label>
              <input
                ref={inputRef}
                id="unlock-recovery"
                type="text"
                autoComplete="off"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && recoveryCode.length > 0) void handleUnlock()
                }}
                disabled={isSubmitting}
                className="bg-surface-container text-on-surface rounded-xl px-4 py-2.5 font-mono text-sm tracking-wide focus:outline-none disabled:opacity-50"
                placeholder="Enter your 24-character recovery code…"
              />
            </div>
          )}

          <button
            onClick={() => {
              setMode((m) => (m === 'passphrase' ? 'recovery' : 'passphrase'))
              setError(null)
            }}
            className="text-primary hover:text-primary-dim self-start text-sm font-medium transition-colors"
          >
            {mode === 'passphrase' ? 'Use recovery code instead' : 'Use passphrase instead'}
          </button>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => void handleUnlock()}
              disabled={
                isSubmitting ||
                (mode === 'passphrase' ? passphrase.length === 0 : recoveryCode.length === 0)
              }
              className="bg-primary text-on-primary hover:bg-primary-dim rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Unlocking…' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return ReactDOM.createPortal(modal, document.body)
}
