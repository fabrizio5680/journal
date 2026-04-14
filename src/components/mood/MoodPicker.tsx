import { MOODS } from '@/lib/moods'

interface MoodPickerProps {
  value: number | null
  onChange: (mood: number | null, label: string | null) => void
}

export default function MoodPicker({ value, onChange }: MoodPickerProps) {
  return (
    <div className="flex flex-wrap gap-2 py-2">
      {MOODS.map((mood) => {
        const isSelected = value === mood.value
        return (
          <button
            key={mood.value}
            type="button"
            onClick={() => onChange(isSelected ? null : mood.value, isSelected ? null : mood.label)}
            className={
              isSelected
                ? 'border-primary/20 bg-primary-container text-on-primary-container rounded-xl border px-4 py-2 text-sm font-semibold'
                : 'bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed rounded-xl px-4 py-2 text-sm transition-colors'
            }
          >
            {mood.emoji} {mood.label}
          </button>
        )
      })}
    </div>
  )
}
