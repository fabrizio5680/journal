import { useState, useRef, useEffect } from 'react'
import Chip from '@/components/ui/Chip'

interface TagInputProps {
  tags: string[]
  vocabulary: string[]
  onChange: (tags: string[]) => void
  onNewTag?: (tag: string) => void
}

const MAX_TAGS = 10
const MAX_TAG_LENGTH = 30

function normalizeTag(raw: string): string {
  return raw.toLowerCase().trim().slice(0, MAX_TAG_LENGTH)
}

export default function TagInput({ tags, vocabulary, onChange, onNewTag }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = inputValue
    ? vocabulary.filter(
        (v) => v.includes(inputValue.toLowerCase()) && !tags.includes(v),
      )
    : vocabulary.filter((v) => !tags.includes(v))

  const showCreate =
    inputValue.trim().length > 0 &&
    !vocabulary.includes(normalizeTag(inputValue)) &&
    !tags.includes(normalizeTag(inputValue))

  function addTag(raw: string) {
    const tag = normalizeTag(raw)
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return
    const isNew = !vocabulary.includes(tag)
    onChange([...tags, tag])
    if (isNew) onNewTag?.(tag)
    setInputValue('')
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (inputValue.trim()) addTag(inputValue)
    }
    if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 py-2">
        {tags.map((tag) => (
          <Chip key={tag} onRemove={() => removeTag(tag)}>
            {tag}
          </Chip>
        ))}

        {tags.length < MAX_TAGS && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            placeholder="Add tag…"
            className="text-on-surface placeholder:text-outline-variant/40 min-w-[80px] flex-1 bg-transparent text-xs outline-none"
            onChange={(e) => {
              setInputValue(e.target.value)
              setShowDropdown(true)
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>

      {showDropdown && (filtered.length > 0 || showCreate) && (
        <div className="bg-surface-container-lowest border-outline-variant/10 absolute left-0 z-50 mt-1 max-h-48 w-full min-w-[160px] overflow-y-auto rounded-xl border shadow-lg">
          {filtered.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault() // prevent input blur before click registers
                addTag(suggestion)
              }}
              className="hover:bg-surface-container w-full cursor-pointer px-4 py-2 text-left text-sm"
            >
              {suggestion}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                addTag(inputValue)
              }}
              className="hover:bg-surface-container text-on-surface-variant w-full cursor-pointer px-4 py-2 text-left text-sm"
            >
              Create tag: {inputValue.toLowerCase().trim()}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
