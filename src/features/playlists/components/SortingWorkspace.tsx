import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { YandexTrack } from '../types'
import type { BpmDetectionStatus } from '../hooks/useBpmDetectionQueue'
import { TrackList } from './TrackList'
import { TrackRow } from './TrackRow'
import { Paginator } from './Paginator'
import type { ViewMode } from './ViewToggle'

const noop = () => {}

interface SortingWorkspaceProps {
  tracks: YandexTrack[]
  isLoadingPage: boolean
  currentPage: number
  totalPages: number
  viewMode: ViewMode
  selectedPlaylists: ReadonlyArray<{ kind: number; title: string }>
  pendingAdds: Set<string>
  pendingUnlikeTrackId: string | null
  playingTrackId: string | null
  pausedTrackId: string | null
  getBpm: (trackId: string) => number | null
  getBpmStatus: (trackId: string) => BpmDetectionStatus
  onAdd: (trackId: string, kind: number) => void
  onRequestUnlike: (track: YandexTrack) => void
  onConfirmUnlike: () => void
  onCancelUnlike: () => void
  onDetectBpm: (trackId: string) => void
  onCycleBpm: (trackId: string) => void
  onPageChange: (page: number) => void
  onPlayTrack: (trackId: string) => void
  onTogglePlayPause?: () => void
  onPlayNext?: () => void
  onPlayPrev?: () => void
  onActiveTrackChange?: (trackId: string | null) => void
  audioElement?: HTMLAudioElement | null
}

export const SortingWorkspace = memo(function SortingWorkspace({
  tracks,
  isLoadingPage,
  currentPage,
  totalPages,
  viewMode,
  selectedPlaylists,
  pendingAdds,
  pendingUnlikeTrackId,
  playingTrackId,
  pausedTrackId,
  getBpm,
  getBpmStatus,
  onAdd,
  onRequestUnlike,
  onConfirmUnlike,
  onCancelUnlike,
  onDetectBpm,
  onCycleBpm,
  onPageChange,
  onPlayTrack,
  onTogglePlayPause,
  onPlayNext,
  onPlayPrev,
  onActiveTrackChange,
  audioElement,
}: SortingWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    onActiveTrackChange?.(tracks[activeIndex]?.id ?? null)
  }, [activeIndex, tracks, onActiveTrackChange])

  // Stable refs for use inside keyboard handler (avoid stale closures)
  const stateRef = useRef({
    activeIndex,
    tracks,
    selectedPlaylists,
    currentPage,
    totalPages,
    pendingUnlikeTrackId,
    viewMode,
    playingTrackId,
    pausedTrackId,
  })
  useEffect(() => {
    stateRef.current = {
      activeIndex,
      tracks,
      selectedPlaylists,
      currentPage,
      totalPages,
      pendingUnlikeTrackId,
      viewMode,
      playingTrackId,
      pausedTrackId,
    }
  })

  const audioRef = useRef(audioElement)
  useEffect(() => {
    audioRef.current = audioElement
  })

  // Scroll active row into view on keyboard nav
  const lastActiveSourceRef = useRef<'mouse' | 'keyboard'>('mouse')

  const handleAdd = useCallback(
    (trackId: string, kind: number) => {
      onAdd(trackId, kind)
    },
    [onAdd],
  )

  const handlersRef = useRef({
    handleAdd,
    onRequestUnlike,
    onConfirmUnlike,
    onCancelUnlike,
    onPageChange,
    onTogglePlayPause,
    onPlayNext,
    onPlayPrev,
    onPlayTrack,
  })
  useEffect(() => {
    handlersRef.current = {
      handleAdd,
      onRequestUnlike,
      onConfirmUnlike,
      onCancelUnlike,
      onPageChange,
      onTogglePlayPause,
      onPlayNext,
      onPlayPrev,
      onPlayTrack,
    }
  })

  // Clamp activeIndex when track list shrinks
  useEffect(() => {
    if (tracks.length === 0) {
      setActiveIndex(0)
      return
    }
    setActiveIndex((prev) => Math.min(prev, tracks.length - 1))
  }, [tracks.length])

  // Reset activeIndex on page change
  useEffect(() => {
    setActiveIndex(0)
  }, [currentPage])

  // Follow playing track — when playback switches to a different track, highlight it silently
  useEffect(() => {
    if (!playingTrackId) return
    const idx = tracks.findIndex((t) => t.id === playingTrackId)
    if (idx >= 0 && idx !== activeIndex) {
      lastActiveSourceRef.current = 'mouse' // highlight without scrolling
      setActiveIndex(idx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingTrackId])

  const scrollToTrack = useCallback((trackId: string) => {
    if (!containerRef.current) return
    const row = containerRef.current.querySelector<HTMLElement>(
      `[data-track-id="${CSS.escape(trackId)}"]`,
    )
    if (!row) return
    const rect = row.getBoundingClientRect()
    const topClearance = 72 // sticky header h-14 (56px) + gap
    const bottomClearance = 100 // mini player height + gap
    const viewportBottom = window.innerHeight - bottomClearance
    if (rect.bottom > viewportBottom) {
      window.scrollBy({
        top: rect.bottom - viewportBottom + 16,
        behavior: 'smooth',
      })
    } else if (rect.top < topClearance) {
      window.scrollBy({ top: rect.top - topClearance, behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    if (lastActiveSourceRef.current !== 'keyboard') return
    const track = tracks[activeIndex]
    if (track) scrollToTrack(track.id)
  }, [activeIndex, tracks, scrollToTrack])

  const handleActivate = useCallback((trackId: string) => {
    const idx = stateRef.current.tracks.findIndex((t) => t.id === trackId)
    if (idx >= 0) {
      lastActiveSourceRef.current = 'mouse'
      setActiveIndex(idx)
    }
  }, [])

  // Detect grid column count from the first row of cards
  const getGridCols = useCallback(() => {
    const container = containerRef.current
    if (!container) return 1
    const items = container.querySelectorAll<HTMLElement>('[data-track-id]')
    if (items.length < 2) return 1
    const firstTop = items[0].getBoundingClientRect().top
    let cols = 1
    for (let i = 1; i < items.length; i++) {
      if (items[i].getBoundingClientRect().top !== firstTop) break
      cols++
    }
    return cols
  }, [])

  // Document-level keyboard handler — works regardless of focus
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      const {
        activeIndex: idx,
        tracks: ts,
        selectedPlaylists: pls,
        currentPage: page,
        totalPages: pages,
        pendingUnlikeTrackId: pendingId,
        viewMode: vm,
        playingTrackId: playingId,
        pausedTrackId: pausedId,
      } = stateRef.current

      // Confirm-banner takes priority over normal nav
      if (pendingId !== null) {
        switch (e.key) {
          case 'Backspace':
          case 'Delete':
          case 'Enter':
            e.preventDefault()
            handlersRef.current.onConfirmUnlike()
            return
          case 'Escape':
            e.preventDefault()
            handlersRef.current.onCancelUnlike()
            return
          default:
            return
        }
      }

      if (ts.length === 0) return

      const move = (next: number) => {
        e.preventDefault()
        lastActiveSourceRef.current = 'keyboard'
        setActiveIndex(Math.min(Math.max(0, next), ts.length - 1))
      }

      const isGrid = vm === 'cards'

      switch (
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD'
          ? e.code
          : e.key
      ) {
        case 'ArrowDown':
        case 'KeyS':
          move(isGrid ? idx + getGridCols() : idx + 1)
          return
        case 'ArrowUp':
        case 'KeyW':
          move(isGrid ? idx - getGridCols() : idx - 1)
          return
        case 'ArrowLeft':
        case 'KeyA':
          if (isGrid) move(idx - 1)
          return
        case 'ArrowRight':
        case 'KeyD':
          if (isGrid) move(idx + 1)
          return
        case 'Tab':
          e.preventDefault()
          move(e.shiftKey ? idx - 1 : idx + 1)
          return
        case 'Home':
          move(0)
          return
        case 'End':
          move(ts.length - 1)
          return
        case 'PageDown':
          if (page < pages) {
            e.preventDefault()
            handlersRef.current.onPageChange(page + 1)
          }
          return
        case 'PageUp':
          if (page > 1) {
            e.preventDefault()
            handlersRef.current.onPageChange(page - 1)
          }
          return
        case 'Backspace':
        case 'Delete': {
          const track = ts[idx]
          if (track && track.available) {
            e.preventDefault()
            handlersRef.current.onRequestUnlike(track)
          }
          return
        }
        case 'Enter': {
          const track = ts[idx]
          if (!track || !track.available) return
          if (track.id !== playingId && track.id !== pausedId) {
            e.preventDefault()
            handlersRef.current.onPlayTrack(track.id)
          } else {
            // Already playing/paused — scroll to it
            scrollToTrack(track.id)
          }
          return
        }
      }

      // Space / K → toggle play/pause (e.code for layout-independent keys)
      if (e.key === ' ' || e.code === 'KeyK') {
        e.preventDefault()
        handlersRef.current.onTogglePlayPause?.()
        return
      }

      // J → seek −10s, L → seek +10s
      if (e.code === 'KeyJ' || e.code === 'KeyL') {
        const audio = audioRef.current
        if (audio && audio.src) {
          e.preventDefault()
          const delta = e.code === 'KeyJ' ? -10 : 10
          audio.currentTime = Math.max(
            0,
            Math.min(audio.duration || 0, audio.currentTime + delta),
          )
        }
        return
      }

      // M → mute toggle
      if (e.code === 'KeyM') {
        const audio = audioRef.current
        if (audio) {
          e.preventDefault()
          audio.muted = !audio.muted
        }
        return
      }

      // , → previous track, . → next track (e.code for layout independence)
      if (e.code === 'Comma' || e.code === 'Period') {
        e.preventDefault()
        if (e.code === 'Comma') handlersRef.current.onPlayPrev?.()
        else handlersRef.current.onPlayNext?.()
        return
      }

      // Number keys 1-9 → add to N-th selected playlist
      if (e.key >= '1' && e.key <= '9') {
        const playlistIdx = parseInt(e.key, 10) - 1
        const playlist = pls[playlistIdx]
        const track = ts[idx]
        if (playlist && track && track.available) {
          e.preventDefault()
          handlersRef.current.handleAdd(track.id, playlist.kind)
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [getGridCols, scrollToTrack])

  // Pre-compute per-track booleans (cheap O(1) Set lookups, primitives → memo gates)
  const rows = useMemo(() => {
    return tracks.map((track, index) => ({
      track,
      bpm: getBpm(track.id),
      bpmStatus: getBpmStatus(track.id),
      isAdding: pendingAdds.has(track.id),
      isActive: index === activeIndex,
      isPlaying: track.id === playingTrackId,
      isPaused: track.id === pausedTrackId,
    }))
  }, [
    tracks,
    getBpm,
    getBpmStatus,
    pendingAdds,
    activeIndex,
    playingTrackId,
    pausedTrackId,
  ])

  return (
    <div className="space-y-6">
      <div ref={containerRef}>
        <TrackList viewMode={viewMode} isLoadingPage={isLoadingPage}>
          {rows.map((row) => (
            <TrackRow
              key={row.track.id}
              track={row.track}
              bpm={row.bpm}
              bpmStatus={row.bpmStatus}
              isAdding={row.isAdding}
              isActive={row.isActive}
              isPlaying={row.isPlaying}
              isPaused={row.isPaused}
              viewMode={viewMode}
              selectedPlaylists={selectedPlaylists}
              onActivate={handleActivate}
              onAdd={handleAdd}
              onDetectBpm={onDetectBpm}
              onCycleBpm={onCycleBpm}
              onPlay={onPlayTrack}
              onTogglePlayPause={onTogglePlayPause ?? noop}
            />
          ))}
        </TrackList>
      </div>
      <Paginator
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        disabled={isLoadingPage}
      />
    </div>
  )
})
