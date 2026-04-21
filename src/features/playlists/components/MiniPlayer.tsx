import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { cn, useTheme } from '@/shared'
import type { YandexTrack } from '../types'
import { getCoverUrl } from '../lib/yandex-music-api'
import {
  type PlayerStatus,
  getStoredVolume,
  toAudioVolume,
  VOLUME_KEY,
} from '../hooks/useAudioPlayer'

interface MiniPlayerProps {
  track: YandexTrack
  status: PlayerStatus
  audioElement: HTMLAudioElement
  hasNext: boolean
  hasPrev: boolean
  canDownload: boolean
  isUnliking: boolean
  onTogglePlayPause: () => void
  onNext: () => void
  onPrev: () => void
  onDownload: () => void
  onUnlike: () => void
  onStop: () => void
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ]
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export const MiniPlayer = memo(function MiniPlayer({
  track,
  status,
  audioElement,
  hasNext,
  hasPrev,
  canDownload,
  isUnliking,
  onTogglePlayPause,
  onNext,
  onPrev,
  onDownload,
  onUnlike,
  onStop,
}: MiniPlayerProps) {
  const { resolvedTheme } = useTheme()

  // ---- Internal time state, driven by audio element events ----
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(track.durationMs / 1000)
  const [buffered, setBuffered] = useState(0)
  const lastTimeRef = useRef(0)

  useEffect(() => {
    setCurrentTime(0)
    setDuration(track.durationMs / 1000)
    setBuffered(0)
    lastTimeRef.current = 0
  }, [track.id, track.durationMs])

  useEffect(() => {
    const audio = audioElement

    const onTimeUpdate = () => {
      const t = audio.currentTime
      if (Math.abs(t - lastTimeRef.current) >= 0.25) {
        lastTimeRef.current = t
        setCurrentTime(t)
      }
    }

    const onDurationChange = () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration)
      }
    }

    const onProgress = () => {
      if (
        audio.buffered.length > 0 &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0
      ) {
        const end = audio.buffered.end(audio.buffered.length - 1)
        setBuffered((end / audio.duration) * 100)
      }
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onDurationChange)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('progress', onProgress)

    // Sync initial values
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration)
    }
    if (audio.currentTime > 0) {
      setCurrentTime(audio.currentTime)
      lastTimeRef.current = audio.currentTime
    }

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onDurationChange)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('progress', onProgress)
    }
  }, [audioElement])

  // ---- Internal volume state, synced with audio element ----
  const [volume, setVolume] = useState(getStoredVolume)
  const [isMuted, setIsMuted] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync mute/volume when changed externally (e.g. M key)
  useEffect(() => {
    const audio = audioElement
    const onVolumeChange = () => {
      setIsMuted(audio.muted)
    }
    audio.addEventListener('volumechange', onVolumeChange)
    return () => audio.removeEventListener('volumechange', onVolumeChange)
  }, [audioElement])

  const handleVolumeChange = useCallback(
    (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol))
      setVolume(clamped)
      setIsMuted(false)
      audioElement.volume = toAudioVolume(clamped)

      // Debounce localStorage write
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(VOLUME_KEY, String(clamped))
        } catch {
          // localStorage unavailable
        }
      }, 300)
    },
    [audioElement],
  )

  const handleToggleMute = useCallback(() => {
    audioElement.muted = !audioElement.muted
  }, [audioElement])

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // ---- Seek handler ----
  const handleSeek = useCallback(
    (time: number) => {
      audioElement.currentTime = time
      lastTimeRef.current = time
      setCurrentTime(time)
    },
    [audioElement],
  )

  // ---- Render ----
  const [r, g, b] = parseHex(track.derivedColors?.miniPlayer ?? '#6366f1')
  const rgb = `${r}, ${g}, ${b}`

  const tintOpacity = resolvedTheme === 'light' ? 0.06 : 0.12
  const progressOpacity = resolvedTheme === 'light' ? 0.15 : 0.21

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const thumbRef = useRef<HTMLDivElement>(null)
  const dragPctRef = useRef<number | null>(null)

  const isLoading = status === 'loading'
  const isPlaying = status === 'playing'

  const coverSrc = track.coverUri
    ? getCoverUrl(track.coverUri, '100x100')
    : null

  const artists =
    track.artists.map((a) => a.name).join(', ') || 'Unknown artist'

  return (
    <div
      className="fixed bottom-0 sm:bottom-4 left-0 right-0 z-30 sm:px-6 lg:px-8 pointer-events-none"
      role="region"
      aria-label="Music player"
    >
      <div className="max-w-none sm:max-w-[min(clamp(70%,121.43%-200px,90%),960px)] mx-auto pointer-events-auto">
        <div className="relative">
          <div
            className={cn(
              'relative sm:rounded-2xl overflow-hidden touch-none',
              'bg-background/80 backdrop-blur-md',
              'sm:border-0',
              'shadow-none sm:shadow-2xl sm:shadow-black/20',
            )}
          >
            {/* Background tint */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `rgba(${rgb}, ${tintOpacity})` }}
            />

            {/* Seekable progress bar — also renders the background fill */}
            <ProgressBar
              progress={progress}
              buffered={buffered}
              duration={duration}
              rgb={rgb}
              progressOpacity={progressOpacity}
              resolvedTheme={resolvedTheme}
              onSeek={handleSeek}
              thumbRef={thumbRef}
              dragPctRef={dragPctRef}
            />

            {/* Content */}
            <div className="relative z-10 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2">
              {/* Cover — click to scroll to track in list */}
              <div
                className="shrink-0 size-12 rounded-md overflow-hidden bg-muted cursor-pointer"
                onClick={() => {
                  document
                    .querySelector<HTMLElement>(
                      `[data-track-id="${CSS.escape(track.id)}"]`,
                    )
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
              >
                {coverSrc ? (
                  <img
                    src={coverSrc}
                    alt=""
                    width={48}
                    height={48}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center text-muted-foreground">
                    <span
                      className="i-lucide-music-2 size-5"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {track.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {artists}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center">
                <PlayerButton
                  icon="i-lucide-skip-back"
                  label="Previous track"
                  onClick={onPrev}
                  disabled={!hasPrev}
                  className="hidden sm:inline-flex"
                />
                <PlayerButton
                  icon={
                    isLoading
                      ? 'i-lucide-loader-2 animate-spin'
                      : isPlaying
                        ? 'i-lucide-pause'
                        : 'i-lucide-play'
                  }
                  label={isPlaying ? 'Pause' : 'Play'}
                  onClick={onTogglePlayPause}
                  disabled={isLoading}
                  size="lg"
                />
                <PlayerButton
                  icon="i-lucide-skip-forward"
                  label="Next track"
                  onClick={onNext}
                  disabled={!hasNext}
                />
              </div>

              {/* Time */}
              <span className="hidden sm:block shrink-0 text-xs text-muted-foreground tabular-nums text-center">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              {/* Volume */}
              <VolumeControl
                volume={volume}
                isMuted={isMuted}
                onVolumeChange={handleVolumeChange}
                onToggleMute={handleToggleMute}
              />

              {/* Actions */}
              <div className="flex items-center gap-1">
                <PlayerButton
                  icon={
                    canDownload
                      ? 'i-lucide-download'
                      : 'i-lucide-loader-2 animate-spin'
                  }
                  label={canDownload ? 'Download track' : 'Loading...'}
                  onClick={onDownload}
                  disabled={!canDownload}
                />
                <PlayerButton
                  icon={
                    isUnliking
                      ? 'i-lucide-loader-2 animate-spin'
                      : 'i-lucide-heart-off'
                  }
                  label="Unlike track"
                  onClick={onUnlike}
                  disabled={isUnliking}
                />
                <PlayerButton
                  icon="i-lucide-x"
                  label="Close player"
                  onClick={onStop}
                />
              </div>
            </div>
          </div>

          {/* Thumb — outside overflow-hidden so it can protrude above the player */}
          <div
            ref={thumbRef}
            className="absolute -translate-x-1/2 size-4 rounded-full pointer-events-none z-30 transition-[left] duration-200 ease-linear"
            style={{
              top: -3,
              left: `${dragPctRef.current ?? progress}%`,
              background: `rgb(${rgb})`,
            }}
          />
        </div>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  progress: number
  buffered: number
  duration: number
  rgb: string
  progressOpacity: number
  resolvedTheme: 'light' | 'dark'
  onSeek: (time: number) => void
  thumbRef: React.RefObject<HTMLDivElement | null>
  dragPctRef: React.MutableRefObject<number | null>
}

function ProgressBar({
  progress,
  buffered,
  duration,
  rgb,
  progressOpacity,
  resolvedTheme,
  onSeek,
  thumbRef,
  dragPctRef,
}: ProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const bgFillRef = useRef<HTMLDivElement>(null)
  const barFillRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const barOpacity = resolvedTheme === 'light' ? 0.25 : 0.35

  const ratioFromEvent = useCallback((clientX: number): number => {
    const bar = barRef.current
    if (!bar) return 0
    const rect = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const setFillWidth = useCallback(
    (pct: string) => {
      if (bgFillRef.current) bgFillRef.current.style.width = pct
      if (barFillRef.current) barFillRef.current.style.width = pct
      if (thumbRef.current) thumbRef.current.style.left = pct
    },
    [thumbRef],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      bgFillRef.current?.style.setProperty('transition', 'none')
      barFillRef.current?.style.setProperty('transition', 'none')
      thumbRef.current?.style.setProperty('transition', 'none')
      const pct = ratioFromEvent(e.clientX) * 100
      dragPctRef.current = pct
      setFillWidth(`${pct}%`)
    },
    [ratioFromEvent, setFillWidth, thumbRef, dragPctRef],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      const pct = ratioFromEvent(e.clientX) * 100
      dragPctRef.current = pct
      setFillWidth(`${pct}%`)
    },
    [ratioFromEvent, setFillWidth, dragPctRef],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      isDragging.current = false
      dragPctRef.current = null
      bgFillRef.current?.style.removeProperty('transition')
      barFillRef.current?.style.removeProperty('transition')
      thumbRef.current?.style.removeProperty('transition')
      const ratio = ratioFromEvent(e.clientX)
      if (duration > 0) onSeek(ratio * duration)
    },
    [ratioFromEvent, duration, onSeek, dragPctRef, thumbRef],
  )

  const handlePointerCancel = useCallback(() => {
    isDragging.current = false
    dragPctRef.current = null
    bgFillRef.current?.style.removeProperty('transition')
    barFillRef.current?.style.removeProperty('transition')
    thumbRef.current?.style.removeProperty('transition')
  }, [dragPctRef, thumbRef])

  // During drag, React renders use drag position so re-renders don't fight DOM updates
  const displayPct = dragPctRef.current ?? progress
  const width = `${displayPct}%`

  return (
    <>
      {/* Background fill across entire player */}
      <div
        ref={bgFillRef}
        className="absolute left-0 top-0 bottom-0 pointer-events-none transition-[width] duration-200 ease-linear"
        style={{ width, background: `rgba(${rgb}, ${progressOpacity})` }}
      />
      {/* Thin seekable bar at top */}
      <div
        ref={barRef}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        tabIndex={-1}
        className="relative z-20 h-2 transition-all cursor-pointer group touch-action-none outline-none"
        style={{ background: `rgba(${rgb}, ${barOpacity * 0.25})` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Buffered fill */}
        <div
          className="absolute left-0 top-0 h-full transition-[width] duration-300 ease-linear"
          style={{
            width: `${buffered}%`,
            background: `rgba(${rgb}, ${barOpacity * 0.25})`,
          }}
        />
        {/* Playback progress fill */}
        <div
          ref={barFillRef}
          className="absolute left-0 top-0 h-full rounded-r-sm transition-[width] duration-200 ease-linear"
          style={{ width, background: `rgba(${rgb}, ${barOpacity})` }}
        />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Player Button
// ---------------------------------------------------------------------------

interface PlayerButtonProps {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
  size?: 'sm' | 'lg'
  className?: string
}

function PlayerButton({
  icon,
  label,
  onClick,
  disabled,
  size = 'sm',
  className,
}: PlayerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors outline-none',
        'text-foreground hover:bg-secondary/60',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
        size === 'lg' ? 'size-10' : 'size-8',
        className,
      )}
    >
      <span
        className={cn(icon, size === 'lg' ? 'size-5' : 'size-4')}
        aria-hidden="true"
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Volume Control
// ---------------------------------------------------------------------------

interface VolumeControlProps {
  volume: number
  isMuted: boolean
  onVolumeChange: (vol: number) => void
  onToggleMute: () => void
}

function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
}: VolumeControlProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const effectiveVolume = isMuted ? 0 : volume
  const volumeIcon =
    isMuted || effectiveVolume === 0
      ? 'i-lucide-volume-x'
      : effectiveVolume < 0.5
        ? 'i-lucide-volume-1'
        : 'i-lucide-volume-2'

  const applyFromEvent = useCallback(
    (clientX: number) => {
      const bar = barRef.current
      if (!bar) return
      const rect = bar.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      onVolumeChange(ratio)
    },
    [onVolumeChange],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      applyFromEvent(e.clientX)
    },
    [applyFromEvent],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      applyFromEvent(e.clientX)
    },
    [applyFromEvent],
  )

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  return (
    <div className="hidden md:flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
        title={isMuted ? 'Unmute' : 'Mute'}
        className="inline-flex items-center justify-center size-8 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/60 outline-none"
      >
        <span className={cn(volumeIcon, 'size-4')} aria-hidden="true" />
      </button>
      <div
        ref={barRef}
        role="slider"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(effectiveVolume * 100)}
        tabIndex={-1}
        className="relative w-20 h-3 flex items-center cursor-pointer outline-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-x-0 h-1 rounded-full bg-muted">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-muted-foreground"
            style={{ width: `${effectiveVolume * 100}%` }}
          />
        </div>
        <div
          className="absolute size-3 rounded-full bg-muted-foreground -translate-x-1/2"
          style={{ left: `${effectiveVolume * 100}%` }}
        />
      </div>
    </div>
  )
}
