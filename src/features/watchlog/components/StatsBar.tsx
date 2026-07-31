import type { WatchlogStats } from '../types'

export function StatsBar({ stats }: { stats?: WatchlogStats }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard
        label="Movies"
        value={stats?.movies_watched}
        icon="i-lucide-film"
      />
      <StatCard
        label="Shows"
        value={stats?.shows_watched}
        icon="i-lucide-clapperboard"
      />
      <StatCard
        label="Hours"
        value={stats?.total_hours}
        icon="i-lucide-clock"
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value?: number
  icon: string
}) {
  return (
    <div className="p-4 sm:p-6 card-surface text-center">
      <span className={`${icon} size-5 text-primary mx-auto mb-2`} />
      <div className="text-2xl sm:text-3xl font-semibold text-foreground">
        {value ?? 0}
      </div>
      <div className="text-xs sm:text-sm text-muted-foreground">{label}</div>
    </div>
  )
}
