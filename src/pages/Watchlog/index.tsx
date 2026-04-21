import { lazy, Suspense } from 'react'
import { Container, Skeleton } from '@/shared'

const WatchlogContent = lazy(() => import('./WatchlogContent'))

export default function Watchlog() {
  return (
    <div className="py-12 sm:py-16">
      <Container>
        <div className="mb-12">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-foreground">
            Watchlog
          </h1>
          <p className="mt-3 text-muted-foreground">
            Movies and TV shows I've been watching, synced from Trakt.
          </p>
        </div>

        <Suspense fallback={<WatchlogSkeleton />}>
          <WatchlogContent />
        </Suspense>
      </Container>
    </div>
  )
}

function WatchlogSkeleton() {
  return (
    <>
      {/* Recently Watched skeleton */}
      <section className="mb-16">
        <h2 className="font-serif text-2xl font-medium text-foreground mb-6">
          Recently Watched
        </h2>
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
      </section>

      {/* My Premieres skeleton */}
      <section className="mb-16">
        <h2 className="font-serif text-2xl font-medium text-foreground mb-2">
          My Premieres
        </h2>
        <div className="flex gap-4 overflow-hidden mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-36">
              <Skeleton className="aspect-[2/3] rounded-2xl mb-3" />
              <Skeleton className="h-4 w-3/4 mb-2 rounded-full" />
              <Skeleton className="h-3 w-1/2 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Statistics skeleton */}
      <section>
        <h2 className="font-serif text-2xl font-medium text-foreground mb-6">
          Statistics
        </h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <Skeleton className="size-5 rounded shrink-0" />
              <div>
                <Skeleton className="h-4 w-16 rounded mb-1" />
                <Skeleton className="h-7 w-12 rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
