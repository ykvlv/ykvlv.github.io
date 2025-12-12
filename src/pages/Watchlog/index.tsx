import { Container } from '@/components/layout/Container'
import { useWatchlogData } from '@/hooks/useWatchlogData'
import { StatsBar } from '@/components/watchlog/StatsBar'
import { Timeline } from '@/components/watchlog/Timeline'
import { WatchlogCard } from '@/components/watchlog/WatchlogCard'
import { Skeleton } from '@/components/ui/skeleton'

export default function Watchlog() {
  const { data, isLoading, error } = useWatchlogData()

  return (
    <div className="py-12 sm:py-16">
      <Container>
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-foreground">
            Watchlog
          </h1>
          <p className="mt-3 text-muted-foreground">
            Movies and TV shows I've been watching, synced from Trakt.
          </p>
          {data?.updated_at && (
            <p className="mt-2 text-xs text-muted-foreground">
              Last updated:{' '}
              {new Date(data.updated_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="text-center py-12">
            <span className="i-lucide-alert-circle size-12 text-destructive mx-auto mb-4" />
            <p className="text-muted-foreground">{error}</p>
          </div>
        )}

        {/* Recently Watched */}
        <section className="mb-16">
          <h2 className="font-serif text-2xl font-medium text-foreground mb-6">
            Recently Watched
          </h2>
          {isLoading ? (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border overflow-hidden"
                >
                  <Skeleton className="aspect-[2/3] rounded-none" />
                  <div className="p-3">
                    <Skeleton className="h-5 w-3/4 mb-2 rounded-full" />
                    <Skeleton className="h-4 w-1/2 mb-2 rounded-full" />
                    <Skeleton className="h-3 w-1/3 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {data?.items.map((item, index) => (
                <WatchlogCard key={index} item={item} />
              ))}
            </div>
          )}
        </section>

        {/* My Premieres Timeline */}
        <section className="mb-16">
          {/* mb-2. not mb-6 because the timeline has py-4 on cards */}
          <h2 className="font-serif text-2xl font-medium text-foreground mb-2">
            My Premieres
          </h2>
          {isLoading ? (
            <div className="flex gap-4 overflow-hidden mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-36">
                  <Skeleton className="aspect-[2/3] rounded-2xl mb-3" />
                  <Skeleton className="h-4 w-3/4 mb-2 rounded-full" />
                  <Skeleton className="h-3 w-1/2 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <Timeline items={data?.calendar ?? []} />
          )}
        </section>

        {/* Stats */}
        <section>
          <h2 className="font-serif text-2xl font-medium text-foreground mb-6">
            Statistics
          </h2>
          <StatsBar stats={data?.stats} isLoading={isLoading} />
        </section>
      </Container>
    </div>
  )
}
