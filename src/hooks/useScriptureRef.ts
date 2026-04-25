import { useEffect, useState } from 'react'

const BIBLE_IDS: Record<string, string> = {
  NLT: 'd6e14a625393b4da-01',
  MSG: '6f11a7de016f942e-01',
  AMP: 'a81b73293d3080c9-01',
  ESV: 'de4e12af7f28f599-01',
}

function isRange(passageId: string): boolean {
  return passageId.includes('-')
}

function getCacheKey(passageId: string, translation: string): string {
  return `scripture_ref_${translation}_${passageId}`
}

function readCache(passageId: string, translation: string): string | null {
  try {
    return localStorage.getItem(getCacheKey(passageId, translation))
  } catch {
    return null
  }
}

function writeCache(passageId: string, translation: string, text: string): void {
  try {
    localStorage.setItem(getCacheKey(passageId, translation), text)
  } catch {
    // storage full — ignore
  }
}

interface UseScriptureRefResult {
  text: string | null
  isLoading: boolean
  error: string | null
}

export function useScriptureRef(
  passageId: string | null,
  translation: 'NLT' | 'MSG' | 'ESV' = 'NLT',
): UseScriptureRefResult {
  const cached = passageId ? readCache(passageId, translation) : null
  const [text, setText] = useState<string | null>(cached)
  const [isLoading, setIsLoading] = useState(!!passageId && !cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!passageId) {
      Promise.resolve().then(() => {
        setText(null)
        setIsLoading(false)
        setError(null)
      })
      return
    }

    const fresh = readCache(passageId, translation)
    if (fresh) {
      Promise.resolve(fresh).then((v) => {
        setText(v)
        setIsLoading(false)
        setError(null)
      })
      return
    }

    Promise.resolve().then(() => {
      setIsLoading(true)
      setError(null)
    })

    const apiKey = (import.meta.env.VITE_BIBLE_API_KEY as string | undefined)?.trim()
    if (!apiKey) {
      Promise.resolve().then(() => {
        setIsLoading(false)
        setError('Bible API key not configured.')
      })
      return
    }

    const bibleId = BIBLE_IDS[translation] ?? BIBLE_IDS.NLT
    const endpoint = isRange(passageId) ? 'passages' : 'verses'
    const url =
      `https://rest.api.bible/v1/bibles/${bibleId}/${endpoint}/${encodeURIComponent(passageId)}` +
      '?content-type=text&include-verse-numbers=false'

    fetch(url, { headers: { 'api-key': apiKey } })
      .then((res) => {
        if (!res.ok) throw new Error(`API ${res.status}`)
        return res.json() as Promise<{ data: { content: string } }>
      })
      .then((data) => {
        const fetched = data.data.content.trim()
        writeCache(passageId, translation, fetched)
        setText(fetched)
        setIsLoading(false)
      })
      .catch(() => {
        setIsLoading(false)
        setError('Could not load verse text.')
      })
  }, [passageId, translation])

  return { text, isLoading, error }
}
