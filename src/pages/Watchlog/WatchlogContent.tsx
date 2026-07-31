import { formatDistanceToNowStrict } from 'date-fns'
import {
  useWatchlogData,
  StatsBar,
  Timeline,
  WatchlogCard,
} from '@/features/watchlog'
import { WatchlogSkeleton } from './Skeleton'

export default function WatchlogContent() {
  const { data, isLoading, error } = useWatchlogData()

  if (isLoading) return <WatchlogSkeleton />

  if (error) {
    return (
      <div className="text-center py-12">
        <span className="i-lucide-alert-circle size-12 text-destructive mx-auto mb-4" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    )
  }

  return (
    <>
      {/* Updated at */}
      {data?.updated_at && (
        <p className="-mt-10 mb-12 text-xs text-muted-foreground">
          Last updated:{' '}
          {formatDistanceToNowStrict(new Date(data.updated_at), {
            addSuffix: true,
          })}
        </p>
      )}

      {/* Recently Watched */}
      <section className="mb-16">
        <h2 className="section-heading mb-6">Recently Watched</h2>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {data?.items.map((item, index) => (
            <WatchlogCard key={index} item={item} />
          ))}
        </div>
      </section>

      {/* My Premieres Timeline */}
      <section className="mb-16">
        {/* mb-2, not mb-6, because the timeline has py-4 on cards */}
        <h2 className="section-heading mb-2">My Premieres</h2>
        <Timeline items={data?.calendar ?? []} />
      </section>

      {/* Stats */}
      <section>
        <h2 className="section-heading mb-6">Statistics</h2>
        <StatsBar stats={data?.stats} />
      </section>
    </>
  )
}
