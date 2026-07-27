/**
 * The site has exactly one time zone, and this is the only file that knows
 * which one: a moment travels as a UTC ISO string, and the moment it has to
 * become a day it becomes a day in that zone. Move the site and you edit the
 * constant below, nothing else.
 */

import { addDays, format, parseISO } from 'date-fns'

const TIME_ZONE = 'Europe/Moscow'

/** The calendar date an instant fell on in the site's zone, `YYYY-MM-DD`. */
export function zonedDate(instant: Date): string {
  // sv-SE is the shortest way to get a YYYY-MM-DD string for a given zone.
  return instant.toLocaleDateString('sv-SE', { timeZone: TIME_ZONE })
}

/** A calendar date as a Date at *local* midnight, which is what date-fns reads. */
export function civilDate(isoDate: string): Date {
  return parseISO(isoDate)
}

/** `2025-01-10`, -1 -> `2025-01-09`. */
export function shiftDate(isoDate: string, days: number): string {
  return format(addDays(civilDate(isoDate), days), 'yyyy-MM-dd')
}

/** `2025-01-10` -> `2025-01-10 (Fri)`. */
export function withWeekday(isoDate: string): string {
  return `${isoDate} (${format(civilDate(isoDate), 'EEE')})`
}
