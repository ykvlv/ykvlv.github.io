import { civilDate } from '@/shared'
import type { WhatsnextEvent } from '../types'

export interface GroupedEvents {
  /** One-day events, in date order */
  stream: WhatsnextEvent[]
  /** Events with a duration (`date_end`) */
  lasting: WhatsnextEvent[]
}

export function groupEvents(events: WhatsnextEvent[]): GroupedEvents {
  const sorted = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  )

  return {
    stream: sorted.filter((e) => !e.date_end),
    // Sorted by end date, so whatever closes first – comes first
    lasting: sorted
      .filter((e) => e.date_end)
      .sort((a, b) =>
        (a.date_end as string).localeCompare(b.date_end as string),
      ),
  }
}

/** `2026-07-31` -> `Fri, Jul 31` */
export function formatDayLabel(isoDate: string): string {
  return civilDate(isoDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** `2026-08-16` -> `Aug 16` */
export function formatEndLabel(isoDate: string): string {
  return civilDate(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
