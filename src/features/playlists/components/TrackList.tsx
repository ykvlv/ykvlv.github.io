import { Children, type ReactNode } from 'react'
import { cn, Skeleton } from '@/shared'
import type { ViewMode } from './ViewToggle'

interface TrackListProps {
  viewMode: ViewMode
  isLoadingPage: boolean
  children: ReactNode
}

export function TrackList({
  viewMode,
  isLoadingPage,
  children,
}: TrackListProps) {
  const hasContent = Children.count(children) > 0

  if (viewMode === 'cards') {
    return (
      <div className="relative">
        <div
          className={cn(
            'grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 transition-opacity',
            isLoadingPage && hasContent && 'opacity-60 pointer-events-none',
          )}
        >
          {hasContent ? children : isLoadingPage && <CardSkeletons />}
        </div>
        {isLoadingPage && hasContent && <LoadingOverlay />}
      </div>
    )
  }

  if (!hasContent && isLoadingPage) {
    return <CompactSkeletons />
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex flex-col -mx-4 sm:mx-0 sm:rounded-2xl border-y sm:border border-border bg-card overflow-hidden divide-y divide-border transition-opacity',
          isLoadingPage && 'opacity-60 pointer-events-none',
        )}
      >
        {children}
      </div>
      {isLoadingPage && <LoadingOverlay />}
    </div>
  )
}

function CardSkeletons() {
  return (
    <>
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
    </>
  )
}

export function TrackListSkeleton({
  viewMode = 'compact',
}: {
  viewMode?: ViewMode
}) {
  if (viewMode === 'cards') {
    return (
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <CardSkeletons />
      </div>
    )
  }
  return <CompactSkeletons />
}

function CompactSkeletons() {
  return (
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
  )
}

function LoadingOverlay() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="rounded-full bg-card border border-border shadow-lg px-3 py-1.5 flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className="i-lucide-loader-2 size-4 animate-spin"
          aria-hidden="true"
        />
        Loading page…
      </div>
    </div>
  )
}
