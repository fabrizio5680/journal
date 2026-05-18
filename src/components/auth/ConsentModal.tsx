import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useConsent } from '@/hooks/useConsent'

export default function ConsentModal() {
  const { requiresConsent, saveConsent } = useConsent()
  const [religion, setReligion] = useState(true)
  const [mood, setMood] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!requiresConsent) return null

  async function handleSave(nextReligion = religion, nextMood = mood) {
    setIsSaving(true)
    setError(null)
    try {
      await saveConsent({ religion: nextReligion, mood: nextMood })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your consent choice.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="bg-surface text-on-surface w-full max-w-md rounded-3xl p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start gap-3">
          <span className="material-symbols-outlined text-primary text-[24px]">privacy_tip</span>
          <div>
            <h2 id="consent-title" className="font-display text-2xl font-semibold">
              Sensitive journal details
            </h2>
            <p className="text-on-surface-variant mt-2 text-sm leading-relaxed">
              Mood and scripture details can reveal health, emotional state, or religious beliefs.
              Quiet Dwelling needs your explicit consent before saving those optional fields on this
              device and syncing them to your Google Drive if Drive sync is enabled.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="bg-surface-container-low flex items-start gap-3 rounded-2xl p-4">
            <input
              type="checkbox"
              checked={mood}
              onChange={(event) => setMood(event.target.checked)}
              className="mt-1 h-4 w-4 accent-current"
            />
            <span>
              <span className="block text-sm font-semibold">Mood and emotional-state fields</span>
              <span className="text-on-surface-variant/70 mt-1 block text-xs leading-relaxed">
                Lets you save mood labels, mood scores, and mood conflict metadata in your journal
                data.
              </span>
            </span>
          </label>

          <label className="bg-surface-container-low flex items-start gap-3 rounded-2xl p-4">
            <input
              type="checkbox"
              checked={religion}
              onChange={(event) => setReligion(event.target.checked)}
              className="mt-1 h-4 w-4 accent-current"
            />
            <span>
              <span className="block text-sm font-semibold">Scripture references</span>
              <span className="text-on-surface-variant/70 mt-1 block text-xs leading-relaxed">
                Lets you attach Bible references to entries and sync them with your journal data if
                Drive sync is enabled.
              </span>
            </span>
          </label>
        </div>

        <p className="text-on-surface-variant/60 mt-4 text-xs leading-relaxed">
          You can withdraw consent in Settings. Withdrawal blocks new mood and scripture writes but
          does not delete existing entry data. See the{' '}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>

        {error && <p className="text-error mt-3 text-xs">{error}</p>}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => void handleSave(false, false)}
            disabled={isSaving}
            className="text-on-surface-variant hover:text-on-surface rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Continue without
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="bg-primary text-on-primary rounded-full px-5 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save choices'}
          </button>
        </div>
      </section>
    </div>
  )
}
