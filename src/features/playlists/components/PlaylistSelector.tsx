import { memo, useCallback, useMemo } from 'react'
import { cn, Skeleton } from '@/shared'
import type { YandexPlaylist } from '../types'

interface PlaylistSelectorProps {
  playlists: YandexPlaylist[]
  selectedKinds: number[]
  failedKinds: Set<number>
  onChange: (kinds: number[]) => void
  isLoading?: boolean
}

export const PlaylistSelector = memo(function PlaylistSelector({
  playlists,
  selectedKinds,
  failedKinds,
  onChange,
  isLoading,
}: PlaylistSelectorProps) {
  const selectedSet = useMemo(() => new Set(selectedKinds), [selectedKinds])

  const toggle = useCallback(
    (kind: number) => {
      const next = selectedSet.has(kind)
        ? selectedKinds.filter((k) => k !== kind)
        : [...selectedKinds, kind]
      onChange(next)
    },
    [selectedKinds, selectedSet, onChange],
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48 rounded" />
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (playlists.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-lg font-medium text-foreground">
          Destination playlists
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {selectedKinds.length} of {playlists.length} selected
        </span>
      </div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {playlists.map((p) => {
          const failed = failedKinds.has(p.kind)
          const selected = !failed && selectedSet.has(p.kind)
          return (
            <button
              key={p.kind}
              type="button"
              onClick={() => toggle(p.kind)}
              disabled={failed}
              aria-pressed={selected}
              className={cn(
                'group relative flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all outline-none',
                failed
                  ? 'border-destructive/40 bg-destructive/5 opacity-60 cursor-not-allowed'
                  : selected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.title}</p>
                {failed ? (
                  <p className="text-xs text-destructive">Failed to load</p>
                ) : (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {p.trackCount} {p.trackCount === 1 ? 'track' : 'tracks'}
                  </p>
                )}
              </div>
              {failed ? (
                <span
                  className="shrink-0 i-lucide-alert-triangle size-4 text-destructive"
                  aria-hidden="true"
                />
              ) : (
                <span
                  className={cn(
                    'shrink-0 inline-flex items-center justify-center size-5 rounded-md transition-colors',
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-transparent group-hover:border-primary/40',
                  )}
                  aria-hidden="true"
                >
                  <span className="i-lucide-check size-3.5" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
})
