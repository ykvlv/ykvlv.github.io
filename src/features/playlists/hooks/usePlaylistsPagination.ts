import { useState, useEffect, useCallback, useRef } from 'react'
import type { YandexTrack } from '../types'
import type { YandexMusicAPI } from '../lib/yandex-music-api'
import { TRACKS_PER_PAGE } from '../config'

export interface UsePlaylistsPaginationResult {
  currentPage: number
  totalPages: number
  currentPageTracks: YandexTrack[]
  isLoadingPage: boolean
  setPage: (page: number) => void
}

interface UsePlaylistsPaginationProps {
  api: YandexMusicAPI | null
  trackIds: string[]
  /** Skip loading when parent is still loading initial data */
  skipLoading?: boolean
}

/**
 * Manages pagination for a list of track IDs.
 * Fetches track details for the current page.
 * Resets to page 1 when track list changes, clamps when totalPages decreases.
 */
export function usePlaylistsPagination({
  api,
  trackIds,
  skipLoading = false,
}: UsePlaylistsPaginationProps): UsePlaylistsPaginationResult {
  const [currentPage, setCurrentPage] = useState(1)
  const [currentPageTracks, setCurrentPageTracks] = useState<YandexTrack[]>([])
  const [isLoadingPage, setIsLoadingPage] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)

  const totalPages = Math.max(1, Math.ceil(trackIds.length / TRACKS_PER_PAGE))

  // trackIds is memoized in parent (usePlaylistsData), so reference equality works
  // No need for expensive key generation - React tracks reference changes automatically
  const prevTrackIdsRef = useRef(trackIds)

  // Reset to page 1 when a track list changes
  useEffect(() => {
    // Check 1: Reset to page 1 if trackIds changed
    if (prevTrackIdsRef.current !== trackIds) {
      prevTrackIdsRef.current = trackIds

      // If we're not already on page 1, reset
      if (currentPage !== 1) {
        setCurrentPage(1)
        return // Exit early to avoid double state update
      }
    }

    // Check 2: Clamp if current page exceeds total
    // This is independent of trackIds change
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [trackIds, currentPage, totalPages])

  // Load tracks for current page
  const loadPage = useCallback(
    async (page: number, ids: string[], signal: AbortSignal) => {
      if (!api) return

      const start = (page - 1) * TRACKS_PER_PAGE
      const pageTrackIds = ids.slice(start, start + TRACKS_PER_PAGE)

      if (pageTrackIds.length === 0) {
        setCurrentPageTracks([])
        return
      }

      setIsLoadingPage(true)

      try {
        const tracks = await api.getTracksById(pageTrackIds, signal)
        setCurrentPageTracks(tracks)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Keep previous tracks on error, error is handled by parent
        console.error('Failed to load page tracks:', err)
      } finally {
        setIsLoadingPage(false)
      }
    },
    [api],
  )

  // Trigger page load when dependencies change
  useEffect(() => {
    abortControllerRef.current?.abort()

    if (skipLoading) return

    if (trackIds.length > 0) {
      abortControllerRef.current = new AbortController()
      loadPage(currentPage, trackIds, abortControllerRef.current.signal)
    } else {
      setCurrentPageTracks([])
      setIsLoadingPage(false)
    }

    return () => {
      abortControllerRef.current?.abort()
    }
  }, [trackIds, currentPage, skipLoading, loadPage])

  const setPage = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

  return {
    currentPage,
    totalPages,
    currentPageTracks,
    isLoadingPage,
    setPage,
  }
}
