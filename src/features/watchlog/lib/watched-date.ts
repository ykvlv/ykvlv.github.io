/**
 * Watched date formatting with variable granularity.
 *
 * Format determines precision:
 * - "2025-01-10"  (YYYY-MM-DD) → day   (< 7 days ago)
 * - "2025-W02"    (YYYY-Wnn)   → week  (7-29 days ago)
 * - "2025-01"     (YYYY-MM)    → month (30-364 days ago)
 * - "2025"        (YYYY)       → year  (365+ days ago)
 *
 * Both sides speak zoned dates (see @/shared/lib/zoned-date), so the day the
 * script writes and the day the frontend calls "Today" are the same day for
 * every visitor.
 */

import { differenceInCalendarDays, getISOWeek, getISOWeekYear } from 'date-fns'
import { civilDate, zonedDate } from '@/shared/lib/zoned-date'

export type DateGranularity = 'day' | 'week' | 'month' | 'year'

const THRESHOLDS = { day: 7, week: 30, month: 365 } as const

// ============================================================================
// Granularity
// ============================================================================

export function getGranularity(daysAgo: number): DateGranularity {
  if (daysAgo < THRESHOLDS.day) return 'day'
  if (daysAgo < THRESHOLDS.week) return 'week'
  if (daysAgo < THRESHOLDS.month) return 'month'
  return 'year'
}

// ============================================================================
// Formatting (Script-side)
// ============================================================================

/** `day` is `YYYY-MM-DD`; the slices below depend on that shape. */
export function formatWatchedAt(
  day: string,
  granularity: DateGranularity,
): string {
  switch (granularity) {
    case 'day':
      return day
    case 'week': {
      const civil = civilDate(day)
      return `${getISOWeekYear(civil)}-W${String(getISOWeek(civil)).padStart(2, '0')}`
    }
    case 'month':
      return day.slice(0, 7)
    case 'year':
      return day.slice(0, 4)
  }
}

export function formatWatchedAtAuto(
  isoTimestamp: string,
  referenceInstant: Date = new Date(),
): string {
  const day = zonedDate(new Date(isoTimestamp))
  const today = zonedDate(referenceInstant)
  const daysAgo = differenceInCalendarDays(civilDate(today), civilDate(day))
  return formatWatchedAt(day, getGranularity(daysAgo))
}

// ============================================================================
// Parsing (Frontend-side)
// ============================================================================

const PATTERNS = {
  day: /^(\d{4})-(\d{2})-(\d{2})$/,
  week: /^(\d{4})-W(\d{2})$/,
  month: /^(\d{4})-(\d{2})$/,
  year: /^(\d{4})$/,
} as const

function detectGranularity(watchedAt: string): DateGranularity {
  if (PATTERNS.day.test(watchedAt)) return 'day'
  if (PATTERNS.week.test(watchedAt)) return 'week'
  if (PATTERNS.month.test(watchedAt)) return 'month'
  if (PATTERNS.year.test(watchedAt)) return 'year'
  return 'day'
}

function getRepresentativeDate(
  watchedAt: string,
  granularity: DateGranularity,
): Date {
  switch (granularity) {
    case 'day':
      return civilDate(watchedAt)

    // ISO week date: -4 is Thursday, the middle of the week
    case 'week':
      return civilDate(`${watchedAt}-4`)

    case 'month':
      return civilDate(`${watchedAt}-15`)

    case 'year':
      return civilDate(`${watchedAt}-07-01`)
  }
}

export function parseWatchedAt(watchedAt: string): string {
  const granularity = detectGranularity(watchedAt)
  const date = getRepresentativeDate(watchedAt, granularity)
  const today = civilDate(zonedDate(new Date()))
  const days = differenceInCalendarDays(today, date)

  if (granularity === 'day') {
    // <= rather than ===: a browser clock running behind must still say Today.
    if (days <= 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    // Fallback for old data
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
  }

  if (granularity === 'week') {
    const weeks = Math.max(1, Math.round(days / 7))
    return `${weeks}w ago`
  }

  if (granularity === 'month') {
    const months = Math.max(1, Math.round(days / 30))
    return `${months}mo ago`
  }

  const years = Math.max(1, Math.round(days / 365))
  return `${years}y ago`
}
