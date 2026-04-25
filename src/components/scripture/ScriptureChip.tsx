import { useEffect, useRef, useState } from 'react'

import { useScriptureRef } from '@/hooks/useScriptureRef'
import type { ScriptureRef } from '@/types'

interface ScriptureChipProps {
  ref_: ScriptureRef
  translation: 'NLT' | 'MSG' | 'ESV'
  onRemove?: () => void
}

export default function ScriptureChip({ ref_, translation, onRemove }: ScriptureChipProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { text, isLoading, error } = useScriptureRef(open ? ref_.passageId : null, translation)

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <span className="bg-tertiary-container/70 text-on-tertiary-container inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center gap-1 focus:outline-none"
          aria-expanded={open}
          aria-label={`Show verse: ${ref_.reference}`}
        >
          <span className="material-symbols-outlined text-[14px]">menu_book</span>
          {ref_.reference}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${ref_.reference}`}
            className="hover:text-on-surface ml-0.5 leading-none transition-colors"
          >
            ×
          </button>
        )}
      </span>

      {open && (
        <div className="bg-surface-container-lowest border-outline-variant/10 absolute top-full left-0 z-50 mt-1 w-64 rounded-xl border p-3 shadow-lg">
          {isLoading && <p className="text-on-surface-variant text-xs">Loading…</p>}
          {!isLoading && error && <p className="text-error text-xs">{error}</p>}
          {!isLoading && !error && text && (
            <>
              <p className="text-on-surface text-xs leading-relaxed">{text}</p>
              <p className="text-on-surface-variant/60 mt-2 text-[10px] font-medium tracking-wide uppercase">
                {ref_.reference} · {translation}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
