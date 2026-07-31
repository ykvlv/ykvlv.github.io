import { lazy, Suspense } from 'react'
import { Container } from '@/shared'
import { WhatsnextSkeleton } from './Skeleton'

const WhatsnextContent = lazy(() => import('./WhatsnextContent'))

export default function Whatsnext() {
  return (
    <div className="py-12 sm:py-16">
      <Container>
        <div className="mb-12">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-foreground">
            Whatsnext
          </h1>
          <p className="mt-3 text-muted-foreground">
            Things to do in Saint Petersburg, picked from Telegram channels.
          </p>
        </div>

        <Suspense fallback={<WhatsnextSkeleton />}>
          <WhatsnextContent />
        </Suspense>
      </Container>
    </div>
  )
}
