import { useRef, useState, useEffect, useCallback } from 'react'
import type { CalendarItem } from '@/types/watchlog'
import { cn } from '@/lib/utils'

interface TimelineProps {
  items: CalendarItem[]
}

function groupByDate(items: CalendarItem[]): Record<string, CalendarItem[]> {
  return items.reduce(
    (acc, item) => {
      const date = item.date.split('T')[0]
      if (!acc[date]) {
        acc[date] = []
      }
      acc[date].push(item)
      return acc
    },
    {} as Record<string, CalendarItem[]>,
  )
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function Timeline({ items }: TimelineProps) {
  const cardsRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [needsScroll, setNeedsScroll] = useState(false)

  const updateScrollButtons = useCallback(() => {
    if (!cardsRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = cardsRef.current
    setNeedsScroll(scrollWidth > clientWidth)
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }, [])

  // Jelly effect: timeline lags behind cards
  const targetScrollRef = useRef(0)
  const currentScrollRef = useRef(0)
  const animationRef = useRef<number | null>(null)

  // Controls jelly effect smoothness (lower = more delay)
  const LERP_FACTOR = 0.15
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const animateTimelineScroll = useCallback(() => {
    if (!timelineRef.current) return

    // Skip animation for users who prefer reduced motion
    if (prefersReducedMotion) {
      timelineRef.current.scrollLeft = targetScrollRef.current
      currentScrollRef.current = targetScrollRef.current
      animationRef.current = null
      return
    }

    const diff = targetScrollRef.current - currentScrollRef.current
    if (Math.abs(diff) < 0.5) {
      currentScrollRef.current = targetScrollRef.current
      timelineRef.current.scrollLeft = targetScrollRef.current
      animationRef.current = null
      return
    }

    currentScrollRef.current += diff * LERP_FACTOR
    timelineRef.current.scrollLeft = currentScrollRef.current
    animationRef.current = requestAnimationFrame(animateTimelineScroll)
  }, [prefersReducedMotion])

  const syncTimelineScroll = useCallback(() => {
    if (!cardsRef.current) return
    targetScrollRef.current = cardsRef.current.scrollLeft

    if (!animationRef.current) {
      animationRef.current = requestAnimationFrame(animateTimelineScroll)
    }
  }, [animateTimelineScroll])

  useEffect(() => {
    const ref = cardsRef.current
    // Initialize scroll position refs
    if (ref) {
      currentScrollRef.current = ref.scrollLeft
      targetScrollRef.current = ref.scrollLeft
    }
    updateScrollButtons()
    const handleScroll = () => {
      updateScrollButtons()
      syncTimelineScroll()
    }
    ref?.addEventListener('scroll', handleScroll)
    window.addEventListener('resize', updateScrollButtons)
    return () => {
      ref?.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', updateScrollButtons)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [updateScrollButtons, syncTimelineScroll])

  const scroll = (direction: 'left' | 'right') => {
    if (!cardsRef.current) return
    const scrollAmount = cardsRef.current.clientWidth * 0.8
    cardsRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  const grouped = groupByDate(items)
  const sortedDates = Object.keys(grouped).sort()

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No upcoming premieres
      </div>
    )
  }

  return (
    <div className="group/scroll">
      {/* Cards section with buttons centered on it */}
      <div className="relative">
        {/* Left scroll button */}
        {needsScroll && (
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 z-10',
              'w-10 h-10 flex items-center justify-center',
              'rounded-full bg-background/90 border border-border shadow-lg',
              'transition-all duration-200',
              'hover:bg-secondary hover:border-primary/30',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-0 disabled:pointer-events-none',
              'opacity-0 group-hover/scroll:opacity-100',
            )}
            aria-label="Scroll left"
          >
            <span className="i-lucide-chevron-left size-5" />
          </button>
        )}

        {/* Scrollable cards */}
        <div
          ref={cardsRef}
          className="overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex gap-3 min-w-max py-2">
            {sortedDates.map((date) => (
              <div key={date} className="flex gap-3">
                {grouped[date].map((item, idx) => (
                  <TimelineCard key={`${item.title}-${idx}`} item={item} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Right scroll button */}
        {needsScroll && (
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 z-10',
              'w-10 h-10 flex items-center justify-center',
              'rounded-full bg-background/90 border border-border shadow-lg',
              'transition-all duration-200',
              'hover:bg-secondary hover:border-primary/30',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-0 disabled:pointer-events-none',
              'opacity-0 group-hover/scroll:opacity-100',
            )}
            aria-label="Scroll right"
          >
            <span className="i-lucide-chevron-right size-5" />
          </button>
        )}
      </div>

      {/* Timeline - synced scroll with cards */}
      <div
        ref={timelineRef}
        className="overflow-x-hidden mt-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex gap-3 min-w-max">
          {sortedDates.map((date, idx) => (
            <TimelineSegment
              key={date}
              date={date}
              itemCount={grouped[date].length}
              isLast={idx === sortedDates.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface TimelineSegmentProps {
  date: string
  itemCount: number
  isLast: boolean
}

function TimelineSegment({ date, itemCount, isLast }: TimelineSegmentProps) {
  const localDate = parseLocalDate(date)
  const formattedDate = localDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isToday = localDate.getTime() === today.getTime()

  // Width matches cards above: itemCount * cardWidth + (itemCount - 1) * gap
  // Card: w-36 = 144px, gap-3 = 12px
  const segmentWidth = itemCount * 144 + (itemCount - 1) * 12

  return (
    <div className="flex items-center" style={{ width: `${segmentWidth}px` }}>
      {/* Dot */}
      <div
        className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', 'bg-primary')}
      />

      {/* Date label */}
      <span
        className={cn(
          'text-sm font-medium ml-2 whitespace-nowrap',
          isToday ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {isToday ? 'Today' : formattedDate}
      </span>

      {/* Connecting line to next group */}
      {!isLast && <div className="flex-1 h-px bg-border ml-3 min-w-8" />}
    </div>
  )
}

function TimelineCard({ item }: { item: CalendarItem }) {
  return (
    <a
      href={item.trakt_url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group block w-36 rounded-lg overflow-hidden border border-border bg-card',
        'transition-all duration-200',
        'card-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {/* Poster */}
      <div className="aspect-[2/3] bg-muted overflow-hidden">
        {item.poster ? (
          <img
            src={item.poster}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="i-lucide-image-off size-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h4 className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {item.title}
        </h4>
        <p className="text-xs text-muted-foreground truncate mt-0.5 min-h-4">
          {item.subtitle ?? '\u00A0'}
        </p>
      </div>
    </a>
  )
}
