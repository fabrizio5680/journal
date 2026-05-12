import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'

import SearchResultCard, { type SearchHit } from './SearchResultCard'
import SearchFilters from './SearchFilters'

import { useSearch } from '@/context/SearchContext'
import { useSaveStatus } from '@/context/SaveStatusContext'
import { auth } from '@/lib/firebase'
import { EntryRepository } from '@/lib/storage/entryRepository'

interface ResultsProps {
  query: string
  hits: SearchHit[]
  isSearching: boolean
  onSelect: (date: string) => void
}

function Results({ query, hits, isSearching, onSelect }: ResultsProps) {
  if (isSearching) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="text-on-surface-variant animate-pulse text-sm">
          Searching local journal…
        </span>
      </div>
    )
  }

  if (hits.length === 0 && query.trim()) {
    return (
      <div className="py-16 text-center">
        <p className="text-on-surface-variant text-base">
          No entries found for &ldquo;{query}&rdquo;
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {hits.map((hit) => (
        <SearchResultCard key={hit.objectID} hit={hit} onSelect={onSelect} />
      ))}
    </div>
  )
}

export default function SearchModal() {
  const { isSearchOpen, closeSearch } = useSearch()
  const { syncStatus } = useSaveStatus()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [uid, setUid] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedMoods, setSelectedMoods] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [hits, setHits] = useState<SearchHit[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null))
  }, [])

  useEffect(() => {
    if (!isSearchOpen) {
      const t = setTimeout(() => {
        setQuery('')
        setDateFrom('')
        setDateTo('')
        setSelectedMoods([])
        setSelectedTags([])
        setHits([])
      }, 0)
      return () => clearTimeout(t)
    }

    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [isSearchOpen])

  useEffect(() => {
    if (!isSearchOpen || !uid) return
    void EntryRepository.listMetadata(uid).then((metadata) => {
      const freq = new Map<string, number>()
      for (const item of metadata) {
        for (const tag of item.tags) {
          freq.set(tag, (freq.get(tag) ?? 0) + 1)
        }
      }
      const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
      setAvailableTags(sorted)
    })
  }, [isSearchOpen, uid])

  useEffect(() => {
    if (!isSearchOpen || !uid) return

    const activeUid = uid
    let cancelled = false

    async function runSearch() {
      if (
        !query.trim() &&
        !dateFrom &&
        !dateTo &&
        selectedMoods.length === 0 &&
        selectedTags.length === 0
      ) {
        setHits([])
        return
      }

      setIsSearching(true)
      try {
        const results = await EntryRepository.searchEntries(activeUid, query, {
          dateFrom,
          dateTo,
          moodLabels: selectedMoods,
          tags: selectedTags,
        })
        if (!cancelled) setHits(results)
      } catch {
        if (!cancelled) setHits([])
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }

    void runSearch()
    const unsubscribe = EntryRepository.subscribe(activeUid, () => void runSearch())

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [isSearchOpen, uid, query, dateFrom, dateTo, selectedMoods, selectedTags])

  useEffect(() => {
    if (!isSearchOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isSearchOpen, closeSearch])

  const handleSelect = useCallback(
    (date: string) => {
      navigate(`/entry/${date}`)
      closeSearch()
    },
    [navigate, closeSearch],
  )

  const handleDateChange = useCallback((from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
  }, [])

  const handleToggleMood = useCallback((label: string) => {
    setSelectedMoods((prev) =>
      prev.includes(label) ? prev.filter((mood) => mood !== label) : [...prev, label],
    )
  }, [])

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }, [])

  if (!isSearchOpen) return null

  return (
    <div
      className="bg-on-surface/20 fixed inset-0 z-50 flex flex-col backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSearch()
      }}
    >
      <div className="bg-surface-container-lowest w-full shadow-lg">
        <div className="flex items-center gap-3 px-6 py-4">
          <span className="material-symbols-outlined text-on-surface-variant text-xl">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your entries…"
            aria-label="Search entries"
            className="text-on-surface placeholder:text-outline-variant/60 flex-1 bg-transparent text-xl outline-none"
          />
          <span className="text-on-surface-variant hidden items-center gap-1 text-xs md:inline-flex">
            <kbd className="bg-surface-container rounded px-1.5 py-0.5 font-mono text-xs">Esc</kbd>
            <span>to close</span>
          </span>
          <button
            onClick={closeSearch}
            aria-label="Close search"
            className="text-on-surface-variant hover:text-on-surface md:hidden"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <SearchFilters
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={handleDateChange}
          selectedMoods={selectedMoods}
          onToggleMood={handleToggleMood}
          availableTags={availableTags}
          selectedTags={selectedTags}
          onToggleTag={handleToggleTag}
        />

        <div className="max-h-[70vh] overflow-y-auto">
          {availableTags.length === 0 &&
          hits.length === 0 &&
          !query.trim() &&
          syncStatus === 'saved-local' ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="material-symbols-outlined text-on-surface-variant/20 text-[48px]">
                cloud_off
              </span>
              <p className="text-on-surface-variant text-sm">
                Connect Google Drive to search your full journal history.
              </p>
              <button
                onClick={() => {
                  navigate('/settings')
                  closeSearch()
                }}
                className="bg-primary text-on-primary rounded-xl px-4 py-2 text-sm font-medium"
              >
                Go to Settings
              </button>
            </div>
          ) : (
            <Results query={query} hits={hits} isSearching={isSearching} onSelect={handleSelect} />
          )}
        </div>
      </div>
    </div>
  )
}
