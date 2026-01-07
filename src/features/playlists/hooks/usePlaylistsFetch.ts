import { useState, useEffect, useCallback, useRef } from 'react'
import type { YandexPlaylist } from '../types'
import type { YandexMusicAPI } from '../lib/yandex-music-api'
import { PLAYLIST_BATCH_SIZE } from '../config'

/** Extract error message from unknown error */
const getErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback

export interface UsePlaylistsFetchResult {
  playlists: YandexPlaylist[]
  likedTrackIds: string[]
  playlistTracks: Map<number, Set<string>>
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
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
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Single abort controller for current operation (simpler than Set)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadData = useCallback(
    async (signal: AbortSignal, isRefresh = false) => {
      if (!api || !uid) return

      setIsLoading(true)
      if (isRefresh) {
        setIsRefreshing(true)
      }
      setError(null)

      try {
        // Load playlists and liked track IDs in parallel (lightweight)
        const [fetchedPlaylists, fetchedLikedTrackIds] = await Promise.all([
          api.getPlaylists(uid, signal),
          api.getLikedTrackIds(uid, signal),
        ])

        // Load playlist tracks in batches
        const tracksMap = new Map<number, Set<string>>()
        for (let i = 0; i < fetchedPlaylists.length; i += PLAYLIST_BATCH_SIZE) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

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

          // Process results, skip failed playlists
          for (const result of results) {
            if (result.status === 'fulfilled') {
              const { kind, tracks } = result.value
              tracksMap.set(kind, new Set(tracks.map((t) => t.id)))
            } else {
              console.warn(`Failed to load playlist tracks: ${result.reason}`)
            }
          }
        }

        setPlaylists(fetchedPlaylists)
        setLikedTrackIds(fetchedLikedTrackIds)
        setPlaylistTracks(tracksMap)
        setError(null)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(getErrorMessage(err, 'Failed to load data'))
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
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
    isRefreshing,
    error,
    refresh,
  }
}
