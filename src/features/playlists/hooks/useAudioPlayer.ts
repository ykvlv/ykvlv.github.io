import { useCallback, useEffect, useRef, useState } from 'react'
import { YandexMusicAPI, getCoverUrl } from '../lib/yandex-music-api'
import type { YandexTrack } from '../types'

export const VOLUME_KEY = 'ykvlv_playlists_player_volume'

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface UseAudioPlayerProps {
  api: YandexMusicAPI
  tracks: YandexTrack[]
  activeTrackId?: string | null
  onError?: (message: string) => void
  onPlaybackStart?: (trackId: string, downloadUrl: string) => void
  onBeforePlay?: () => void
}

export interface UseAudioPlayerResult {
  currentTrack: YandexTrack | null
  status: PlayerStatus
  audioElement: HTMLAudioElement | null
  blobReady: boolean
  play: (trackId: string) => void
  playActive: () => void
  togglePlayPause: () => void
  playNext: () => void
  playPrev: () => void
  stop: () => void
  swapToBlob: (trackId: string, buffer: ArrayBuffer) => void
  downloadTrack: () => void
}

export function getStoredVolume(): number {
  try {
    const v = localStorage.getItem(VOLUME_KEY)
    if (v !== null) {
      const n = parseFloat(v)
      if (Number.isFinite(n) && n >= 0 && n <= 1) return n
    }
  } catch {
    // localStorage unavailable
  }
  return 1
}

/** Quadratic curve for perceptual volume: slider [0,1] → amplitude [0,1]. */
export function toAudioVolume(x: number): number {
  return x * x
}

export function useAudioPlayer({
  api,
  tracks,
  activeTrackId,
  onError,
  onPlaybackStart,
  onBeforePlay,
}: UseAudioPlayerProps): UseAudioPlayerResult {
  const [currentTrack, setCurrentTrack] = useState<YandexTrack | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [blobReady, setBlobReady] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const swappingRef = useRef(false)
  const isMountedRef = useRef(true)
  const activeTrackIdRef = useRef(activeTrackId)
  const lastIndexRef = useRef(-1)

  // Stable refs
  const apiRef = useRef(api)
  const tracksRef = useRef(tracks)
  const onErrorRef = useRef(onError)
  const onPlaybackStartRef = useRef(onPlaybackStart)
  const onBeforePlayRef = useRef(onBeforePlay)
  const currentTrackRef = useRef(currentTrack)
  const statusRef = useRef(status)
  useEffect(() => {
    apiRef.current = api
    tracksRef.current = tracks
    onErrorRef.current = onError
    onPlaybackStartRef.current = onPlaybackStart
    onBeforePlayRef.current = onBeforePlay
    currentTrackRef.current = currentTrack
    statusRef.current = status
    activeTrackIdRef.current = activeTrackId
  })

  // Create audio element once
  useEffect(() => {
    isMountedRef.current = true
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
    audio.volume = toAudioVolume(getStoredVolume())
    audioRef.current = audio

    const onEnded = () => {
      playNextRef.current()
    }

    const onPause = () => {
      if (!isMountedRef.current || swappingRef.current) return
      setStatus((s) => (s === 'loading' ? s : 'paused'))
    }

    const onPlay = () => {
      if (!isMountedRef.current || swappingRef.current) return
      setStatus('playing')
    }

    const onAudioError = () => {
      if (!isMountedRef.current || swappingRef.current) return
      if (!audio.src) return
      setStatus('error')
      onErrorRef.current?.('Playback failed')
    }

    audio.addEventListener('ended', onEnded)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('error', onAudioError)

    return () => {
      isMountedRef.current = false
      abortRef.current?.abort()
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('error', onAudioError)
    }
  }, [])

  const play = useCallback((trackId: string) => {
    // Already the current track and not in error state — don't restart the load
    if (
      currentTrackRef.current?.id === trackId &&
      statusRef.current !== 'error'
    )
      return

    const allTracks = tracksRef.current
    const trackIdx = allTracks.findIndex((t) => t.id === trackId)
    const track = trackIdx >= 0 ? allTracks[trackIdx] : null
    if (!track || !track.available) return
    lastIndexRef.current = trackIdx

    // Cancel previous BPM detection + abort previous load
    onBeforePlayRef.current?.()
    abortRef.current?.abort()
    swappingRef.current = false
    const controller = new AbortController()
    abortRef.current = controller

    setCurrentTrack(track)
    currentTrackRef.current = track
    setStatus('loading')
    setBlobReady(false)

    const audio = audioRef.current!

    void (async () => {
      try {
        const url = await apiRef.current.getTrackDownloadUrl(
          trackId,
          controller.signal,
        )
        if (controller.signal.aborted) return

        const streamUrl = YandexMusicAPI.getProxyAudioStreamUrl(url)
        audio.src = streamUrl

        // Kick off BPM detection + buffer download for seeking
        onPlaybackStartRef.current?.(trackId, url)

        await audio.play()

        if (!isMountedRef.current) return
        setStatus('playing')
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (!isMountedRef.current) return
        setStatus('error')
        const msg = err instanceof Error ? err.message : 'Failed to load track'
        onErrorRef.current?.(msg)
      }
    })()
  }, [])

  const swapToBlob = useCallback((trackId: string, buffer: ArrayBuffer) => {
    const audio = audioRef.current
    if (!audio || currentTrackRef.current?.id !== trackId) return

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
    }

    const blobUrl = URL.createObjectURL(
      new Blob([buffer], { type: 'audio/mpeg' }),
    )
    blobUrlRef.current = blobUrl
    setBlobReady(true)

    const savedTime = audio.currentTime
    const wasPlaying = !audio.paused

    swappingRef.current = true
    audio.src = blobUrl

    const onReady = () => {
      // Track changed during swap — abort
      if (currentTrackRef.current?.id !== trackId) {
        swappingRef.current = false
        return
      }
      audio.currentTime = savedTime
      if (wasPlaying) {
        audio.play().catch(() => {})
      }
      swappingRef.current = false
    }

    if (audio.readyState >= 1) {
      onReady()
    } else {
      audio.addEventListener('loadedmetadata', onReady, { once: true })
    }
  }, [])

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentTrackRef.current) return

    if (audio.paused) {
      void audio.play().catch(() => {
        // Ignore play failures (e.g., no user gesture)
      })
    } else {
      audio.pause()
    }
  }, [])

  const findNextAvailable = useCallback(
    (fromIndex: number, direction: 1 | -1): YandexTrack | null => {
      const ts = tracksRef.current
      let i = fromIndex + direction
      while (i >= 0 && i < ts.length) {
        if (ts[i].available) return ts[i]
        i += direction
      }
      return null
    },
    [],
  )

  const playNext = useCallback(() => {
    const track = currentTrackRef.current
    if (!track) return
    const ts = tracksRef.current
    const idx = ts.findIndex((t) => t.id === track.id)
    if (idx === -1) {
      // Track removed from list — play from the same position
      const fromIdx = Math.min(lastIndexRef.current, ts.length - 1)
      const next =
        fromIdx >= 0 && ts[fromIdx]?.available
          ? ts[fromIdx]
          : findNextAvailable(fromIdx, 1)
      if (next) {
        play(next.id)
      } else {
        setStatus('paused')
      }
      return
    }
    const next = findNextAvailable(idx, 1)
    if (next) {
      play(next.id)
    } else {
      setStatus('paused')
    }
  }, [play, findNextAvailable])

  // Ref for playNext so the ended handler always calls the latest version
  const playNextRef = useRef(playNext)
  useEffect(() => {
    playNextRef.current = playNext
  })

  const playPrev = useCallback(() => {
    const audio = audioRef.current
    const track = currentTrackRef.current
    if (!track || !audio) return

    // If more than 3 seconds in, restart current track
    if (audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }

    const ts = tracksRef.current
    const idx = ts.findIndex((t) => t.id === track.id)
    if (idx === -1) {
      // Track removed — go back from saved position
      const fromIdx = Math.min(lastIndexRef.current, ts.length - 1)
      const prev = fromIdx >= 0 ? findNextAvailable(fromIdx, -1) : null
      if (prev) play(prev.id)
      return
    }
    const prev = findNextAvailable(idx, -1)
    if (prev) {
      play(prev.id)
    } else {
      audio.currentTime = 0
    }
  }, [play, findNextAvailable])

  // Keep a ref for playPrev so media session always calls the latest version
  const playPrevRef = useRef(playPrev)
  useEffect(() => {
    playPrevRef.current = playPrev
  })

  // Media Session API — hardware media keys (Bluetooth speakers, headphones, OS controls)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    const session = navigator.mediaSession

    session.setActionHandler('nexttrack', () => playNextRef.current())
    session.setActionHandler('previoustrack', () => playPrevRef.current())

    return () => {
      session.setActionHandler('nexttrack', null)
      session.setActionHandler('previoustrack', null)
    }
  }, [])

  // Update Media Session metadata when track changes
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return

    const artists = currentTrack.artists.map((a) => a.name).join(', ')
    const artwork: MediaImage[] = []
    if (currentTrack.coverUri) {
      artwork.push(
        {
          src: getCoverUrl(currentTrack.coverUri, '100x100'),
          sizes: '100x100',
          type: 'image/jpeg',
        },
        {
          src: getCoverUrl(currentTrack.coverUri, '400x400'),
          sizes: '400x400',
          type: 'image/jpeg',
        },
      )
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: artists,
      artwork,
    })
  }, [currentTrack])

  const playActive = useCallback(() => {
    const id = activeTrackIdRef.current
    if (id) play(id)
  }, [play])

  const stop = useCallback(() => {
    onBeforePlayRef.current?.()
    abortRef.current?.abort()
    swappingRef.current = false
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    setCurrentTrack(null)
    currentTrackRef.current = null
    setStatus('idle')
    setBlobReady(false)
  }, [])

  const downloadTrack = useCallback(() => {
    const track = currentTrackRef.current
    const url = blobUrlRef.current
    if (!track || !url) return
    const a = document.createElement('a')
    a.href = url
    const artists = track.artists.map((ar) => ar.name).join(', ')
    a.download = `${artists} - ${track.title}.mp3`
    a.click()
  }, [])

  return {
    currentTrack,
    status,
    audioElement: audioRef.current as HTMLAudioElement | null,
    blobReady,
    play,
    playActive,
    togglePlayPause,
    playNext,
    playPrev,
    stop,
    swapToBlob,
    downloadTrack,
  }
}
