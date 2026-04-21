import { memo, useState } from 'react'
import { cn, Skeleton } from '@/shared'

interface BatchBpmControllerProps {
  pendingCount: number
  isProcessing: boolean
  processedCount: number
  totalCount: number
  onStart: () => void
  onCancel: () => void
  isLoading?: boolean
}

export const BatchBpmController = memo(function BatchBpmController({
  pendingCount,
  isProcessing,
  processedCount,
  totalCount,
  onStart,
  onCancel,
  isLoading,
}: BatchBpmControllerProps) {
  const [confirming, setConfirming] = useState(false)

  if (isLoading) {
    return <Skeleton className="h-10 w-48 rounded-xl" />
  }

  if (isProcessing) {
    const progress = totalCount > 0 ? processedCount / totalCount : 0
    return (
      <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="i-lucide-loader-2 size-4 text-primary animate-spin"
            aria-hidden="true"
          />
          <span className="text-sm text-foreground tabular-nums">
            Analyzing {processedCount}/{totalCount}
          </span>
        </div>
        <div
          className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-destructive transition-colors outline-none rounded px-1"
        >
          <span className="i-lucide-x size-3.5" aria-hidden="true" />
          Cancel
        </button>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
        <span className="text-sm text-foreground">
          Analyze {pendingCount} {pendingCount === 1 ? 'track' : 'tracks'}?
        </span>
        <span className="text-xs text-muted-foreground">cancel anytime</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onStart()
              setConfirming(false)
            }}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors outline-none"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors outline-none"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (pendingCount === 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        <span
          className="i-lucide-check size-4 text-success"
          aria-hidden="true"
        />
        All BPM detected
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title={`Detect BPM for ${pendingCount} tracks`}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground',
        'hover:bg-secondary transition-colors outline-none',
      )}
    >
      <span className="i-lucide-activity size-4" aria-hidden="true" />
      Detect all on page
      <span className="text-xs text-muted-foreground tabular-nums">
        ({pendingCount})
      </span>
    </button>
  )
})
