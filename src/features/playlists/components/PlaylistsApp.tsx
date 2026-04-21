import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePlaylistsData } from '../hooks/usePlaylistsData'
import { useBpmCache } from '../hooks/useBpmCache'
import { useBpmAnalyzer } from '../hooks/useBpmAnalyzer'
import { useBpmDetectionQueue } from '../hooks/useBpmDetectionQueue'
import { YandexMusicAPI } from '../lib/yandex-music-api'
import type { YandexTrack, YandexUserInfo } from '../types'
import { cn } from '@/shared'
import { ToastProvider } from './ErrorToast'
import { useToasts } from '../hooks/useToasts'
import { UserHeader } from './UserHeader'
import { StatsBar } from './StatsBar'
import { PlaylistSelector } from './PlaylistSelector'
import { ViewToggle, type ViewMode } from './ViewToggle'
import { BatchBpmController } from './BatchBpmController'
import { SortingWorkspace } from './SortingWorkspace'
import { TrackListSkeleton } from './TrackList'
import { MiniPlayer } from './MiniPlayer'
import { KeyboardHelp, KeyboardHelpButton } from './KeyboardHelp'
import { NoPlaylists, AllSorted } from './EmptyStates'
import { UnlikeConfirmBanner } from './UnlikeConfirmBanner'
import { useAudioPlayer } from '../hooks/useAudioPlayer'

const VIEW_MODE_KEY = 'ykvlv_playlists_view_mode'
const SKIP_UNLIKE_CONFIRM_KEY = 'ykvlv_playlists_skip_unlike_confirm'

interface PlaylistsAppProps {
  user: YandexUserInfo
  token: string
  onLogout: () => void
}

export function PlaylistsApp(props: PlaylistsAppProps) {
  return (
    <ToastProvider>
      <PlaylistsAppInner {...props} />
    </ToastProvider>
  )
}

function PlaylistsAppInner({ user, token, onLogout }: PlaylistsAppProps) {
  const { pushToast } = useToasts()

  const api = useMemo(() => new YandexMusicAPI(token), [token])

  const { data, selection, pagination, mutations, status } = usePlaylistsData({
    api,
    uid: user.uid,
  })

  const { getBpm, setBpm, cycleBpmMultiplier } = useBpmCache()
  const { analyzeBpm } = useBpmAnalyzer()

  const handleBpmError = useCallback(
    (_trackId: string, message: string) => {
      pushToast(`BPM detect: ${message}`, 'error')
    },
    [pushToast],
  )

  const queue = useBpmDetectionQueue({
    api,
    setBpm,
    analyzeBpm,
    onError: handleBpmError,
  })

  // Ref breaks circular dep: handlePlaybackStart needs player.swapToBlob,
  // but player needs handlePlaybackStart. The ref is populated after player init.
  const swapToBlobRef = useRef<
    ((trackId: string, buffer: ArrayBuffer) => void) | undefined
  >(undefined)

  const handlePlaybackStart = useCallback(
    (trackId: string, downloadUrl: string) => {
      const hasBpm = getBpm(trackId) !== null
      queue.detectWithUrl(trackId, downloadUrl, {
        onBuffer: (buffer) => swapToBlobRef.current?.(trackId, buffer),
        skipAnalysis: hasBpm,
      })
    },
    [getBpm, queue],
  )

  const [activeTrackId, setActiveTrackId] = useState<string | null>(null)

  const player = useAudioPlayer({
    api,
    tracks: pagination.currentPageTracks,
    activeTrackId,
    onError: (msg) => pushToast(`Player: ${msg}`, 'error'),
    onPlaybackStart: handlePlaybackStart,
    onBeforePlay: queue.cancelPlaybackDetection,
  })

  useEffect(() => {
    swapToBlobRef.current = player.swapToBlob
  })

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'compact'
    const stored = window.localStorage.getItem(VIEW_MODE_KEY)
    return stored === 'cards' || stored === 'compact' ? stored : 'compact'
  })

  useEffect(() => {
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  const [helpOpen, setHelpOpen] = useState(false)

  // Global "?" toggle for help, listened on document so it works anywhere
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '?') return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      setHelpOpen((v) => !v)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const selectedPlaylistsResolved = useMemo(() => {
    return selection.selectedPlaylistKinds
      .map((kind) => data.playlists.find((p) => p.kind === kind))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map(({ kind, title }) => ({ kind, title }))
  }, [selection.selectedPlaylistKinds, data.playlists])

  const handleAdd = useCallback(
    async (trackId: string, kind: number) => {
      const result = await mutations.addTrackToPlaylist(trackId, kind)
      if (
        !result.success &&
        result.error &&
        result.error !== 'Request cancelled'
      ) {
        pushToast(`Add failed: ${result.error}`, 'error')
        if (result.isAuthError) onLogout()
      }
    },
    [mutations, pushToast, onLogout],
  )

  const handleUnlike = useCallback(
    async (trackId: string) => {
      const result = await mutations.unlikeTrack(trackId)
      if (
        !result.success &&
        result.error &&
        result.error !== 'Request cancelled'
      ) {
        pushToast(`Unlike failed: ${result.error}`, 'error')
        if (result.isAuthError) onLogout()
      }
    },
    [mutations, pushToast, onLogout],
  )

  // ---- Unlike confirmation state ----
  const [pendingUnlike, setPendingUnlike] = useState<YandexTrack | null>(null)
  const pendingUnlikeRef = useRef<YandexTrack | null>(null)
  useEffect(() => {
    pendingUnlikeRef.current = pendingUnlike
  })
  const [skipUnlikeConfirm, setSkipUnlikeConfirm] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SKIP_UNLIKE_CONFIRM_KEY) === 'true'
  })

  const handleSkipUnlikeConfirmChange = useCallback((skip: boolean) => {
    setSkipUnlikeConfirm(skip)
    try {
      if (skip) {
        window.localStorage.setItem(SKIP_UNLIKE_CONFIRM_KEY, 'true')
      } else {
        window.localStorage.removeItem(SKIP_UNLIKE_CONFIRM_KEY)
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  const handleRequestUnlike = useCallback(
    (track: YandexTrack) => {
      if (skipUnlikeConfirm) {
        void handleUnlike(track.id)
        return
      }
      setPendingUnlike(track)
    },
    [skipUnlikeConfirm, handleUnlike],
  )

  const handleConfirmUnlike = useCallback(() => {
    const track = pendingUnlikeRef.current
    setPendingUnlike(null)
    if (track) void handleUnlike(track.id)
  }, [handleUnlike])

  const handleCancelUnlike = useCallback(() => {
    setPendingUnlike(null)
  }, [])

  // Auto-cancel pending confirm if track leaves the visible page
  useEffect(() => {
    if (!pendingUnlike) return
    const stillVisible = pagination.currentPageTracks.some(
      (t) => t.id === pendingUnlike.id,
    )
    if (!stillVisible) setPendingUnlike(null)
  }, [pagination.currentPageTracks, pendingUnlike])

  const handleRefresh = useCallback(() => {
    void status.refresh().catch((err) => {
      const msg = err instanceof Error ? err.message : 'Refresh failed'
      pushToast(msg, 'error')
    })
  }, [status, pushToast])

  // Surface persistent fetch errors as a toast (once per change)
  useEffect(() => {
    if (status.error) {
      pushToast(status.error, 'error')
      if (status.isAuthError) onLogout()
    }
  }, [status.error, status.isAuthError, pushToast, onLogout])

  const detectBpm = useCallback(
    (trackId: string) => queue.detect(trackId),
    [queue],
  )

  const pendingBpmCount = useMemo(() => {
    return pagination.currentPageTracks.filter(
      (t) =>
        t.available &&
        getBpm(t.id) === null &&
        queue.getStatus(t.id) === 'idle',
    ).length
  }, [pagination.currentPageTracks, getBpm, queue])

  const handleStartBatch = useCallback(() => {
    const ids = pagination.currentPageTracks
      .filter(
        (t) =>
          t.available &&
          getBpm(t.id) === null &&
          queue.getStatus(t.id) === 'idle',
      )
      .map((t) => t.id)
    queue.detectMany(ids)
  }, [pagination.currentPageTracks, getBpm, queue])

  // ---- Render branches ----
  const isInitialLoad = status.isLoading && data.playlists.length === 0
  const showNoPlaylists =
    !status.isLoading && !status.isLoadingTracks && data.playlists.length === 0
  const hasSelectedPlaylists = selection.selectedPlaylistKinds.length > 0
  const showAllSorted =
    hasSelectedPlaylists &&
    data.unsortedTrackIds.length === 0 &&
    !status.isLoading &&
    !status.isLoadingTracks

  const playerVisible = player.currentTrack !== null
  let playerTrackIndex = playerVisible
    ? pagination.currentPageTracks.findIndex(
        (t) => t.id === player.currentTrack!.id,
      )
    : -1
  // Track removed from list — fall back to active (focused) track position
  if (playerTrackIndex === -1 && playerVisible && activeTrackId) {
    playerTrackIndex = pagination.currentPageTracks.findIndex(
      (t) => t.id === activeTrackId,
    )
  }
  const playerHasNext =
    playerTrackIndex >= 0 &&
    playerTrackIndex < pagination.currentPageTracks.length - 1
  const playerHasPrev = playerTrackIndex > 0

  // Offset body so fixed MiniPlayer / unlike banner don't cover footer
  useEffect(() => {
    const h =
      playerVisible && pendingUnlike
        ? '13rem'
        : playerVisible
          ? '6rem'
          : pendingUnlike
            ? '8rem'
            : ''
    document.body.style.paddingBottom = h
    return () => {
      document.body.style.paddingBottom = ''
    }
  }, [playerVisible, pendingUnlike])

  return (
    <div className="space-y-8">
      <UserHeader
        user={user}
        isRefreshing={status.isLoading && data.playlists.length > 0}
        onRefresh={handleRefresh}
        onLogout={onLogout}
      />

      <StatsBar
        totalLiked={data.totalLikedCount}
        unsorted={data.unsortedTrackIds.length}
        selectedPlaylists={selection.selectedPlaylistKinds.length}
        isLoading={isInitialLoad}
        isLoadingTracks={status.isLoadingTracks}
      />

      {showNoPlaylists ? (
        <NoPlaylists />
      ) : (
        <>
          <PlaylistSelector
            playlists={data.playlists}
            selectedKinds={selection.selectedPlaylistKinds}
            failedKinds={data.failedPlaylistKinds}
            onChange={selection.setSelectedPlaylistKinds}
            isLoading={isInitialLoad}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            {!showAllSorted && (
              <BatchBpmController
                pendingCount={pendingBpmCount}
                isProcessing={queue.isProcessing}
                processedCount={queue.processedCount}
                totalCount={queue.totalCount}
                onStart={handleStartBatch}
                onCancel={queue.cancelAll}
                isLoading={isInitialLoad || pagination.isLoadingPage}
              />
            )}
            <div className="flex items-center gap-2 ml-auto">
              <ViewToggle value={viewMode} onChange={setViewMode} />
              <KeyboardHelpButton onClick={() => setHelpOpen(true)} />
            </div>
          </div>

          {isInitialLoad ? (
            <TrackListSkeleton viewMode={viewMode} />
          ) : showAllSorted ? (
            <AllSorted />
          ) : (
            <SortingWorkspace
              tracks={pagination.currentPageTracks}
              isLoadingPage={pagination.isLoadingPage}
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              viewMode={viewMode}
              selectedPlaylists={selectedPlaylistsResolved}
              pendingAdds={mutations.pendingAdds}
              pendingUnlikeTrackId={pendingUnlike?.id ?? null}
              playingTrackId={
                player.status === 'playing' || player.status === 'loading'
                  ? (player.currentTrack?.id ?? null)
                  : null
              }
              pausedTrackId={
                player.status === 'paused'
                  ? (player.currentTrack?.id ?? null)
                  : null
              }
              getBpm={getBpm}
              getBpmStatus={queue.getStatus}
              onAdd={handleAdd}
              onRequestUnlike={handleRequestUnlike}
              onConfirmUnlike={handleConfirmUnlike}
              onCancelUnlike={handleCancelUnlike}
              onDetectBpm={detectBpm}
              onCycleBpm={cycleBpmMultiplier}
              onPageChange={pagination.setPage}
              onPlayTrack={player.play}
              onTogglePlayPause={player.togglePlayPause}
              onPlayNext={player.playNext}
              onPlayPrev={player.playPrev}
              onActiveTrackChange={setActiveTrackId}
              audioElement={player.audioElement}
            />
          )}
        </>
      )}

      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      {pendingUnlike !== null && (
        <div
          className={cn(
            'fixed left-0 right-0 z-40 px-3 sm:px-4',
            'flex flex-col items-stretch gap-2 pointer-events-none',
            playerVisible ? 'bottom-24' : 'bottom-4',
          )}
        >
          <UnlikeConfirmBanner
            track={pendingUnlike}
            skipChecked={skipUnlikeConfirm}
            onConfirm={handleConfirmUnlike}
            onCancel={handleCancelUnlike}
            onSkipAlwaysChange={handleSkipUnlikeConfirmChange}
          />
        </div>
      )}

      {playerVisible && player.audioElement && (
        <MiniPlayer
          track={player.currentTrack!}
          status={player.status}
          audioElement={player.audioElement}
          hasNext={playerHasNext}
          hasPrev={playerHasPrev}
          canDownload={player.blobReady}
          isUnliking={mutations.pendingUnlikes.has(player.currentTrack!.id)}
          onTogglePlayPause={player.togglePlayPause}
          onNext={player.playNext}
          onPrev={player.playPrev}
          onDownload={player.downloadTrack}
          onUnlike={() => handleRequestUnlike(player.currentTrack!)}
          onStop={player.stop}
        />
      )}
    </div>
  )
}
