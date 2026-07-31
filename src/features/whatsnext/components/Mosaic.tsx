import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/shared'
import type { WhatsnextEvent } from '../types'
import { packTiles } from '../lib/pack'
import { EventCard } from './EventCard'
import { MosaicSkeleton } from './MosaicSkeleton'

const GAP = 16

// Container width, not viewport: container-main is capped and padded, so
// these land near the site's sm/lg breakpoints without matching them
const colsFor = (width: number) => (width >= 900 ? 3 : width >= 580 ? 2 : 1)

interface MosaicProps {
  events: WhatsnextEvent[]
  today: string
}

export function Mosaic({ events, today }: MosaicProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef(new Map<string, HTMLDivElement>())
  const [width, setWidth] = useState(0)
  const [heights, setHeights] = useState<Record<string, number>>({})

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    setWidth(el.clientWidth)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Width in the deps is what makes this work at all: at mount tileRefs is
  // empty, because tiles render only once a measured width gives cols > 0
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setHeights((prev) => {
        const next = { ...prev }
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.id
          if (id) next[id] = entry.target.getBoundingClientRect().height
        }
        return next
      })
    })
    for (const el of tileRefs.current.values()) observer.observe(el)
    return () => observer.disconnect()
  }, [events, width])

  const cols = width > 0 ? colsFor(width) : 0
  const colWidth = cols > 0 ? (width - GAP * (cols - 1)) / cols : 0
  // The only rule left: a text-length threshold earned a wide tile too until
  // it turned out to fire for one card in nine. No ratio means an entry from
  // before the script measured them, and a guess is not a measurement
  const isWide = (e: WhatsnextEvent) =>
    cols > 1 && e.photo_ratio !== undefined && e.photo_ratio < 1

  const measured = cols > 0 && events.every((e) => heights[e.id] !== undefined)
  const packing = measured
    ? packTiles(
        events.map((e) => ({
          id: e.id,
          span: isWide(e) ? 2 : 1,
          height: heights[e.id],
        })),
        cols,
        GAP,
      )
    : null
  const posById = new Map(packing?.tiles.map((t) => [t.id, t]))

  // Revealed on the first packing, not a settled one: a reserved photo box
  // means the common tile is already its final height. A demoted wide still
  // remeasures once, within a frame or two, under the fade below
  const show = packing !== null

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ height: packing?.height }}
    >
      {!show && <MosaicSkeleton />}
      {cols > 0 &&
        events.map((event, index) => {
          const pos = posById.get(event.id)
          // Granted span before the wish, which is what the first pass renders
          // and measures: the packer may demote a wide, and width follows it
          const span = pos?.span ?? (isWide(event) ? 2 : 1)
          return (
            // The card surface lives on the positioned wrapper: its height is
            // the granted (possibly stretched) one, so seams get painted over,
            // while the measured node inside keeps its natural height
            <div
              key={event.id}
              aria-hidden={!show}
              className={cn(
                'absolute top-0 left-0 card-surface overflow-hidden',
                !show && 'pointer-events-none',
              )}
              style={{
                width: colWidth * span + GAP * (span - 1),
                height: pos?.height,
                transform: pos
                  ? `translate(${pos.col * (colWidth + GAP)}px, ${pos.y}px)`
                  : undefined,
                opacity: show ? 1 : 0,
                // Opacity only: a transform tween would chase the moving
                // target of a live resize
                transitionProperty: 'opacity',
                transitionDuration: '300ms',
                transitionDelay: show
                  ? `${Math.min(index * 25, 400)}ms`
                  : '0ms',
              }}
            >
              <div
                data-id={event.id}
                ref={(el) => {
                  if (el) tileRefs.current.set(event.id, el)
                  else tileRefs.current.delete(event.id)
                }}
              >
                <EventCard event={event} today={today} wide={span === 2} />
              </div>
            </div>
          )
        })}
    </div>
  )
}
