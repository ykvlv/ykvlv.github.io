/**
 * Watched date formatting with variable granularity.
 *
 * Format determines precision:
 * - "2025-01-10"  (YYYY-MM-DD) → day   (< 7 days ago)
 * - "2025-W02"    (YYYY-Wnn)   → week  (7-29 days ago)
 * - "2025-01"     (YYYY-MM)    → month (30-364 days ago)
 * - "2025"        (YYYY)       → year  (365+ days ago)
 */

import {
  differenceInDays,
  format,
  getISOWeek,
  getISOWeekYear,
  isToday,
  isYesterday,
  setISOWeek,
} from 'date-fns'

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

export function formatWatchedAt(
  date: Date,
  granularity: DateGranularity,
): string {
  switch (granularity) {
    case 'day':
      return format(date, 'yyyy-MM-dd')
    case 'week':
      return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, '0')}`
    case 'month':
      return format(date, 'yyyy-MM')
    case 'year':
      return format(date, 'yyyy')
  }
}

export function formatWatchedAtAuto(
  isoTimestamp: string,
  referenceDate: Date = new Date(),
): string {
  const date = new Date(isoTimestamp)
  const daysAgo = differenceInDays(referenceDate, date)
  const granularity = getGranularity(daysAgo)
  return formatWatchedAt(date, granularity)
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
      return new Date(watchedAt + 'T00:00:00Z')

    case 'week': {
      const match = watchedAt.match(PATTERNS.week)
      if (!match) return new Date(watchedAt)
      const [, yearStr, weekStr] = match
      const year = parseInt(yearStr, 10)
      const week = parseInt(weekStr, 10)
      // Get Thursday of that week (middle of week)
      const weekStart = setISOWeek(new Date(year, 0, 4), week)
      return new Date(weekStart.getTime() + 3 * 24 * 60 * 60 * 1000)
    }

    case 'month':
      return new Date(watchedAt + '-15T00:00:00Z')

    case 'year':
      return new Date(watchedAt + '-07-01T00:00:00Z')
  }
}

export function parseWatchedAt(watchedAt: string): string {
  const granularity = detectGranularity(watchedAt)
  const date = getRepresentativeDate(watchedAt, granularity)
  const now = new Date()

  if (granularity === 'day') {
    if (isToday(date)) return 'Today'
    if (isYesterday(date)) return 'Yesterday'
    const days = differenceInDays(now, date)
    if (days < 7) return `${days}d ago`
    // Fallback for old data
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
  }

  const days = differenceInDays(now, date)

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
