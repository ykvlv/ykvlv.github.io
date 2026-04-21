import { lazy, Suspense } from 'react'
import { Container, Skeleton } from '@/shared'

const AuthGate = lazy(() =>
  import('@/features/playlists').then((m) => ({ default: m.AuthGate })),
)

function getStoredViewMode(): 'compact' | 'cards' {
  try {
    return localStorage.getItem('ykvlv_playlists_view_mode') === 'cards'
      ? 'cards'
      : 'compact'
  } catch {
    return 'compact'
  }
}

export default function Playlists() {
  return (
    <div className="py-12 sm:py-16">
      <Container>
        <div className="mb-10">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-foreground">
            Playlists
          </h1>
          <p className="mt-3 text-muted-foreground">
            Sort liked tracks from Yandex Music into your playlists, with BPM
            detection.
          </p>
        </div>
        <Suspense fallback={<PlaylistsSkeleton />}>
          <AuthGate />
        </Suspense>
      </Container>
    </div>
  )
}

/** Lightweight Suspense fallback — must not import from the lazy chunk. */
function PlaylistsSkeleton() {
  const isCards = getStoredViewMode() === 'cards'
  return (
    <div className="space-y-8">
      {/* UserHeader */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Skeleton className="h-4 w-20 rounded mb-1" />
          <Skeleton className="h-6 w-36 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      </div>

      {/* StatsBar */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <Skeleton className="size-5 rounded shrink-0" />
            <div className="min-w-0">
              <Skeleton className="h-4 w-20 rounded mb-1" />
              <Skeleton className="h-7 w-12 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* PlaylistSelector */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-48 rounded" />
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="flex items-center gap-2 ml-auto">
          <Skeleton className="h-10 w-22 rounded-xl" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      </div>

      {/* TrackList */}
      {isCards ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border overflow-hidden"
            >
              <Skeleton className="aspect-[1/1] rounded-none" />
              <div className="p-3">
                <Skeleton className="h-4 w-3/4 mb-2 rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="size-12 rounded-md shrink-0" />
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-2/3 mb-2 rounded-full" />
                <Skeleton className="h-3 w-1/3 rounded-full" />
              </div>
              <Skeleton className="h-4 w-10 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
