import type { WatchlogStats } from '../types'
import { Skeleton } from '@/shared'

interface StatsBarProps {
  stats?: WatchlogStats
  isLoading: boolean
}

export function StatsBar({ stats, isLoading }: StatsBarProps) {
  return (
    <div className="grid grid-cols-3 gap-4 mb-12">
      <StatCard
        label="Movies"
        value={stats?.movies_watched}
        isLoading={isLoading}
        icon="i-lucide-film"
      />
      <StatCard
        label="Shows"
        value={stats?.shows_watched}
        isLoading={isLoading}
        icon="i-lucide-clapperboard"
      />
      <StatCard
        label="Hours"
        value={stats?.total_hours}
        isLoading={isLoading}
        icon="i-lucide-clock"
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  isLoading,
  icon,
}: {
  label: string
  value?: number
  isLoading: boolean
  icon: string
}) {
  return (
    <div className="p-4 sm:p-6 rounded-2xl border border-border bg-card text-center">
      <span className={`${icon} size-5 text-primary mx-auto mb-2`} />
      {isLoading ? (
        <Skeleton className="h-8 w-16 mx-auto mb-1" />
      ) : (
        <div className="text-2xl sm:text-3xl font-semibold text-foreground">
          {value ?? 0}
        </div>
      )}
      <div className="text-xs sm:text-sm text-muted-foreground">{label}</div>
    </div>
  )
}
