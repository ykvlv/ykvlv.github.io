import {
  useMemo,
  useCallback,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from 'react'
import type { YandexPlaylist, YandexTrack } from '../types'
import { YandexMusicAPI } from '../lib/yandex-music-api'
import { MAX_REFRESH_ATTEMPTS } from '../config'
import { usePlaylistsSelection } from './usePlaylistsSelection'
import { usePlaylistsFetch } from './usePlaylistsFetch'
import { usePlaylistsPagination } from './usePlaylistsPagination'
import {
  usePlaylistsMutations,
  type MutationResult,
  type MutationCallbacks,
} from './usePlaylistsMutations'

interface UsePlaylistsDataProps {
  token?: string
  uid?: number
}

export interface UsePlaylistsDataResult {
  data: {
    playlists: YandexPlaylist[]
    totalLikedCount: number
    unsortedTrackIds: string[]
  }
  selection: {
    selectedPlaylistKinds: number[]
    setSelectedPlaylistKinds: (kinds: number[]) => void
  }
  pagination: {
    currentPage: number
    totalPages: number
    currentPageTracks: YandexTrack[]
    isLoadingPage: boolean
    setPage: (page: number) => void
  }
  mutations: {
    addTrackToPlaylist: (
      trackId: string,
      playlistKind: number,
    ) => Promise<MutationResult>
    unlikeTrack: (trackId: string) => Promise<MutationResult>
    pendingAdds: Set<string>
    pendingUnlikes: Set<string>
  }
  status: {
    isLoading: boolean
    error: string | null
    refresh: () => Promise<void>
  }
}

/**
 * Main hook for managing Yandex Music playlists data.
 * Composes smaller specialized hooks for better maintainability.
 */
export function usePlaylistsData({
  token,
  uid,
}: UsePlaylistsDataProps): UsePlaylistsDataResult {
  const api = useMemo(() => (token ? new YandexMusicAPI(token) : null), [token])

  // Local state for data that can be mutated
  const [localPlaylists, setLocalPlaylists] = useState<YandexPlaylist[] | null>(
    null,
  )
  const [localLikedTrackIds, setLocalLikedTrackIds] = useState<string[] | null>(
    null,
  )
  const [localPlaylistTracks, setLocalPlaylistTracks] = useState<Map<
    number,
    Set<string>
  > | null>(null)

  // Track if mutations happened during refresh to trigger re-fetch
  const mutationsDuringRefreshRef = useRef(false)

  // Reset local state when user changes
  useEffect(() => {
    setLocalPlaylists(null)
    setLocalLikedTrackIds(null)
    setLocalPlaylistTracks(null)
  }, [uid])

  // Fetch playlists data
  const fetchResult = usePlaylistsFetch({ api, uid })

  // Store fresh fetchResult data in ref to avoid stale closures in callbacks
  const fetchedDataRef = useRef(fetchResult)
  useLayoutEffect(() => {
    fetchedDataRef.current = fetchResult
  })

  // Use local state if available (after mutations), otherwise use fetched data
  const playlists = localPlaylists ?? fetchResult.playlists
  const likedTrackIds = localLikedTrackIds ?? fetchResult.likedTrackIds
  const playlistTracks = localPlaylistTracks ?? fetchResult.playlistTracks

  // Simplified approach: use only localState after first mutation
  // This avoids stale data race with fetchedDataRef + useLayoutEffect
  // After refresh, localState is null until next mutation → uses fresh fetchResult data

  // Manage playlist selection
  const { selectedPlaylistKinds, setSelectedPlaylistKinds } =
    usePlaylistsSelection(uid)

  // Compute sorted playlist kinds to prevent unnecessary recalculation on reorder
  const sortedSelectedKinds = useMemo(
    () => [...selectedPlaylistKinds].sort((a, b) => a - b),
    [selectedPlaylistKinds],
  )

  // Compute unsorted track IDs (liked but not in selected playlists)
  const unsortedTrackIds = useMemo((): string[] => {
    if (sortedSelectedKinds.length === 0) {
      return [] // Don't show until playlists are selected
    }

    const sortedTrackIds = new Set<string>()
    for (const kind of sortedSelectedKinds) {
      const tracks = playlistTracks.get(kind)
      if (tracks) {
        tracks.forEach((id) => sortedTrackIds.add(id))
      }
    }

    return likedTrackIds.filter((id) => !sortedTrackIds.has(id))
  }, [likedTrackIds, sortedSelectedKinds, playlistTracks])

  // Pagination for unsorted tracks
  const paginationResult = usePlaylistsPagination({
    api,
    trackIds: unsortedTrackIds,
    skipLoading: fetchResult.isLoading,
  })

  // Mutation callbacks to update local state (stable reference)
  const mutationCallbacks: MutationCallbacks = useMemo(
    () => ({
      onTrackAdded: (trackId: string, playlistKind: number) => {
        // Validate playlist exists first to prevent state inconsistency
        const freshPlaylists =
          localPlaylists ?? fetchedDataRef.current.playlists
        const playlistExists = freshPlaylists.some(
          (p) => p.kind === playlistKind,
        )
        if (!playlistExists) {
          console.error(
            `[usePlaylistsData] Playlist ${playlistKind} not found for track ${trackId}`,
          )
          return // Don't update any state
        }

        // Update playlist tracks
        let wasActuallyAdded = false
        setLocalPlaylistTracks((prev) => {
          // Use prev if available, otherwise use fresh data from ref
          const base = prev ?? fetchedDataRef.current.playlistTracks
          const newMap = new Map(base)
          const tracks = new Set(newMap.get(playlistKind) || [])
          // Check if track is new to prevent count/Set size inconsistency
          wasActuallyAdded = !tracks.has(trackId)
          tracks.add(trackId)
          newMap.set(playlistKind, tracks)
          return newMap
        })

        // Update playlist track count only if track was actually new
        if (wasActuallyAdded) {
          setLocalPlaylists((prev) => {
            // Use prev if available, otherwise use fresh data from ref
            const base = prev ?? fetchedDataRef.current.playlists

            return base.map((p) =>
              p.kind === playlistKind
                ? { ...p, trackCount: p.trackCount + 1 }
                : p,
            )
          })
        }
      },
      onTrackUnliked: (trackId: string) => {
        // Remove from liked tracks
        setLocalLikedTrackIds((prev) => {
          const base = prev ?? fetchedDataRef.current.likedTrackIds
          return base.filter((id) => id !== trackId)
        })
      },
      onTrackAddRollback: (trackId: string, playlistKind: number) => {
        // Validate playlist exists first
        const freshPlaylists =
          localPlaylists ?? fetchedDataRef.current.playlists
        const playlistExists = freshPlaylists.some(
          (p) => p.kind === playlistKind,
        )
        if (!playlistExists) {
          console.error(
            `[usePlaylistsData] Playlist ${playlistKind} not found for rollback of track ${trackId}`,
          )
          return // Don't update any state
        }

        // Rollback track addition on API failure
        let wasActuallyInSet = false
        setLocalPlaylistTracks((prev) => {
          const base = prev ?? fetchedDataRef.current.playlistTracks
          const newMap = new Map(base)
          const tracks = new Set(newMap.get(playlistKind) || [])
          // Check if track was actually in Set to prevent count/Set size inconsistency
          wasActuallyInSet = tracks.has(trackId)
          tracks.delete(trackId)
          newMap.set(playlistKind, tracks)
          return newMap
        })

        // Rollback playlist track count only if track was actually in Set
        if (wasActuallyInSet) {
          setLocalPlaylists((prev) => {
            const base = prev ?? fetchedDataRef.current.playlists

            return base.map((p) =>
              p.kind === playlistKind
                ? { ...p, trackCount: Math.max(0, p.trackCount - 1) }
                : p,
            )
          })
        }
      },
      onTrackUnlikedRollback: (trackId: string) => {
        // Rollback track unlike on API failure - restore to liked tracks
        setLocalLikedTrackIds((prev) => {
          const base = prev ?? fetchedDataRef.current.likedTrackIds
          // Only add back if not already present (prevent duplicates)
          if (base.includes(trackId)) return base
          return [...base, trackId]
        })
      },
      onMutationDuringRefresh: () => {
        // Mark that mutation happened during refresh - will trigger re-fetch
        mutationsDuringRefreshRef.current = true
      },
    }),
    [], // No dependencies - uses refs for fresh values
  )

  // Mutations
  const mutationsResult = usePlaylistsMutations({
    api,
    uid,
    callbacks: mutationCallbacks,
    isRefreshing: fetchResult.isRefreshing,
  })

  // Wrap refresh to also reset local state
  const refresh = useCallback(async () => {
    for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt++) {
      mutationsDuringRefreshRef.current = false
      await fetchResult.refresh()

      // Clear local state after fresh data arrives
      setLocalPlaylists(null)
      setLocalLikedTrackIds(null)
      setLocalPlaylistTracks(null)

      // If no mutations during refresh, we're done
      if (!mutationsDuringRefreshRef.current) {
        break
      }

      // If this was the last attempt, warn and exit
      if (attempt === MAX_REFRESH_ATTEMPTS - 1) {
        console.warn(
          '[usePlaylistsData] Mutations during refresh exceeded max retries',
        )
      }
    }
  }, [fetchResult.refresh])

  return {
    data: {
      playlists,
      totalLikedCount: likedTrackIds.length,
      unsortedTrackIds,
    },
    selection: {
      selectedPlaylistKinds,
      setSelectedPlaylistKinds,
    },
    pagination: {
      currentPage: paginationResult.currentPage,
      totalPages: paginationResult.totalPages,
      currentPageTracks: paginationResult.currentPageTracks,
      isLoadingPage: paginationResult.isLoadingPage,
      setPage: paginationResult.setPage,
    },
    mutations: {
      addTrackToPlaylist: mutationsResult.addTrackToPlaylist,
      unlikeTrack: mutationsResult.unlikeTrack,
      pendingAdds: mutationsResult.pendingAdds,
      pendingUnlikes: mutationsResult.pendingUnlikes,
    },
    status: {
      isLoading: fetchResult.isLoading,
      error: fetchResult.error,
      refresh,
    },
  }
}
