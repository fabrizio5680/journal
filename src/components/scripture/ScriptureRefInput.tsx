import { useRef, useState, type KeyboardEvent } from 'react'

import { parseScriptureRef, ScriptureParseError } from '@/lib/scriptureParser'
import type { ScriptureRef } from '@/types'

const BIBLE_IDS: Record<string, string> = {
  NLT: 'd6e14a625393b4da-01',
  MSG: '6f11a7de016f942e-01',
  AMP: 'a81b73293d3080c9-01',
  ESV: 'de4e12af7f28f599-01',
}

function isRange(passageId: string): boolean {
  return passageId.includes('-')
}

interface ScriptureRefInputProps {
  translation: 'NLT' | 'MSG' | 'ESV'
  onAdd: (ref: ScriptureRef) => void
}

export default function ScriptureRefInput({ translation, onAdd }: ScriptureRefInputProps) {
  const [value, setValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed) return

    setError(null)

    let parsed: ReturnType<typeof parseScriptureRef>
    try {
      parsed = parseScriptureRef(trimmed)
    } catch (e) {
      if (e instanceof ScriptureParseError) {
        setError(e.message)
      } else {
        setError('Invalid reference format.')
      }
      return
    }

    const apiKey = (import.meta.env.VITE_BIBLE_API_KEY as string | undefined)?.trim()
    if (!apiKey) {
      setError('Bible API key not configured.')
      return
    }

    setIsLoading(true)

    const bibleId = BIBLE_IDS[translation] ?? BIBLE_IDS.NLT
    const endpoint = isRange(parsed.passageId) ? 'passages' : 'verses'
    const url =
      `https://rest.api.bible/v1/bibles/${bibleId}/${endpoint}/${encodeURIComponent(parsed.passageId)}` +
      '?content-type=text&include-verse-numbers=false'

    try {
      const res = await fetch(url, { headers: { 'api-key': apiKey } })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = (await res.json()) as { data: { reference: string } }
      const canonicalRef = data.data.reference
      onAdd({ reference: canonicalRef, passageId: parsed.passageId })
      setValue('')
      inputRef.current?.focus()
    } catch {
      setError('Could not validate reference. Check spelling and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
    if (e.key === 'Escape') {
      setValue('')
      setError(null)
    }
  }

  return (
    <div className="py-2">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-on-surface-variant/40 text-[18px]">
          menu_book
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder="e.g. John 3:16 or Psalm 23:1-4"
          disabled={isLoading}
          className="text-on-surface placeholder:text-outline-variant/40 min-w-[180px] flex-1 bg-transparent text-xs outline-none disabled:opacity-50"
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        {isLoading && (
          <span className="material-symbols-outlined text-on-surface-variant/40 animate-spin text-[16px]">
            progress_activity
          </span>
        )}
      </div>
      {error && <p className="text-error mt-1 text-[11px]">{error}</p>}
    </div>
  )
}
