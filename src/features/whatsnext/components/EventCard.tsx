import { useState } from 'react'
import { cn } from '@/shared'
import type { WhatsnextEvent } from '../types'
import { formatDayLabel, formatEndLabel } from '../lib/events'

interface EventCardProps {
  event: WhatsnextEvent
  today: string
  /** Two columns, granted by the mosaic; only a portrait photo earns it */
  wide?: boolean
}

export function EventCard({ event, today, wide }: EventCardProps) {
  const [imgError, setImgError] = useState(false)

  const hasPhoto = Boolean(event.photo) && !imgError
  // A dead link only drops the photo: the granted width stays two columns
  const sidePhoto = wide && hasPhoto
  // Hashed from the id, not random: the side must not flip on every repack
  const photoRight =
    [...event.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 1

  // Expired events stay until the sync script sweeps them
  const isOver = (event.date_end ?? event.date) < today

  // The card surface and rounding live on the mosaic wrapper, see Mosaic.tsx
  return (
    <div
      className={cn(
        sidePhoto && 'flex',
        sidePhoto && photoRight && 'flex-row-reverse',
        isOver && 'opacity-60 grayscale',
      )}
    >
      {/* No placeholder: a broken photo link collapses the card to text */}
      {sidePhoto ? (
        // min-h floors the photo column: two lines of text would squash it
        <div className="relative w-2/5 shrink-0 min-h-56 overflow-hidden">
          {/* Vertical-video fill: a blurred copy tones the letterbox slack */}
          <img
            src={event.photo}
            alt=""
            aria-hidden
            loading="lazy"
            className="absolute inset-0 size-full object-cover blur-xl scale-110"
          />
          <img
            src={event.photo}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-contain"
            onError={() => setImgError(true)}
          />
        </div>
      ) : hasPhoto ? (
        <img
          src={event.photo}
          alt=""
          loading="lazy"
          className="w-full object-cover"
          // An entry minted before the script measured ratios has none: a
          // guessed box would crop, an absent one costs that tile one repack
          style={{ aspectRatio: event.photo_ratio }}
          onError={() => setImgError(true)}
        />
      ) : null}

      <div className="p-4 min-w-0 flex-1">
        {/* A running event shows only its end date - the start is old news */}
        <p className="text-xs font-medium text-primary mb-2">
          {[
            (event.date >= today || !event.date_end) &&
              (event.date === today ? 'today' : formatDayLabel(event.date)),
            event.date_end && `until ${formatEndLabel(event.date_end)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <h3 className="font-medium text-foreground">{event.title}</h3>

        <p className="mt-2 text-sm text-muted-foreground">
          {event.description}
        </p>

        {/* Post ids only when there are several, or the labels would repeat */}
        <div className="mt-3 flex flex-wrap gap-x-3 text-xs">
          {event.source_posts.map((post) => (
            <a
              key={post}
              href={`https://t.me/${post}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors focusable"
            >
              @{event.source_posts.length > 1 ? post : post.split('/')[0]}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
