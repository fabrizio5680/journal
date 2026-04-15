import { useEffect, useState } from 'react'
import { format, getDayOfYear } from 'date-fns'

// 52 verse references — one per week, selected by week-of-year
const WEEKLY_VERSE_IDS = [
  'GEN.1.1',
  'PSA.23.1',
  'JHN.3.16',
  'PHP.4.13',
  'JER.29.11',
  'ISA.40.31',
  'PSA.46.10',
  'MAT.11.28',
  'PRO.3.5',
  'ROM.8.28',
  'ROM.12.2',
  'HEB.11.1',
  'JAS.1.2',
  '1PE.5.7',
  'PSA.121.1',
  'PSA.37.4',
  'ISA.43.2',
  'DEU.31.6',
  'JOS.1.9',
  'PSA.91.1',
  'PSA.27.1',
  'NAH.1.7',
  'MAT.6.33',
  'LUK.1.37',
  'ROM.8.38',
  'PHP.4.6',
  'COL.3.23',
  '2TI.1.7',
  'HEB.12.1',
  'PSA.56.3',
  'PSA.119.105',
  'ISA.26.3',
  'LAM.3.22',
  'MIC.6.8',
  'ZEP.3.17',
  'MAL.3.10',
  'MAT.5.14',
  'JHN.8.12',
  'JHN.14.6',
  'JHN.15.5',
  'ACT.1.8',
  'ROM.5.8',
  '1CO.13.4',
  '2CO.12.9',
  'GAL.5.22',
  'EPH.2.8',
  'PHP.4.4',
  '1TH.5.16',
  '1JO.4.19',
  'REV.21.4',
  'PSA.103.1',
  'PRO.31.25',
]

const FALLBACK_VERSES = [
  { reference: 'Psalm 46:10', text: 'Be still, and know that I am God.' },
  { reference: 'Philippians 4:13', text: 'I can do all things through Christ who strengthens me.' },
  {
    reference: 'Jeremiah 29:11',
    text: 'For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.',
  },
  {
    reference: 'Isaiah 40:31',
    text: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles.',
  },
  {
    reference: 'Romans 8:28',
    text: 'And we know that in all things God works for the good of those who love him.',
  },
  {
    reference: 'Proverbs 3:5',
    text: 'Trust in the Lord with all your heart and lean not on your own understanding.',
  },
  {
    reference: 'Matthew 11:28',
    text: 'Come to me, all you who are weary and burdened, and I will give you rest.',
  },
  {
    reference: 'John 3:16',
    text: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
  },
  { reference: 'Psalm 23:1', text: 'The Lord is my shepherd; I shall not want.' },
  { reference: '1 Peter 5:7', text: 'Cast all your anxiety on him because he cares for you.' },
]

const BIBLE_IDS: Record<string, string> = {
  NLT: '65eec8e0b60e656b-01',
  MSG: '65eec8e0b60e656b-02',
  ESV: 'de4e12af7f28f599-01',
}

interface Verse {
  reference: string
  text: string
}

function getWeeklyVerseId(): string {
  const dayOfYear = getDayOfYear(new Date())
  const weekIndex = Math.floor(dayOfYear / 7) % WEEKLY_VERSE_IDS.length
  return WEEKLY_VERSE_IDS[weekIndex]
}

function getCacheKey(translation: string): string {
  const today = format(new Date(), 'yyyy-MM-dd')
  return `scripture_${translation}_${today}`
}

function readCache(translation: string): Verse | null {
  const cached = localStorage.getItem(getCacheKey(translation))
  if (!cached) return null
  try {
    return JSON.parse(cached) as Verse
  } catch {
    localStorage.removeItem(getCacheKey(translation))
    return null
  }
}

function getFallbackVerse(): Verse {
  const idx = getDayOfYear(new Date()) % FALLBACK_VERSES.length
  return FALLBACK_VERSES[idx]
}

interface DailyScriptureProps {
  translation?: 'NLT' | 'MSG' | 'ESV'
}

export function DailyScriptureSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-surface-container h-6 w-6 rounded-full mb-4" />
      <div className="bg-surface-container mb-2 h-3 w-full rounded-lg" />
      <div className="bg-surface-container mb-2 h-3 w-5/6 rounded-lg" />
      <div className="bg-surface-container mb-4 h-3 w-4/6 rounded-lg" />
      <div className="bg-surface-container h-2 w-24 rounded-lg" />
    </div>
  )
}

export default function DailyScripture({ translation = 'NLT' }: DailyScriptureProps) {
  // Initialize from localStorage so we never render empty on first paint
  const cached = readCache(translation)
  const [verse, setVerse] = useState<Verse | null>(cached)
  const [isLoading, setIsLoading] = useState(!cached)

  useEffect(() => {
    // Re-check cache in case translation changed after mount
    const fresh = readCache(translation)
    if (fresh) {
      Promise.resolve(fresh).then((v) => {
        setVerse(v)
        setIsLoading(false)
      })
      return
    }

    // Wrap in Promise so setState is not called synchronously in the effect body
    Promise.resolve().then(() => setIsLoading(true))
    const apiKey = (import.meta.env.VITE_BIBLE_API_KEY as string | undefined)?.trim()
    if (!apiKey) {
      Promise.resolve(getFallbackVerse()).then((v) => {
        setVerse(v)
        setIsLoading(false)
      })
      return
    }

    const bibleId = BIBLE_IDS[translation] ?? BIBLE_IDS.NLT
    const verseId = getWeeklyVerseId()
    const url =
      `https://rest.api.bible/v1/bibles/${bibleId}/verses/${encodeURIComponent(verseId)}` +
      '?content-type=text&include-verse-numbers=false'

    fetch(url, {
      headers: {
        'api-key': apiKey,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`API ${res.status}`)
        return res.json() as Promise<{ data: { content: string; reference: string } }>
      })
      .then((data) => {
        const fetched: Verse = {
          text: data.data.content.trim(),
          reference: data.data.reference,
        }
        localStorage.setItem(getCacheKey(translation), JSON.stringify(fetched))
        setVerse(fetched)
        setIsLoading(false)
      })
      .catch(() => {
        setVerse(getFallbackVerse())
        setIsLoading(false)
      })
  }, [translation])

  if (isLoading) return <DailyScriptureSkeleton />

  const display = verse ?? getFallbackVerse()

  return (
    <div className="flex flex-col gap-3">
      {/* Decorative label */}
      <p className="text-on-surface-variant/50 text-[9px] tracking-[0.25em] uppercase">
        Today's Word
      </p>

      {/* Large opening quote */}
      <div className="font-display text-primary/20 text-7xl leading-none select-none -mb-4">
        "
      </div>

      {/* Verse text */}
      <p className="font-display text-on-surface text-lg font-light italic leading-relaxed">
        {display.text}
      </p>

      {/* Reference */}
      <div className="flex items-center gap-2 pt-1">
        <div className="h-px flex-1 bg-outline-variant/30" />
        <p className="text-primary text-[10px] font-semibold tracking-[0.2em] uppercase">
          {display.reference}
        </p>
        <div className="h-px flex-1 bg-outline-variant/30" />
      </div>

      {/* Translation badge */}
      <p className="text-on-surface-variant/40 text-[9px] tracking-[0.15em] uppercase text-center">
        {translation}
      </p>
    </div>
  )
}
