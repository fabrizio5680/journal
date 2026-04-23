import { useEffect, useState } from 'react'
import { format, getDayOfYear } from 'date-fns'

export interface Verse {
  reference: string
  text: string
}

export const DAILY_VERSE_IDS = [
  'GEN.1.1',
  'GEN.1.27',
  'GEN.15.6',
  'GEN.28.15',
  'GEN.50.20',
  'EXO.14.14',
  'EXO.33.14',
  'NUM.6.24',
  'DEU.6.5',
  'DEU.8.3',
  'DEU.30.19',
  'DEU.31.6',
  'DEU.31.8',
  'JOS.1.9',
  'JOS.24.15',
  'PSA.1.1',
  'PSA.4.8',
  'PSA.16.8',
  'PSA.16.11',
  'PSA.18.2',
  'PSA.19.1',
  'PSA.19.14',
  'PSA.23.1',
  'PSA.23.4',
  'PSA.23.6',
  'PSA.25.5',
  'PSA.27.1',
  'PSA.27.4',
  'PSA.28.7',
  'PSA.30.5',
  'PSA.31.3',
  'PSA.32.7',
  'PSA.34.4',
  'PSA.34.8',
  'PSA.34.18',
  'PSA.36.9',
  'PSA.37.4',
  'PSA.37.23',
  'PSA.40.1',
  'PSA.40.8',
  'PSA.42.1',
  'PSA.43.5',
  'PSA.46.1',
  'PSA.46.10',
  'PSA.51.10',
  'PSA.55.22',
  'PSA.56.3',
  'PSA.57.1',
  'PSA.61.2',
  'PSA.62.8',
  'PSA.63.1',
  'PSA.63.3',
  'PSA.66.20',
  'PSA.71.5',
  'PSA.73.26',
  'PSA.84.11',
  'PSA.86.5',
  'PSA.90.12',
  'PSA.91.1',
  'PSA.91.11',
  'PSA.94.18',
  'PSA.100.4',
  'PSA.100.5',
  'PSA.103.1',
  'PSA.103.12',
  'PSA.107.1',
  'PSA.107.9',
  'PSA.112.7',
  'PSA.115.1',
  'PSA.118.6',
  'PSA.118.24',
  'PSA.119.9',
  'PSA.119.11',
  'PSA.119.50',
  'PSA.119.89',
  'PSA.119.105',
  'PSA.119.130',
  'PSA.119.165',
  'PSA.121.1',
  'PSA.121.7',
  'PSA.122.1',
  'PSA.125.1',
  'PSA.127.1',
  'PSA.130.7',
  'PSA.133.1',
  'PSA.136.1',
  'PSA.138.3',
  'PSA.138.8',
  'PSA.139.1',
  'PSA.139.14',
  'PSA.139.23',
  'PSA.143.8',
  'PSA.145.8',
  'PSA.145.18',
  'PSA.147.3',
  'PSA.150.6',
  'PRO.1.7',
  'PRO.3.5',
  'PRO.3.6',
  'PRO.3.7',
  'PRO.4.23',
  'PRO.11.14',
  'PRO.12.25',
  'PRO.13.20',
  'PRO.15.1',
  'PRO.16.3',
  'PRO.16.9',
  'PRO.17.17',
  'PRO.17.22',
  'PRO.18.10',
  'PRO.18.24',
  'PRO.19.21',
  'PRO.22.6',
  'PRO.24.16',
  'PRO.27.17',
  'PRO.28.13',
  'PRO.31.25',
  'ECC.3.1',
  'ECC.3.11',
  'ECC.4.9',
  'ISA.1.18',
  'ISA.6.8',
  'ISA.9.6',
  'ISA.12.2',
  'ISA.25.1',
  'ISA.26.3',
  'ISA.26.4',
  'ISA.30.21',
  'ISA.40.8',
  'ISA.40.28',
  'ISA.40.29',
  'ISA.40.31',
  'ISA.41.10',
  'ISA.41.13',
  'ISA.43.1',
  'ISA.43.2',
  'ISA.43.18',
  'ISA.43.19',
  'ISA.43.25',
  'ISA.46.4',
  'ISA.49.15',
  'ISA.49.16',
  'ISA.53.5',
  'ISA.54.10',
  'ISA.55.8',
  'ISA.55.9',
  'ISA.55.11',
  'ISA.58.11',
  'ISA.60.1',
  'ISA.61.1',
  'ISA.61.3',
  'ISA.64.8',
  'JER.17.7',
  'JER.17.8',
  'JER.29.11',
  'JER.31.3',
  'JER.31.33',
  'JER.33.3',
  'LAM.3.22',
  'LAM.3.23',
  'LAM.3.25',
  'EZK.36.26',
  'DAN.2.20',
  'DAN.3.17',
  'HOS.6.3',
  'JOL.2.25',
  'JOL.2.28',
  'MIC.6.8',
  'MIC.7.18',
  'HAB.3.19',
  'ZEP.3.17',
  'ZEC.4.6',
  'MAL.3.6',
  'MAL.3.10',
  'MAT.5.3',
  'MAT.5.4',
  'MAT.5.6',
  'MAT.5.8',
  'MAT.5.9',
  'MAT.5.14',
  'MAT.5.16',
  'MAT.6.26',
  'MAT.6.33',
  'MAT.6.34',
  'MAT.7.7',
  'MAT.7.12',
  'MAT.7.24',
  'MAT.11.28',
  'MAT.11.29',
  'MAT.19.26',
  'MAT.22.37',
  'MAT.22.39',
  'MAT.25.40',
  'MAT.28.19',
  'MAT.28.20',
  'MRK.9.23',
  'MRK.10.27',
  'MRK.10.45',
  'MRK.11.24',
  'LUK.1.37',
  'LUK.1.45',
  'LUK.4.18',
  'LUK.6.27',
  'LUK.6.31',
  'LUK.6.37',
  'LUK.6.38',
  'LUK.12.7',
  'LUK.21.19',
  'JHN.1.1',
  'JHN.1.12',
  'JHN.1.14',
  'JHN.3.16',
  'JHN.3.17',
  'JHN.4.24',
  'JHN.6.35',
  'JHN.8.12',
  'JHN.8.36',
  'JHN.10.10',
  'JHN.10.27',
  'JHN.11.25',
  'JHN.13.34',
  'JHN.14.1',
  'JHN.14.6',
  'JHN.14.14',
  'JHN.14.27',
  'JHN.15.4',
  'JHN.15.5',
  'JHN.15.7',
  'JHN.15.13',
  'JHN.15.16',
  'JHN.16.33',
  'JHN.17.3',
  'ACT.1.8',
  'ACT.4.12',
  'ACT.16.31',
  'ACT.17.28',
  'ACT.20.35',
  'ROM.1.16',
  'ROM.3.23',
  'ROM.5.1',
  'ROM.5.3',
  'ROM.5.5',
  'ROM.5.8',
  'ROM.6.4',
  'ROM.6.23',
  'ROM.8.1',
  'ROM.8.14',
  'ROM.8.26',
  'ROM.8.28',
  'ROM.8.31',
  'ROM.8.37',
  'ROM.8.38',
  'ROM.8.39',
  'ROM.10.9',
  'ROM.10.17',
  'ROM.12.1',
  'ROM.12.2',
  'ROM.12.12',
  'ROM.15.13',
  '1CO.2.9',
  '1CO.3.16',
  '1CO.6.19',
  '1CO.6.20',
  '1CO.10.13',
  '1CO.13.4',
  '1CO.13.7',
  '1CO.13.13',
  '1CO.15.57',
  '1CO.15.58',
  '2CO.1.3',
  '2CO.1.4',
  '2CO.3.17',
  '2CO.4.8',
  '2CO.4.17',
  '2CO.5.7',
  '2CO.5.17',
  '2CO.9.8',
  '2CO.10.5',
  '2CO.12.9',
  '2CO.12.10',
  'GAL.2.20',
  'GAL.3.26',
  'GAL.5.1',
  'GAL.5.16',
  'GAL.5.22',
  'GAL.6.2',
  'GAL.6.9',
  'EPH.1.3',
  'EPH.2.8',
  'EPH.2.10',
  'EPH.3.16',
  'EPH.3.20',
  'EPH.4.2',
  'EPH.4.29',
  'EPH.4.32',
  'EPH.5.20',
  'EPH.6.10',
  'EPH.6.11',
  'EPH.6.18',
  'PHP.1.6',
  'PHP.1.21',
  'PHP.2.3',
  'PHP.2.13',
  'PHP.3.13',
  'PHP.3.14',
  'PHP.4.4',
  'PHP.4.6',
  'PHP.4.7',
  'PHP.4.8',
  'PHP.4.11',
  'PHP.4.13',
  'PHP.4.19',
  'COL.1.17',
  'COL.2.7',
  'COL.3.1',
  'COL.3.2',
  'COL.3.14',
  'COL.3.15',
  'COL.3.17',
  'COL.3.23',
  '1TH.5.11',
  '1TH.5.16',
  '1TH.5.17',
  '1TH.5.18',
  '1TH.5.23',
  '2TH.3.3',
  '1TI.4.12',
  '1TI.6.6',
  '2TI.1.7',
  '2TI.3.16',
  '2TI.4.7',
  'HEB.4.12',
  'HEB.4.16',
  'HEB.6.19',
  'HEB.10.23',
  'HEB.10.24',
  'HEB.11.1',
  'HEB.11.6',
  'HEB.12.1',
  'HEB.13.5',
  'HEB.13.8',
  'JAS.1.2',
  'JAS.1.5',
  'JAS.1.17',
  'JAS.1.22',
  'JAS.4.7',
  'JAS.4.8',
  'JAS.5.16',
  '1PE.1.3',
  '1PE.2.9',
  '1PE.3.15',
  '1PE.4.8',
  '1PE.5.7',
  '2PE.1.3',
  '2PE.3.9',
  '1JO.1.9',
  '1JO.3.1',
  '1JO.4.7',
  '1JO.4.9',
  '1JO.4.19',
  '1JO.5.4',
  '1JO.5.14',
  'REV.3.20',
  'REV.21.4',
  'REV.22.13',
] as const

const FALLBACK_VERSES: Verse[] = [
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

export function getDailyVerseId(date: Date): string {
  return DAILY_VERSE_IDS[getDayOfYear(date) % DAILY_VERSE_IDS.length]
}

function getCacheKey(translation: string, date: Date): string {
  return `scripture_${translation}_${format(date, 'yyyy-MM-dd')}`
}

function readCache(translation: string, date: Date): Verse | null {
  try {
    const cached = localStorage.getItem(getCacheKey(translation, date))
    if (!cached) return null
    return JSON.parse(cached) as Verse
  } catch {
    localStorage.removeItem(getCacheKey(translation, date))
    return null
  }
}

export function getFallbackVerse(date: Date = new Date()): Verse {
  return FALLBACK_VERSES[getDayOfYear(date) % FALLBACK_VERSES.length]
}

export function useDailyVerse(translation: 'NLT' | 'MSG' | 'ESV' = 'NLT', date: Date = new Date()) {
  const dateStr = format(date, 'yyyy-MM-dd')
  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')
  const cached = readCache(translation, date)
  const [verse, setVerse] = useState<Verse | null>(cached)
  const [isLoading, setIsLoading] = useState(!cached && isToday)

  useEffect(() => {
    if (!isToday) {
      setVerse(getFallbackVerse(date))
      setIsLoading(false)
      return
    }

    const fresh = readCache(translation, date)
    if (fresh) {
      Promise.resolve(fresh).then((v) => {
        setVerse(v)
        setIsLoading(false)
      })
      return
    }

    Promise.resolve().then(() => setIsLoading(true))
    const apiKey = (import.meta.env.VITE_BIBLE_API_KEY as string | undefined)?.trim()
    if (!apiKey) {
      Promise.resolve(getFallbackVerse(date)).then((v) => {
        setVerse(v)
        setIsLoading(false)
      })
      return
    }

    const bibleId = BIBLE_IDS[translation] ?? BIBLE_IDS.NLT
    const verseId = getDailyVerseId(date)
    const url =
      `https://rest.api.bible/v1/bibles/${bibleId}/verses/${encodeURIComponent(verseId)}` +
      '?content-type=text&include-verse-numbers=false'

    fetch(url, { headers: { 'api-key': apiKey } })
      .then((res) => {
        if (!res.ok) throw new Error(`API ${res.status}`)
        return res.json() as Promise<{ data: { content: string; reference: string } }>
      })
      .then((data) => {
        const fetched: Verse = {
          text: data.data.content.trim(),
          reference: data.data.reference,
        }
        localStorage.setItem(getCacheKey(translation, date), JSON.stringify(fetched))
        setVerse(fetched)
        setIsLoading(false)
      })
      .catch(() => {
        setVerse(getFallbackVerse(date))
        setIsLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation, isToday, dateStr])

  return { verse: verse ?? getFallbackVerse(date), isLoading }
}
