import { Skeleton } from '@/shared'
import { MosaicSkeleton } from '@/features/whatsnext'

export function WhatsnextSkeleton() {
  return (
    <>
      {/* Last updated */}
      <Skeleton className="h-4 w-40 mb-12" />

      {/* "Coming up" skeleton */}
      <section className="mb-16">
        <h2 className="section-heading mb-6">Coming up</h2>
        <MosaicSkeleton />
      </section>
    </>
  )
}
