import type { Verse } from '@/hooks/useDailyVerse'

interface VerseBlockProps {
  verse: Verse | null
  isLoading: boolean
}

export function VerseBlock({ verse, isLoading }: VerseBlockProps) {
  return (
    <div className="mt-2 mb-10 md:hidden">
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="bg-surface-container h-2 w-16 rounded-lg" />
          <div className="bg-surface-container h-3 w-full rounded-lg" />
          <div className="bg-surface-container h-3 w-4/5 rounded-lg" />
          <div className="bg-surface-container h-2 w-24 rounded-lg" />
        </div>
      ) : verse ? (
        <div className="flex flex-col gap-2">
          <p className="text-on-surface-variant/40 text-[9px] tracking-[0.25em] uppercase">
            Today's Word
          </p>
          <p className="font-display text-on-surface-variant/60 text-base leading-relaxed font-light italic">
            "{verse.text}"
          </p>
          <p className="text-primary/50 text-[10px] font-semibold tracking-[0.2em] uppercase">
            {verse.reference}
          </p>
        </div>
      ) : null}
    </div>
  )
}
