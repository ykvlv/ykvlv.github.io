import { Skeleton, cn } from '@/shared'

// The real tile archetypes: wide with a side photo, photo on top, bare text.
const PATTERN = ['wide', 'photo', 'text', 'photo', 'text', 'wide'] as const

export function MosaicSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {PATTERN.map((kind, i) => (
        <div
          key={i}
          className={cn(
            'card-surface overflow-hidden',
            kind === 'wide' && 'sm:col-span-2 sm:flex',
          )}
        >
          {kind === 'wide' && (
            <>
              <Skeleton className="aspect-[3/2] rounded-none sm:hidden" />
              <Skeleton className="hidden sm:block w-2/5 shrink-0 aspect-square rounded-none" />
            </>
          )}
          {kind === 'photo' && (
            <Skeleton className="aspect-[3/2] rounded-none" />
          )}
          <div className="p-4 flex-1 min-w-0">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-5 w-3/4 mb-3" />
            <Skeleton className="h-3 w-full mb-2" />
            <Skeleton className="h-3 w-full mb-2" />
            <Skeleton className="h-3 w-2/3" />
            {i % 2 === 0 && <Skeleton className="h-3 w-1/2 mt-2" />}
          </div>
        </div>
      ))}
    </div>
  )
}
