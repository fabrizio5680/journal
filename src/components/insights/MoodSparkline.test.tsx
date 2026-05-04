import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

import MoodSparkline from './MoodSparkline'

// Recharts uses ResizeObserver internally — jsdom doesn't provide it.
// Provide a minimal stub so ResponsiveContainer renders without errors.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Mock recharts so we can inspect the tooltip formatter directly.
// We capture the formatter passed to <Tooltip> and expose it via a data attribute
// on a sentinel element so tests can call it without needing a real chart interaction.
vi.mock('recharts', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    LineChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
      <div data-testid="line-chart" data-chart-data={JSON.stringify(data)}>
        {children}
      </div>
    ),
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: ({
      formatter,
    }: {
      formatter?: (
        value: unknown,
        name: string,
        props: { payload?: { moodLabel?: string | null } },
      ) => string
    }) => (
      <div
        data-testid="recharts-tooltip"
        data-formatter={formatter ? 'present' : 'absent'}
        ref={(el) => {
          if (el && formatter) {
            // Expose formatter on DOM element for test access
            ;(el as HTMLElement & { __formatter?: typeof formatter }).__formatter = formatter
          }
        }}
      />
    ),
  }
})

// Helper: extract the tooltip formatter from the rendered Tooltip mock
function getFormatter(
  container: HTMLElement,
):
  | ((
      value: unknown,
      name: string,
      props: { payload?: { moodLabel?: string | null } },
    ) => string | null)
  | null {
  const tooltipEl = container.querySelector('[data-testid="recharts-tooltip"]') as
    | (HTMLElement & {
        __formatter?: (value: unknown, name: string, props: object) => string | null
      })
    | null

  return tooltipEl?.__formatter ?? null
}

const baseData = [
  { date: '2026-04-01', mood: 3, moodLabel: 'Hopeful' },
  { date: '2026-04-10', mood: 1, moodLabel: 'Weary' },
  { date: '2026-04-15', mood: 1, moodLabel: 'Sorrowful' },
  { date: '2026-04-20', mood: 1, moodLabel: null },
]

describe('MoodSparkline', () => {
  it('renders a chart when data is present', () => {
    const { container } = render(<MoodSparkline data={baseData} days={30} />)
    expect(container.querySelector('[data-testid="line-chart"]')).toBeInTheDocument()
  })

  it('shows empty state when no data falls within the period', () => {
    render(<MoodSparkline data={[]} days={30} />)
    expect(screen.getByText('No mood data for this period')).toBeInTheDocument()
  })

  it('tooltip formatter returns Weary label+emoji when moodLabel="Weary"', () => {
    const { container } = render(<MoodSparkline data={baseData} days={30} />)
    const formatter = getFormatter(container)
    expect(formatter).not.toBeNull()

    const result = formatter!(1, 'mood', { payload: { moodLabel: 'Weary' } })
    expect(result).toBe('😮‍💨 Weary')
  })

  it('tooltip formatter returns Sorrowful label+emoji when moodLabel="Sorrowful"', () => {
    const { container } = render(<MoodSparkline data={baseData} days={30} />)
    const formatter = getFormatter(container)
    expect(formatter).not.toBeNull()

    const result = formatter!(1, 'mood', { payload: { moodLabel: 'Sorrowful' } })
    expect(result).toBe('😢 Sorrowful')
  })

  it('tooltip formatter falls back to value-based lookup when moodLabel is null (old entries)', () => {
    const { container } = render(<MoodSparkline data={baseData} days={30} />)
    const formatter = getFormatter(container)
    expect(formatter).not.toBeNull()

    // value=1, no moodLabel → should find first MOODS entry with value=1 (Sorrowful)
    const result = formatter!(1, 'mood', { payload: { moodLabel: null } })
    // The fallback finds the first mood in MOODS with value=1, which is Sorrowful
    expect(result).toBe('😢 Sorrowful')
  })

  it('tooltip formatter falls back to value-based lookup when payload has no moodLabel', () => {
    const { container } = render(<MoodSparkline data={baseData} days={30} />)
    const formatter = getFormatter(container)
    expect(formatter).not.toBeNull()

    const result = formatter!(3, 'mood', { payload: {} })
    // value=3 → Hopeful (first with value=3)
    expect(result).toBe('🌱 Hopeful')
  })

  it('tooltip formatter uses moodLabel over value when moodLabel present and value matches different pair member', () => {
    // This is the core fix: value=1 could be Sorrowful OR Weary — moodLabel disambiguates
    const { container } = render(<MoodSparkline data={baseData} days={30} />)
    const formatter = getFormatter(container)
    expect(formatter).not.toBeNull()

    const wearyResult = formatter!(1, 'mood', { payload: { moodLabel: 'Weary' } })
    const sorrowfulResult = formatter!(1, 'mood', { payload: { moodLabel: 'Sorrowful' } })

    expect(wearyResult).toBe('😮‍💨 Weary')
    expect(sorrowfulResult).toBe('😢 Sorrowful')
    // Crucially, they are different even though value is the same
    expect(wearyResult).not.toBe(sorrowfulResult)
  })
})
