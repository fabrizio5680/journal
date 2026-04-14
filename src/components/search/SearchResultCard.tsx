import { format, parseISO } from 'date-fns'

import Chip from '@/components/ui/Chip'
import { MOODS } from '@/lib/moods'

export interface SearchHit {
  objectID: string
  date: string
  excerpt: string
  mood: number | null
  moodLabel: string | null
  tags: string[]
  wordCount: number
}

interface SearchResultCardProps {
  hit: SearchHit
  onSelect: (date: string) => void
}

export default function SearchResultCard({ hit, onSelect }: SearchResultCardProps) {
  const mood = hit.mood != null ? MOODS.find((m) => m.value === hit.mood) : null
  const title = hit.excerpt?.slice(0, 60) || 'Untitled'
  const excerpt = hit.excerpt?.slice(0, 120) ?? ''

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(hit.date)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(hit.date)}
      className="group bg-surface-container-lowest hover:border-outline-variant/10 cursor-pointer rounded-[2rem] border border-transparent p-6 transition-all duration-500 hover:shadow-[0_4px_40px_rgba(48,51,49,0.06)]"
    >
      <p className="text-on-surface-variant mb-1 text-[10px] font-black tracking-widest uppercase">
        {format(parseISO(hit.date), 'EEEE, MMMM d, yyyy')}
      </p>

      <div className="flex items-start justify-between gap-4">
        <h3 className="text-on-surface flex-1 text-2xl leading-snug font-bold">{title}</h3>
        {mood && (
          <Chip className="mt-1 shrink-0">
            {mood.emoji} {mood.label}
          </Chip>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-4">
        <p className="text-on-surface-variant line-clamp-2 flex-1 text-sm leading-relaxed">
          {excerpt}
        </p>
        <span className="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform duration-300 group-hover:translate-x-1">
          arrow_forward
        </span>
      </div>
    </div>
  )
}
