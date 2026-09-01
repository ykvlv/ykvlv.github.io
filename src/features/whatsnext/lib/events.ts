import { civilDate, shiftDate } from '@/shared'
import type { WhatsnextEvent } from '../types'

export interface GroupedEvents {
  /** Single days and short ranges, in date order */
  stream: WhatsnextEvent[]
  /** Events running longer than a few days */
  lasting: WhatsnextEvent[]
}

// A range this short is still one visit to plan, so it stays in the stream
const SHORT_RANGE_DAYS = 3

export const isLasting = (e: WhatsnextEvent): boolean =>
  e.date_end !== undefined && e.date_end > shiftDate(e.date, SHORT_RANGE_DAYS)

/** The section's own sort key: start for the stream, end for lasting */
export const sortKey = (e: WhatsnextEvent): string =>
  (isLasting(e) && e.date_end) || e.date

export function groupEvents(events: WhatsnextEvent[]): GroupedEvents {
  // Sorted by the key each section reads, so whatever closes first comes first
  const sorted = [...events].sort(
    (a, b) =>
      sortKey(a).localeCompare(sortKey(b)) || a.title.localeCompare(b.title),
  )

  return {
    stream: sorted.filter((e) => !isLasting(e)),
    lasting: sorted.filter(isLasting),
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
