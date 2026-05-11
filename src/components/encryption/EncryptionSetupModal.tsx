import { useState } from 'react'
import ReactDOM from 'react-dom'

import { useEncryption } from '@/context/EncryptionContext'

interface Props {
  onClose: () => void
}

type Step = 'passphrase' | 'recovery' | 'enabling'

function passphraseStrength(p: string): 'weak' | 'fair' | 'strong' {
  if (p.length >= 16) return 'strong'
  if (p.length >= 10) return 'fair'
  return 'weak'
}

export function EncryptionSetupModal({ onClose }: Props) {
  const { enable } = useEncryption()
  const [step, setStep] = useState<Step>('passphrase')
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strength = passphraseStrength(passphrase)

  async function handleSetPassphrase() {
    if (passphrase !== confirm) {
      setMismatch(true)
      return
    }
    setMismatch(false)
    setStep('enabling')
    try {
      const { recoveryCode: code } = await enable(passphrase)
      setRecoveryCode(code)
      setStep('recovery')
    } catch {
      setError('Failed to enable encryption. Please try again.')
      setStep('passphrase')
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(recoveryCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="encryption-setup-title"
      data-testid="encryption-setup-modal"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== 'enabling') onClose()
      }}
    >
      <div className="bg-surface-container-lowest flex w-full max-w-lg flex-col rounded-t-[2rem] shadow-2xl md:rounded-2xl">
        <div className="bg-outline-variant/30 mx-auto mt-3 mb-1 h-1 w-10 rounded-full md:hidden" />

        {/* Header */}
        <div className="border-outline-variant/15 flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">lock</span>
            <h2
              id="encryption-setup-title"
              className="text-on-surface font-display text-lg font-semibold"
            >
              {step === 'passphrase' || step === 'enabling'
                ? 'Enable Encryption'
                : 'Save Your Recovery Code'}
            </h2>
          </div>
          {step !== 'enabling' && (
            <button
              aria-label="Close"
              onClick={onClose}
              className="text-on-surface-variant hover:bg-surface-container flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Step: passphrase */}
        {(step === 'passphrase' || step === 'enabling') && (
          <div className="flex flex-col gap-4 px-6 py-5">
            <p className="text-on-surface-variant text-sm">
              Create a passphrase to encrypt your journal entries. If you forget it, you will need
              your recovery code — entries cannot be recovered otherwise.
            </p>

            {error && <p className="text-error text-sm">{error}</p>}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="enc-passphrase"
                className="text-on-surface-variant text-xs font-medium"
              >
                Passphrase
              </label>
              <input
                id="enc-passphrase"
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={step === 'enabling'}
                className="bg-surface-container text-on-surface rounded-xl px-4 py-2.5 text-sm focus:outline-none disabled:opacity-50"
                placeholder="Enter a strong passphrase…"
              />
              {passphrase.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {(['weak', 'fair', 'strong'] as const).map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          strength === 'strong'
                            ? 'bg-primary'
                            : strength === 'fair' && level !== 'strong'
                              ? 'bg-tertiary'
                              : level === 'weak'
                                ? 'bg-error'
                                : 'bg-surface-container-high'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-on-surface-variant text-xs capitalize">{strength}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="enc-confirm" className="text-on-surface-variant text-xs font-medium">
                Confirm Passphrase
              </label>
              <input
                id="enc-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value)
                  setMismatch(false)
                }}
                disabled={step === 'enabling'}
                className="bg-surface-container text-on-surface rounded-xl px-4 py-2.5 text-sm focus:outline-none disabled:opacity-50"
                placeholder="Confirm your passphrase…"
              />
              {mismatch && <p className="text-error text-xs">Passphrases do not match.</p>}
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={onClose}
                disabled={step === 'enabling'}
                className="text-on-surface-variant hover:text-on-surface rounded-xl px-4 py-2 text-sm transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSetPassphrase()}
                disabled={step === 'enabling' || passphrase.length < 6 || confirm.length === 0}
                className="bg-primary text-on-primary hover:bg-primary-dim rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {step === 'enabling' ? 'Enabling…' : 'Enable Encryption'}
              </button>
            </div>
          </div>
        )}

        {/* Step: recovery code */}
        {step === 'recovery' && (
          <div className="flex flex-col gap-4 px-6 py-5">
            <p className="text-on-surface-variant text-sm">
              Store this recovery code somewhere safe. It is shown{' '}
              <strong className="text-on-surface">once only</strong> — if you lose your passphrase
              and this code, your encrypted entries cannot be recovered.
            </p>

            <div className="bg-surface-container rounded-xl p-4">
              <p
                data-testid="recovery-code"
                className="text-on-surface font-mono text-sm tracking-widest break-all select-all"
              >
                {recoveryCode}
              </p>
            </div>

            <button
              onClick={() => void handleCopy()}
              className="text-primary hover:text-primary-dim flex items-center gap-1.5 text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="accent-primary mt-0.5 h-4 w-4"
              />
              <span className="text-on-surface-variant text-sm">
                I have saved my recovery code in a secure location.
              </span>
            </label>

            <div className="flex justify-end pt-1">
              <button
                onClick={onClose}
                disabled={!acknowledged}
                className="bg-primary text-on-primary hover:bg-primary-dim rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return ReactDOM.createPortal(modal, document.body)
}
