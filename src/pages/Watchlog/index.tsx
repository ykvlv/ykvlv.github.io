import { lazy, Suspense } from 'react'
import { Container } from '@/shared'
import { WatchlogSkeleton } from './Skeleton'

const WatchlogContent = lazy(() => import('./WatchlogContent'))

export default function Watchlog() {
  return (
    <div className="py-12 sm:py-16">
      <Container>
        <div className="mb-2">
          <h1 className="page-title">Watchlog</h1>
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
