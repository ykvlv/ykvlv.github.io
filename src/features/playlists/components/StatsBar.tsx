import { memo } from 'react'
import { Skeleton } from '@/shared'

interface StatsBarProps {
  totalLiked: number
  unsorted: number
  selectedPlaylists: number
  isLoading?: boolean
  isLoadingTracks?: boolean
}

export const StatsBar = memo(function StatsBar({
  totalLiked,
  unsorted,
  selectedPlaylists,
  isLoading,
  isLoadingTracks,
}: StatsBarProps) {
  const sorted = Math.max(0, totalLiked - unsorted)
  const trackCountsLoading = isLoading || isLoadingTracks
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      <Stat
        label="Liked total"
        value={totalLiked}
        icon="i-lucide-heart"
        isLoading={isLoading}
      />
      <Stat
        label="Sorted"
        value={sorted}
        icon="i-lucide-check-circle-2"
        isLoading={trackCountsLoading}
      />
      <Stat
        label="Unsorted"
        value={unsorted}
        icon="i-lucide-inbox"
        isLoading={trackCountsLoading}
      />
      <Stat
        label="Active playlists"
        value={selectedPlaylists}
        icon="i-lucide-list-music"
        isLoading={isLoading}
      />
    </div>
  )
})

interface StatProps {
  label: string
  value: number
  icon: string
  isLoading?: boolean
}

function Stat({ label, value, icon, isLoading }: StatProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span
        className={`${icon} size-5 text-muted-foreground shrink-0`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground truncate">
          {label}
        </p>
        {isLoading ? (
          <Skeleton className="h-7 w-12 rounded" />
        ) : (
          <p className="text-xl font-semibold text-foreground tabular-nums">
            {value}
          </p>
        )}
      </div>
    </div>
  )
}
