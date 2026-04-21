import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/shared'
import type { YandexTrack } from '../types'
import { getCoverUrl, joinArtists } from '../lib/yandex-music-api'
import type { BpmDetectionStatus } from '../hooks/useBpmDetectionQueue'
import { BpmCell } from './BpmCell'
import type { ViewMode } from './ViewToggle'

interface TrackRowProps {
  track: YandexTrack
  bpm: number | null
  bpmStatus: BpmDetectionStatus
  isAdding: boolean
  isActive: boolean
  isPlaying: boolean
  isPaused: boolean
  viewMode: ViewMode
  selectedPlaylists: ReadonlyArray<{ kind: number; title: string }>
  onActivate: (trackId: string) => void
  onAdd: (trackId: string, kind: number) => void
  onDetectBpm: (trackId: string) => void
  onCycleBpm: (trackId: string) => void
  onPlay: (trackId: string) => void
  onTogglePlayPause: () => void
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Shared hook: open/close "add to playlist" overlay
// Mouse: hover over trigger opens, leaving the row closes
// Touch: tap trigger toggles, tap outside closes
// ---------------------------------------------------------------------------

function useAddMode() {
  const [addMode, setAddMode] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mouse: open on hover over trigger button
  const onTriggerPointerEnter = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    hoverRef.current = true
    setAddMode(true)
  }, [])

  // Mouse: close when pointer leaves the row/card
  const onRowPointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !hoverRef.current) return
    hoverRef.current = false
    setAddMode(false)
  }, [])

  // Touch: close when tapping outside the row/card
  useEffect(() => {
    if (!addMode) return
    const handler = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      if (rowRef.current?.contains(e.target as Node)) return
      setAddMode(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [addMode])

  // Toggle (for tap on trigger button)
  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setAddMode((v) => !v)
  }, [])

  // Close after adding to playlist
  const close = useCallback(() => {
    setAddMode(false)
    hoverRef.current = false
  }, [])

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )

  return {
    addMode,
    rowRef,
    onTriggerPointerEnter,
    onRowPointerLeave,
    toggle,
    close,
  }
}

export const TrackRow = memo(function TrackRow(props: TrackRowProps) {
  if (props.viewMode === 'cards') {
    return <CardRow {...props} />
  }
  return <CompactRow {...props} />
})

// ---------------------------------------------------------------------------
// Compact Row
// ---------------------------------------------------------------------------

function CompactRow({
  track,
  bpm,
  bpmStatus,
  isAdding,
  isActive,
  isPlaying,
  isPaused,
  selectedPlaylists,
  onActivate,
  onAdd,
  onDetectBpm,
  onCycleBpm,
  onPlay,
  onTogglePlayPause,
}: TrackRowProps) {
  const {
    addMode,
    rowRef,
    onTriggerPointerEnter,
    onRowPointerLeave,
    toggle,
    close,
  } = useAddMode()
  const unavailable = !track.available

  const handleAdd = useCallback(
    (kind: number) => {
      onAdd(track.id, kind)
      close()
    },
    [onAdd, track.id, close],
  )

  return (
    <div
      ref={rowRef}
      data-track-id={track.id}
      onClick={() => onActivate(track.id)}
      data-active={isActive || undefined}
      className={cn(
        'group relative flex items-center gap-3 px-3 py-2 transition-colors',
        'border-l-2',
        isActive ? 'bg-secondary/40' : 'hover:bg-secondary/20',
        unavailable && 'opacity-50',
      )}
      style={{
        borderLeftColor: isActive ? 'hsl(var(--primary))' : 'transparent',
      }}
      onPointerLeave={onRowPointerLeave}
    >
      <PlayableCover
        track={track}
        size={48}
        isPlaying={isPlaying}
        isPaused={isPaused}
        onPlay={onPlay}
        onTogglePlayPause={onTogglePlayPause}
      />

      {/* Track info + pills (or details) */}
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <div className="min-w-0 shrink truncate">
          <p className="truncate text-sm font-medium text-foreground">
            {track.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {joinArtists(track)}
          </p>
        </div>
        {addMode ? (
          <div
            className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none ml-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedPlaylists.map((p, idx) => (
              <PlaylistPill
                key={p.kind}
                title={p.title}
                shortcut={idx < 9 ? idx + 1 : undefined}
                disabled={isAdding}
                onClick={() => handleAdd(p.kind)}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {unavailable && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border px-1.5 py-0.5 rounded">
                unavailable
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums w-12 text-center">
              {formatDuration(track.durationMs)}
            </span>
            <BpmCell
              trackId={track.id}
              bpm={bpm}
              status={bpmStatus}
              disabled={unavailable}
              variant="compact"
              onDetect={onDetectBpm}
              onCycle={onCycleBpm}
            />
          </div>
        )}
      </div>

      <AddTrigger
        addMode={addMode}
        isAdding={isAdding}
        disabled={unavailable}
        size="h-8 w-8"
        onToggle={toggle}
        onPointerEnter={onTriggerPointerEnter}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card Row
// ---------------------------------------------------------------------------

function CardRow({
  track,
  bpm,
  bpmStatus,
  isAdding,
  isActive,
  isPlaying,
  isPaused,
  selectedPlaylists,
  onActivate,
  onAdd,
  onDetectBpm,
  onCycleBpm,
  onPlay,
  onTogglePlayPause,
}: TrackRowProps) {
  const {
    addMode,
    rowRef,
    onTriggerPointerEnter,
    onRowPointerLeave,
    toggle,
    close,
  } = useAddMode()
  const unavailable = !track.available

  const handleAdd = useCallback(
    (kind: number) => {
      onAdd(track.id, kind)
      close()
    },
    [onAdd, track.id, close],
  )

  return (
    <div
      ref={rowRef}
      data-track-id={track.id}
      onClick={() => onActivate(track.id)}
      data-active={isActive || undefined}
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-card overflow-hidden transition-all',
        isActive
          ? 'border-primary shadow-lg shadow-primary/10'
          : 'border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10',
        unavailable && 'opacity-60',
      )}
      onPointerLeave={onRowPointerLeave}
    >
      <div className="relative aspect-square bg-muted">
        <PlayableCover
          track={track}
          size={400}
          fill
          isPlaying={isPlaying}
          isPaused={isPaused}
          onPlay={onPlay}
          onTogglePlayPause={onTogglePlayPause}
        />

        {/* Playlist overlay on cover */}
        {addMode && (
          <div
            className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm p-1.5 overflow-y-auto overscroll-contain scrollbar-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-0.5 min-h-full justify-center">
              {selectedPlaylists.map((p, idx) => (
                <button
                  key={p.kind}
                  type="button"
                  disabled={isAdding}
                  onClick={() => handleAdd(p.kind)}
                  className="flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 text-sm text-white bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-40 shrink-0"
                >
                  {idx < 9 && (
                    <kbd className="hidden sm:inline text-[10px] font-mono bg-white/20 rounded px-1.5 py-0.5">
                      {idx + 1}
                    </kbd>
                  )}
                  <span className="truncate">{p.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!addMode && (
          <>
            <div className="absolute bottom-2 left-2">
              <BpmCell
                trackId={track.id}
                bpm={bpm}
                status={bpmStatus}
                disabled={unavailable}
                variant="cards"
                onDetect={onDetectBpm}
                onCycle={onCycleBpm}
              />
            </div>
            {unavailable && (
              <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wide bg-black/60 text-white px-1.5 py-0.5 rounded backdrop-blur-sm">
                unavailable
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="min-h-[40px]">
          <p className="font-medium text-sm text-foreground line-clamp-2 leading-tight">
            {track.title}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-1">
            {joinArtists(track)}
          </p>
        </div>
        <div className="flex items-center justify-between mt-auto">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDuration(track.durationMs)}
          </span>
          <AddTrigger
            addMode={addMode}
            isAdding={isAdding}
            disabled={unavailable}
            size="h-7 w-7"
            onToggle={toggle}
            onPointerEnter={onTriggerPointerEnter}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared: Playlist Pill (for compact overlay)
// ---------------------------------------------------------------------------

interface PlaylistPillProps {
  title: string
  shortcut?: number
  disabled: boolean
  onClick: () => void
}

function PlaylistPill({
  title,
  shortcut,
  disabled,
  onClick,
}: PlaylistPillProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      title={shortcut ? `Add to "${title}" (${shortcut})` : `Add to "${title}"`}
      className={cn(
        'group/pill inline-flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors outline-none shrink-0',
        'border border-border bg-card text-foreground',
        'hover:bg-primary hover:border-primary hover:text-primary-foreground',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'h-8 px-2 max-w-[100px]',
      )}
    >
      {shortcut !== undefined && (
        <kbd
          className={cn(
            'hidden sm:inline text-[10px] font-mono leading-none rounded px-1 py-0.5 transition-colors',
            'bg-secondary border border-border text-muted-foreground',
            'group-hover/pill:bg-primary-foreground/20 group-hover/pill:border-primary-foreground/30 group-hover/pill:text-primary-foreground',
          )}
        >
          {shortcut}
        </kbd>
      )}
      <span className="truncate">{title}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Shared: Add Trigger Button (+/×)
// ---------------------------------------------------------------------------

interface AddTriggerProps {
  addMode: boolean
  isAdding: boolean
  disabled: boolean
  size: string
  onToggle: (e: React.MouseEvent) => void
  onPointerEnter: (e: React.PointerEvent) => void
}

function AddTrigger({
  addMode,
  isAdding,
  disabled,
  size,
  onToggle,
  onPointerEnter,
}: AddTriggerProps) {
  return (
    <div
      className="shrink-0"
      onPointerEnter={disabled ? undefined : onPointerEnter}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        title={addMode ? 'Cancel' : 'Add to playlist'}
        className={cn(
          'inline-flex items-center justify-center rounded-lg text-xs font-medium transition-colors outline-none',
          'border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          size,
        )}
      >
        {isAdding ? (
          <span className="i-lucide-loader-2 size-4 animate-spin" />
        ) : (
          <span
            className={cn('size-4', addMode ? 'i-lucide-x' : 'i-lucide-plus')}
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared: Playable Cover
// ---------------------------------------------------------------------------

interface PlayableCoverProps {
  track: YandexTrack
  size: number
  fill?: boolean
  isPlaying: boolean
  isPaused: boolean
  onPlay: (trackId: string) => void
  onTogglePlayPause: () => void
}

function PlayableCover({
  track,
  size,
  fill,
  isPlaying,
  isPaused,
  onPlay,
  onTogglePlayPause,
}: PlayableCoverProps) {
  const unavailable = !track.available
  const isCurrentTrack = isPlaying || isPaused

  const handleClick = unavailable
    ? undefined
    : () => {
        if (isCurrentTrack) {
          onTogglePlayPause()
        } else {
          onPlay(track.id)
        }
      }

  return (
    <div
      className={cn(
        'relative group/cover',
        !unavailable && 'cursor-pointer',
        fill ? 'w-full h-full' : 'shrink-0',
      )}
      style={fill ? undefined : { width: size, height: size }}
      onClick={handleClick}
    >
      <Cover track={track} size={size} fill={fill} />
      {!unavailable && (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-opacity',
            fill ? 'bg-black/30' : 'bg-black/40 rounded-md',
            isCurrentTrack
              ? 'opacity-100'
              : 'opacity-0 @hover:group-hover/cover:opacity-100',
          )}
        >
          <span
            className={cn(
              'text-white',
              isPlaying ? 'i-lucide-pause' : 'i-lucide-play',
              fill ? 'size-8' : 'size-5',
            )}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared: Cover Image
// ---------------------------------------------------------------------------

interface CoverProps {
  track: YandexTrack
  size: number
  fill?: boolean
}

function Cover({ track, size, fill }: CoverProps) {
  const [errored, setErrored] = useState(false)
  const cdnSize = size <= 50 ? '100x100' : size <= 200 ? '200x200' : '400x400'
  const src = track.coverUri ? getCoverUrl(track.coverUri, cdnSize) : null

  if (!src || errored) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-muted-foreground shrink-0',
          fill ? 'absolute inset-0 w-full h-full' : 'rounded-md',
        )}
        style={fill ? undefined : { width: size, height: size }}
      >
        <span
          className="i-lucide-music-2"
          style={{ fontSize: Math.max(16, Math.floor(size / 3)) }}
          aria-hidden="true"
        />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setErrored(true)}
      className={cn(
        'object-cover bg-muted',
        fill ? 'absolute inset-0 w-full h-full' : 'rounded-md shrink-0',
      )}
      style={fill ? undefined : { width: size, height: size }}
    />
  )
}
