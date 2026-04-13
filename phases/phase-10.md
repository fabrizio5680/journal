# Phase 10 — Insights

## Goal

Build the Insights page: mood sparkline over time, top tags bar chart, streak stats.
Uses `useInsights` for aggregations and `useStreak` (already built in Phase 2) for streak data.

## Prerequisites

- Phase 4 complete — mood + tags being saved on entries
- Phase 2 complete — `useStreak` already exists

## Checklist

- [ ] `useInsights.ts` — mood aggregation + top tags (see useInsights section)
- [ ] `InsightsPage.tsx` — editorial header + cards layout (see InsightsPage section)
- [ ] `MoodSparkline.tsx` — Recharts line chart, last 30 / 90 day toggle (see Sparkline section)
- [ ] `TopTags.tsx` — horizontal bar chart, top 10 tags (see TopTags section)
- [ ] Wire `useStreak` into `InsightsPage` for current + longest streak display
- [ ] **Unit**: `useStreak.test.ts`
- [ ] **Unit**: `useInsights.test.ts`

## useInsights

**Location:** `src/hooks/useInsights.ts`

```ts
interface InsightsData {
  moodByDate: Array<{ date: string; mood: number }>   // last 90 days with mood set
  topTags: Array<{ tag: string; count: number }>       // top 10 by frequency
  totalEntries: number
  totalWords: number
}

function useInsights(): InsightsData
```

**Query:**

```ts
// users/{userId}/entries where deleted == false, orderBy date DESC, limit 90
// Client-side:
// - moodByDate: filter entries with mood != null, map to { date, mood }
// - topTags: flatten all tags[], count occurrences, sort DESC, take top 10
// - totalEntries: length of result
// - totalWords: sum of wordCount
```

Use `getDocs` (one-time fetch, not real-time — insights don't need live updates).

## InsightsPage

**Location:** `src/pages/InsightsPage.tsx`

**Header:**

```
text-[3.5rem] font-bold tracking-tight → "Your Journey"
text-on-surface-variant text-lg leading-relaxed → subtitle
```

**Stats row** (`grid grid-cols-2 md:grid-cols-4 gap-4 mb-8`):

Each stat card (`bg-surface-container-lowest rounded-[2rem] p-6`):
- Current streak: `🔥 {current}` + "day streak"
- Longest streak: `🏆 {longest}` + "best streak"
- Total entries: `📖 {totalEntries}` + "entries"
- Total words: `✍️ {totalWords.toLocaleString()}` + "words written"

**Mood Sparkline card** (`bg-surface-container-lowest rounded-[2rem] p-6 mb-6`):
- Title: "Mood Over Time" + 30d / 90d toggle buttons
- `MoodSparkline` component

**Top Tags card** (`bg-surface-container-lowest rounded-[2rem] p-6`):
- Title: "Most Used Tags"
- `TopTags` component

## MoodSparkline

**Location:** `src/components/insights/MoodSparkline.tsx`

**Props:** `{ data: Array<{ date: string; mood: number }>, days: 30 | 90 }`

Uses Recharts `LineChart`:

```tsx
<ResponsiveContainer width="100%" height={200}>
  <LineChart data={filtered}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" strokeOpacity={0.3} />
    <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'MMM d')} tick={{ fontSize: 10 }} />
    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 10 }} />
    <Tooltip
      formatter={(v: number) => MOODS.find(m => m.value === v)?.emoji + ' ' + MOODS.find(m => m.value === v)?.label}
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
```

Toggle buttons (30d / 90d): `bg-primary-container text-primary rounded-full px-3 py-1 text-xs font-semibold` (active) vs `text-on-surface-variant text-xs px-3 py-1` (inactive)

## TopTags

**Location:** `src/components/insights/TopTags.tsx`

**Props:** `{ data: Array<{ tag: string; count: number }> }`

Uses Recharts `BarChart` horizontal:

```tsx
<ResponsiveContainer width="100%" height={data.length * 36}>
  <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
    <XAxis type="number" hide />
    <YAxis type="category" dataKey="tag" tick={{ fontSize: 12 }} width={80} />
    <Bar dataKey="count" fill="var(--color-primary-container)" radius={[0, 4, 4, 0]}>
      <LabelList dataKey="count" position="right" style={{ fontSize: 10, fill: 'var(--color-on-surface-variant)' }} />
    </Bar>
  </BarChart>
</ResponsiveContainer>
```

## Unit Tests

### useStreak.test.ts

```ts
// - returns { current: 0, longest: 0 } when no entries
// - consecutive dates from today return correct current streak
// - streak broken by a missing day: current resets to days since last gap
// - longest streak tracks the maximum consecutive run across all entries
// - entries from the future don't count (use today as anchor)
```

### useInsights.test.ts

```ts
// - moodByDate excludes entries with mood === null
// - moodByDate is ordered by date ASC for chart display
// - topTags returns top 10 by count, sorted DESC
// - tags with equal count are ordered alphabetically
// - totalEntries and totalWords are summed correctly
```
