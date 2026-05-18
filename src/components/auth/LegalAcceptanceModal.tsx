import { useState } from 'react'
import { Link } from 'react-router-dom'

import { POLICY_VERSION, TOS_VERSION, useLegalAcceptance } from '@/hooks/useLegalAcceptance'

export default function LegalAcceptanceModal() {
  const { requiresLegalAcceptance, acceptLegalTerms, declineForAge } = useLegalAcceptance()
  const [ageChecked, setAgeChecked] = useState(false)
  const [policyChecked, setPolicyChecked] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!requiresLegalAcceptance) return null

  const canContinue = ageChecked && policyChecked && termsChecked && !isSaving

  async function handleAccept() {
    if (!canContinue) return
    setIsSaving(true)
    setError(null)
    try {
      await acceptLegalTerms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your acceptance.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUnderAge() {
    setIsSaving(true)
    setError(null)
    try {
      await declineForAge()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close this account.')
      setIsSaving(false)
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 px-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-acceptance-title"
        className="bg-surface text-on-surface w-full max-w-lg rounded-3xl p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start gap-3">
          <span className="material-symbols-outlined text-primary text-[24px]">gavel</span>
          <div>
            <h2 id="legal-acceptance-title" className="font-display text-2xl font-semibold">
              Before you continue
            </h2>
            <p className="text-on-surface-variant mt-2 text-sm leading-relaxed">
              Quiet Dwelling is for people aged 16 or older. Please confirm your age and accept the
              current Privacy Policy and Terms of Service.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="bg-surface-container-low flex items-start gap-3 rounded-2xl p-4">
            <input
              type="checkbox"
              checked={ageChecked}
              onChange={(event) => setAgeChecked(event.target.checked)}
              className="mt-1 h-4 w-4 accent-current"
            />
            <span className="text-sm font-semibold">I am 16 years old or older.</span>
          </label>

          <label className="bg-surface-container-low flex items-start gap-3 rounded-2xl p-4">
            <input
              type="checkbox"
              checked={policyChecked}
              onChange={(event) => setPolicyChecked(event.target.checked)}
              className="mt-1 h-4 w-4 accent-current"
            />
            <span className="text-sm leading-relaxed">
              I accept the{' '}
              <Link to="/privacy" className="text-primary font-semibold hover:underline">
                Privacy Policy
              </Link>{' '}
              version {POLICY_VERSION}.
            </span>
          </label>

          <label className="bg-surface-container-low flex items-start gap-3 rounded-2xl p-4">
            <input
              type="checkbox"
              checked={termsChecked}
              onChange={(event) => setTermsChecked(event.target.checked)}
              className="mt-1 h-4 w-4 accent-current"
            />
            <span className="text-sm leading-relaxed">
              I accept the{' '}
              <Link to="/terms" className="text-primary font-semibold hover:underline">
                Terms of Service
              </Link>{' '}
              version {TOS_VERSION}.
            </span>
          </label>
        </div>

        {error && <p className="text-error mt-3 text-xs">{error}</p>}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => void handleUnderAge()}
            disabled={isSaving}
            className="text-on-surface-variant hover:text-on-surface rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            I am under 16
          </button>
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={!canContinue}
            className="bg-primary text-on-primary rounded-full px-5 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </section>
    </div>
  )
}
