import { Skeleton } from '@/shared'
import { MosaicSkeleton } from '@/features/whatsnext'

export function WhatsnextSkeleton() {
  return (
    <>
      {/* Last updated */}
      <Skeleton className="h-4 w-40 -mt-10 mb-12" />

      <MosaicSkeleton />
    </>
  )
}
