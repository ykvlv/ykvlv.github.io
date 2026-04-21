import { memo } from 'react'
import { cn } from '@/shared'
import type { YandexTrack } from '../types'
import { joinArtists } from '../lib/yandex-music-api'

interface UnlikeConfirmBannerProps {
  track: YandexTrack | null
  skipChecked: boolean
  onConfirm: () => void
  onCancel: () => void
  onSkipAlwaysChange: (skip: boolean) => void
}

export const UnlikeConfirmBanner = memo(function UnlikeConfirmBanner({
  track,
  skipChecked,
  onConfirm,
  onCancel,
  onSkipAlwaysChange,
}: UnlikeConfirmBannerProps) {
  if (!track) return null
  return (
    <div
      role="alertdialog"
      aria-label="Confirm unlike"
      aria-describedby="unlike-confirm-text"
      className={cn(
        'pointer-events-auto w-full max-w-3xl mx-auto',
        'rounded-2xl border border-destructive/40 bg-destructive/10 backdrop-blur-md',
        'shadow-2xl shadow-black/30 overflow-hidden',
      )}
    >
      <div className="px-3 sm:px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="i-lucide-heart-off size-4 text-destructive shrink-0"
            aria-hidden="true"
          />
          <p
            id="unlike-confirm-text"
            className="text-sm text-foreground min-w-0 flex-1"
          >
            Remove <span className="font-medium">“{track.title}”</span>
            <span className="text-muted-foreground">
              {' '}
              by {joinArtists(track)}
            </span>{' '}
            from likes?
          </p>
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground select-none cursor-pointer">
            <input
              type="checkbox"
              checked={skipChecked}
              onChange={(e) => onSkipAlwaysChange(e.target.checked)}
              className="size-3.5 accent-destructive"
            />
            Don&apos;t ask again
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground',
                'hover:bg-secondary transition-colors outline-none',
              )}
            >
              <span className="i-lucide-x size-3.5" aria-hidden="true" />
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground',
                'hover:bg-destructive/90 transition-colors outline-none',
              )}
              autoFocus
            >
              <span className="i-lucide-check size-3.5" aria-hidden="true" />
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})
