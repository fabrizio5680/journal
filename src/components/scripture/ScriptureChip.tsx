import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useScriptureRef } from '@/hooks/useScriptureRef'
import type { ScriptureRef } from '@/types'

interface ScriptureChipProps {
  ref_: ScriptureRef
  translation: 'NLT' | 'MSG' | 'ESV'
  onRemove?: () => void
}

export default function ScriptureChip({ ref_, translation, onRemove }: ScriptureChipProps) {
  const [open, setOpen] = useState(false)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { text, isLoading, error } = useScriptureRef(open ? ref_.passageId : null, translation)

  function openPopup() {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setPopupPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen(true)
  }

  function closePopup() {
    setOpen(false)
    setPopupPos(null)
  }

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        popupRef.current &&
        !popupRef.current.contains(e.target as Node)
      ) {
        closePopup()
      }
    }

    function onScroll() {
      closePopup()
    }

    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <span className="bg-tertiary-container/70 text-on-tertiary-container inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium">
        <button
          type="button"
          onClick={() => (open ? closePopup() : openPopup())}
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

      {open &&
        popupPos &&
        createPortal(
          <div
            ref={popupRef}
            className="bg-surface-container-lowest border-outline-variant/10 fixed z-50 w-64 rounded-xl border p-3 shadow-lg"
            style={{ top: popupPos.top, left: popupPos.left }}
          >
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
          </div>,
          document.body,
        )}
    </div>
  )
}
