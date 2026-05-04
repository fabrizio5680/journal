import { MOODS } from '@/lib/moods'

interface MoodPickerProps {
  value: number | null
  label: string | null
  onChange: (mood: number | null, label: string | null) => void
}

// Group moods into pairs by numeric value: [[val1a, val1b], [val2a, val2b], ...]
const MOOD_PAIRS = MOODS.reduce<(typeof MOODS)[number][][]>((acc, mood) => {
  const existing = acc.find((pair) => pair[0].value === mood.value)
  if (existing) {
    existing.push(mood)
  } else {
    acc.push([mood])
  }
  return acc
}, [])

export default function MoodPicker({ value, label, onChange }: MoodPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2 py-2">
      {MOOD_PAIRS.map((pair) =>
        pair.map((mood) => {
          const isSelected = label !== null ? mood.label === label : value === mood.value
          return (
            <button
              key={mood.label}
              type="button"
              onClick={() =>
                onChange(isSelected ? null : mood.value, isSelected ? null : mood.label)
              }
              className={
                isSelected
                  ? 'border-primary/20 bg-primary-container text-on-primary-container rounded-xl border px-4 py-2 text-sm font-semibold'
                  : 'bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed rounded-xl px-4 py-2 text-sm transition-colors'
              }
            >
              {mood.emoji} {mood.label}
            </button>
          )
        }),
      )}
    </div>
  )
}
