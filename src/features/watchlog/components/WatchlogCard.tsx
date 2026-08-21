import { useState } from 'react'
import type { WatchlogItem } from '../types'
import { formatWatchedAtRelative } from '../lib/watched-date'
import { cn } from '@/shared'

interface WatchlogCardProps {
  item: WatchlogItem
}

function getTypeIcon(type: WatchlogItem['type']): string {
  switch (type) {
    case 'movie':
      return 'i-lucide-film'
    case 'episode':
    case 'season':
      return 'i-lucide-clapperboard'
  }
}

export function WatchlogCard({ item }: WatchlogCardProps) {
  const [imgError, setImgError] = useState(false)
  const relativeTime = formatWatchedAtRelative(item.watched_at)
  const typeIcon = getTypeIcon(item.type)

  return (
    <a
      href={item.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden card-interactive"
    >
      {/* Poster with rating badge */}
      <div className="relative aspect-[2/3] bg-muted overflow-hidden">
        {item.poster && !imgError ? (
          <img
            src={item.poster}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="i-lucide-image-off size-12 text-muted-foreground" />
          </div>
        )}

        {/* Rating badge */}
        {item.rating && (
          <div className="badge-overlay flex items-center gap-1 bg-black/60">
            ★ {item.rating}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {item.title}
        </h3>

        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {item.subtitle ? `${item.subtitle} • ${item.year}` : item.year}
        </p>

        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span className={cn(typeIcon, 'size-3.5')} />
          <span>{relativeTime}</span>
        </div>
      </div>
    </a>
  )
}
