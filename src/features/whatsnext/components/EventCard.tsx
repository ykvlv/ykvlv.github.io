import { useState } from 'react'
import { cn } from '@/shared'
import type { WhatsnextEvent } from '../types'
import { formatDayLabel, formatEndLabel } from '../lib/events'
import { hashId } from '../lib/hash'

interface EventCardProps {
  event: WhatsnextEvent
  today: string
  /** Two columns, granted by the mosaic */
  wide?: boolean
}

export function EventCard({ event, today, wide }: EventCardProps) {
  const [imgError, setImgError] = useState(false)

  const hasPhoto = Boolean(event.photo)
  const sidePhoto = wide && hasPhoto
  // Hashed, not random: a repack must not flip the side
  const photoRight = ((hashId(`${event.id}@${today}`) >> 8) & 1) === 1

  return (
    <div className={cn(sidePhoto && 'min-h-56')}>
      {/* A broken link keeps its box */}
      {sidePhoto ? (
        <div
          className={cn(
            'absolute inset-y-0 w-2/5 overflow-hidden bg-muted',
            photoRight ? 'right-0' : 'left-0',
          )}
        >
          {imgError ? (
            <div className="size-full flex items-center justify-center">
              <span className="i-lucide-image-off size-12 text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Vertical-video fill: a blurred copy tones the letterbox
                  slack */}
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
            </>
          )}
        </div>
      ) : hasPhoto ? (
        imgError ? (
          <div
            className="w-full bg-muted flex items-center justify-center"
            style={{ aspectRatio: event.photo_ratio }}
          >
            <span className="i-lucide-image-off size-12 text-muted-foreground" />
          </div>
        ) : (
          <img
            src={event.photo}
            alt=""
            loading="lazy"
            className="w-full object-cover"
            // The reserved box: the tile is final height before the photo lands
            style={{ aspectRatio: event.photo_ratio }}
            onError={() => setImgError(true)}
          />
        )
      ) : null}

      <div
        className={cn(
          'p-4 min-w-0',
          sidePhoto && (photoRight ? 'mr-[40%]' : 'ml-[40%]'),
        )}
      >
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
