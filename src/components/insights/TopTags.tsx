import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList } from 'recharts'

interface Props {
  data: Array<{ tag: string; count: number }>
}

export default function TopTags({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="text-on-surface-variant flex h-[100px] items-center justify-center text-sm">
        No tags yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={data.length * 36}>
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="tag" tick={{ fontSize: 12 }} width={80} />
        <Bar dataKey="count" fill="var(--color-primary-container)" radius={[0, 4, 4, 0]}>
          <LabelList
            dataKey="count"
            position="right"
            style={{ fontSize: 10, fill: 'var(--color-on-surface-variant)' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
