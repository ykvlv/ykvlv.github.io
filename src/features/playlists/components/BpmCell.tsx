import { memo } from 'react'
import { cn } from '@/shared'
import type { BpmDetectionStatus } from '../hooks/useBpmDetectionQueue'

interface BpmCellProps {
  trackId: string
  bpm: number | null
  status: BpmDetectionStatus
  disabled?: boolean
  variant?: 'compact' | 'cards'
  onDetect: (trackId: string) => void
  onCycle: (trackId: string) => void
}

const SIZE = {
  compact: 'h-8 w-[72px] px-2 text-xs',
  cards: 'h-7 min-w-[64px] px-2 text-xs',
} as const

const PENDING_STYLE =
  'bg-secondary/50 border border-dashed border-border text-foreground'

export const BpmCell = memo(function BpmCell({
  trackId,
  bpm,
  status,
  disabled,
  variant = 'compact',
  onDetect,
  onCycle,
}: BpmCellProps) {
  const base = cn(
    'inline-flex items-center justify-center gap-1 rounded-md font-medium tabular-nums outline-none transition-colors',
    SIZE[variant],
  )

  if (bpm !== null) {
    return (
      <button
        type="button"
        onClick={() => onCycle(trackId)}
        title="Click to cycle BPM multiplier (×1 → ×2 → ×0.5)"
        className={cn(
          base,
          'bg-secondary text-foreground hover:bg-secondary/70',
        )}
      >
        <span>{bpm}</span>
        <span className="text-muted-foreground">bpm</span>
      </button>
    )
  }

  if (status !== 'idle') {
    const icon =
      status === 'queued'
        ? 'i-lucide-clock size-3'
        : 'i-lucide-loader-2 size-3 animate-spin'
    const label =
      status === 'queued' ? 'queued' : status === 'fetching' ? 'load' : 'scan'
    const title =
      status === 'queued'
        ? 'Queued for analysis'
        : status === 'fetching'
          ? 'Downloading audio'
          : 'Analyzing BPM'

    return (
      <span className={cn(base, PENDING_STYLE)} title={title}>
        <span className={icon} aria-hidden="true" />
        <span>{label}</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onDetect(trackId)}
      disabled={disabled}
      title="Detect BPM (downloads audio + analyzes)"
      className={cn(
        base,
        PENDING_STYLE,
        'hover:bg-secondary hover:border-solid',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-secondary/50',
      )}
    >
      <span className="i-lucide-activity size-3" aria-hidden="true" />
      <span>detect</span>
    </button>
  )
})
