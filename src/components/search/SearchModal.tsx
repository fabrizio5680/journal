import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { InstantSearch, Configure, useHits } from 'react-instantsearch'
import type { SearchClient } from 'algoliasearch'

import SearchResultCard, { type SearchHit } from './SearchResultCard'
import SearchFilters from './SearchFilters'

import { getAlgoliaClient } from '@/lib/algolia'
import { useSearch } from '@/context/SearchContext'

function dateToTimestamp(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000)
}

// Inner component: lives inside InstantSearch context
interface ResultsProps {
  query: string
  onSelect: (date: string) => void
}

function Results({ query, onSelect }: ResultsProps) {
  const { hits } = useHits<SearchHit>()

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
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [client, setClient] = useState<SearchClient | null>(null)
  const [clientError, setClientError] = useState(false)
  const [query, setQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Fetch secured Algolia client when modal opens; reset state when it closes
  useEffect(() => {
    if (!isSearchOpen) {
      // Defer state resets to avoid synchronous setState in effect body
      const t = setTimeout(() => {
        setQuery('')
        setDateFrom('')
        setDateTo('')
        setClient(null)
      }, 0)
      return () => clearTimeout(t)
    }

    let cancelled = false
    const t = setTimeout(() => inputRef.current?.focus(), 50)

    getAlgoliaClient()
      .then((c) => {
        if (!cancelled) {
          setClientError(false)
          setClient(c as unknown as SearchClient)
        }
      })
      .catch(() => {
        if (!cancelled) setClientError(true)
      })

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [isSearchOpen])

  // Esc closes modal
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

  // Build numeric filter for date range
  const numericFilters: string[] = []
  if (dateFrom) numericFilters.push(`dateTimestamp >= ${dateToTimestamp(dateFrom)}`)
  if (dateTo) numericFilters.push(`dateTimestamp <= ${dateToTimestamp(dateTo)}`)

  if (!isSearchOpen) return null

  return (
    <div
      className="bg-on-surface/20 fixed inset-0 z-50 flex flex-col backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSearch()
      }}
    >
      <div className="bg-surface-container-lowest w-full shadow-lg">
        {/* Search input bar */}
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

        {/* Algolia-powered filters + results */}
        {client && (
          <InstantSearch searchClient={client} indexName="journal_entries">
            <Configure
              hitsPerPage={20}
              query={query}
              numericFilters={numericFilters.length > 0 ? numericFilters : undefined}
            />

            <SearchFilters dateFrom={dateFrom} dateTo={dateTo} onDateChange={handleDateChange} />

            <div className="max-h-[70vh] overflow-y-auto">
              <Results query={query} onSelect={handleSelect} />
            </div>
          </InstantSearch>
        )}

        {!client && !clientError && (
          <div className="flex items-center justify-center py-16">
            <span className="text-on-surface-variant animate-pulse text-sm">Loading search…</span>
          </div>
        )}

        {clientError && (
          <div className="flex items-center justify-center py-16">
            <span className="text-on-surface-variant text-sm">
              Search unavailable — please try again later.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
