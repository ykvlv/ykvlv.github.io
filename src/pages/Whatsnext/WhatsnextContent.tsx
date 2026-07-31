import { formatDistanceToNowStrict } from 'date-fns'
import { zonedDate } from '@/shared'
import { useWhatsnextData, groupEvents, Mosaic } from '@/features/whatsnext'
import { WhatsnextSkeleton } from './Skeleton'

export default function WhatsnextContent() {
  const { data, isLoading, error } = useWhatsnextData()

  if (isLoading) return <WhatsnextSkeleton />

  if (error) {
    return (
      <div className="text-center py-12">
        <span className="i-lucide-alert-circle size-12 text-destructive mx-auto mb-4" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    )
  }

  const today = zonedDate(new Date())
  const { stream, lasting } = groupEvents(data?.events ?? [])
  const isEmpty = stream.length === 0 && lasting.length === 0

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

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-12">
          <span className="i-lucide-calendar-off size-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Nothing scheduled yet</p>
        </div>
      )}

      {/* Chronological mosaic */}
      {stream.length > 0 && (
        <section className="mb-16">
          <Mosaic events={stream} today={today} />
        </section>
      )}

      {/* Events with a duration live below the one-day news */}
      {lasting.length > 0 && (
        <section>
          <h2 className="section-heading mb-6">Long-running</h2>
          <Mosaic events={lasting} today={today} />
        </section>
      )}
    </>
  )
}
