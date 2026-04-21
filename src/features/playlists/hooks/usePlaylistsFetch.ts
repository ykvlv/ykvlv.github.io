import { useState, useEffect, useCallback, useRef } from 'react'
import type { YandexPlaylist } from '../types'
import { type YandexMusicAPI, YandexApiError } from '../lib/yandex-music-api'
import { PLAYLIST_BATCH_SIZE } from '../config'

/** Extract error message from unknown error */
const getErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback

export interface UsePlaylistsFetchResult {
  playlists: YandexPlaylist[]
  likedTrackIds: string[]
  playlistTracks: Map<number, Set<string>>
  failedPlaylistKinds: Set<number>
  isLoading: boolean
  isLoadingTracks: boolean
  isRefreshing: boolean
  error: string | null
  isAuthError: boolean
  refresh: () => Promise<void>
}

interface UsePlaylistsFetchProps {
  api: YandexMusicAPI | null
  uid?: number
}

/**
 * Fetches playlists, liked track IDs, and playlist track mappings.
 * Handles loading states, error states, and request cancellation.
 */
export function usePlaylistsFetch({
  api,
  uid,
}: UsePlaylistsFetchProps): UsePlaylistsFetchResult {
  const [playlists, setPlaylists] = useState<YandexPlaylist[]>([])
  const [likedTrackIds, setLikedTrackIds] = useState<string[]>([])
  const [playlistTracks, setPlaylistTracks] = useState<
    Map<number, Set<string>>
  >(() => new Map())
  const [isLoading, setIsLoading] = useState(!!(api && uid))
  const [isLoadingTracks, setIsLoadingTracks] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAuthError, setIsAuthError] = useState(false)
  const [failedPlaylistKinds, setFailedPlaylistKinds] = useState<Set<number>>(
    () => new Set(),
  )

  // Single abort controller for current operation (simpler than Set)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadData = useCallback(
    async (signal: AbortSignal, isRefresh = false) => {
      if (!api || !uid) return

      setIsLoading(true)
      if (isRefresh) setIsRefreshing(true)
      setError(null)
      setIsAuthError(false)

      try {
        // Phase 1: playlists + liked track IDs (lightweight)
        const [fetchedPlaylists, fetchedLikedTrackIds] = await Promise.all([
          api.getPlaylists(uid, signal),
          api.getLikedTrackIds(uid, signal),
        ])

        if (signal.aborted) return

        // Phase 1 done — set immediately so UI can show playlists and liked total
        setPlaylists(fetchedPlaylists)
        setLikedTrackIds(fetchedLikedTrackIds)
        setIsLoading(false)

        // Phase 2: playlist track batches (heavier)
        setIsLoadingTracks(true)
        const tracksMap = new Map<number, Set<string>>()
        const failedKinds = new Set<number>()

        for (let i = 0; i < fetchedPlaylists.length; i += PLAYLIST_BATCH_SIZE) {
          if (signal.aborted) return

          const batch = fetchedPlaylists.slice(i, i + PLAYLIST_BATCH_SIZE)
          const results = await Promise.allSettled(
            batch.map(async (playlist) => {
              const tracks = await api.getPlaylistTracks(
                uid,
                playlist.kind,
                signal,
              )
              return { kind: playlist.kind, tracks }
            }),
          )

          if (signal.aborted) return

          for (let j = 0; j < results.length; j++) {
            const result = results[j]
            if (result.status === 'fulfilled') {
              const { kind, tracks } = result.value
              tracksMap.set(kind, new Set(tracks.map((t) => t.id)))
            } else {
              failedKinds.add(batch[j].kind)
              console.warn(`Failed to load playlist tracks: ${result.reason}`)
            }
          }
        }

        if (signal.aborted) return

        setPlaylistTracks(tracksMap)
        setFailedPlaylistKinds(failedKinds)
        setError(null)
      } catch (err) {
        if (signal.aborted) return
        setError(getErrorMessage(err, 'Failed to load data'))
        setIsAuthError(err instanceof YandexApiError && err.category === 'auth')
      } finally {
        if (!signal.aborted) {
          setIsLoading(false)
          setIsLoadingTracks(false)
          setIsRefreshing(false)
        }
      }
    },
    [api, uid],
  )

  useEffect(() => {
    // Abort previous controller on uid/api change
    abortControllerRef.current?.abort()

    const controller = new AbortController()
    abortControllerRef.current = controller

    loadData(controller.signal)

    return () => {
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
    }
  }, [loadData])

  const refresh = useCallback(async () => {
    // Abort existing controller
    abortControllerRef.current?.abort()

    const controller = new AbortController()
    abortControllerRef.current = controller

    await loadData(controller.signal, true)
  }, [loadData])

  return {
    playlists,
    likedTrackIds,
    playlistTracks,
    isLoading,
    isLoadingTracks,
    isRefreshing,
    error,
    isAuthError,
    failedPlaylistKinds,
    refresh,
  }
}
