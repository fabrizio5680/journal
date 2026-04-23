import { useDailyVerse } from '@/hooks/useDailyVerse'

export function DailyScriptureSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-surface-container mb-4 h-6 w-6 rounded-full" />
      <div className="bg-surface-container mb-2 h-3 w-full rounded-lg" />
      <div className="bg-surface-container mb-2 h-3 w-5/6 rounded-lg" />
      <div className="bg-surface-container mb-4 h-3 w-4/6 rounded-lg" />
      <div className="bg-surface-container h-2 w-24 rounded-lg" />
    </div>
  )
}

interface DailyScriptureProps {
  translation?: 'NLT' | 'MSG' | 'ESV'
}

export default function DailyScripture({ translation = 'NLT' }: DailyScriptureProps) {
  const { verse, isLoading } = useDailyVerse(translation)

  if (isLoading) return <DailyScriptureSkeleton />

  return (
    <div className="flex flex-col gap-3">
      <p className="text-on-surface-variant/50 text-[9px] tracking-[0.25em] uppercase">
        Today's Word
      </p>

      <div className="font-display text-primary/20 -mb-4 text-7xl leading-none select-none">"</div>

      <p className="font-display text-on-surface text-lg leading-relaxed font-light italic">
        {verse.text}
      </p>

      <div className="flex items-center gap-2 pt-1">
        <div className="bg-outline-variant/30 h-px flex-1" />
        <p className="text-primary text-[10px] font-semibold tracking-[0.2em] uppercase">
          {verse.reference}
        </p>
        <div className="bg-outline-variant/30 h-px flex-1" />
      </div>

      <p className="text-on-surface-variant/40 text-center text-[9px] tracking-[0.15em] uppercase">
        {translation}
      </p>
    </div>
  )
}
