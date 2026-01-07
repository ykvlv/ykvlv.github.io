import { useState } from 'react'
import type { WatchlogItem } from '../types'
import { cn } from '@/shared'

interface WatchlogCardProps {
  item: WatchlogItem
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
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
  const relativeTime = formatRelativeTime(item.watched_at)
  const typeIcon = getTypeIcon(item.type)

  return (
    <a
      href={item.trakt_url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group block rounded-2xl overflow-hidden border border-border bg-card',
        'transition-all duration-200',
        'card-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
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
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-medium">
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
