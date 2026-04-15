import { format, parseISO, subDays } from 'date-fns'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { MOODS } from '@/lib/moods'

interface Props {
  data: Array<{ date: string; mood: number }>
  days: 30 | 90
}

export default function MoodSparkline({ data, days }: Props) {
  const cutoff = format(subDays(new Date(), days), 'yyyy-MM-dd')
  const filtered = data.filter((d) => d.date >= cutoff)

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-on-surface-variant text-sm">
        No mood data for this period
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={filtered}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-outline-variant)"
          strokeOpacity={0.3}
        />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => format(parseISO(d), 'MMM d')}
          tick={{ fontSize: 10 }}
        />
        <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(value) => {
            const numericValue = typeof value === 'number' ? value : Number(value ?? 0)
            const mood = MOODS.find((m) => m.value === numericValue)
            return mood ? `${mood.emoji} ${mood.label}` : String(value ?? '')
          }}
        />
        <Line
          type="monotone"
          dataKey="mood"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={{ fill: 'var(--color-primary)', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
