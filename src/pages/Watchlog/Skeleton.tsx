import { Skeleton } from '@/shared'

export function WatchlogSkeleton() {
  return (
    <>
      {/* Last updated */}
      <Skeleton className="h-4 w-40 -mt-10 mb-12" />

      {/* Recently Watched */}
      <section className="mb-16">
        <h2 className="section-heading mb-6">Recently Watched</h2>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="card-surface overflow-hidden">
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

      {/* My Premieres */}
      <section className="mb-16">
        <h2 className="section-heading mb-2">My Premieres</h2>
        <div className="flex gap-3 overflow-hidden py-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-36 shrink-0 card-surface overflow-hidden">
              <Skeleton className="aspect-[2/3] rounded-none" />
              <div className="p-3">
                <Skeleton className="h-4 w-3/4 mb-2 rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-5 w-64 max-w-full" />
      </section>

      {/* Statistics */}
      <section>
        <h2 className="section-heading mb-6">Statistics</h2>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 sm:p-6 card-surface text-center">
              <Skeleton className="size-5 mx-auto mb-2" />
              <Skeleton className="h-8 w-16 mx-auto mb-1" />
              <Skeleton className="h-4 w-12 mx-auto" />
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
