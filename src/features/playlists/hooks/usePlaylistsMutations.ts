import { useState, useCallback, useRef, useEffect } from 'react'
import { YandexMusicAPI } from '../lib/yandex-music-api'

export interface MutationResult {
  success: boolean
  error?: string
}

export interface UsePlaylistsMutationsResult {
  addTrackToPlaylist: (
    trackId: string,
    playlistKind: number,
  ) => Promise<MutationResult>
  unlikeTrack: (trackId: string) => Promise<MutationResult>
  pendingAdds: Set<string>
  pendingUnlikes: Set<string>
}

export interface MutationCallbacks {
  onTrackAdded: (trackId: string, playlistKind: number) => void
  onTrackUnliked: (trackId: string) => void
  onTrackAddRollback: (trackId: string, playlistKind: number) => void
  onTrackUnlikedRollback: (trackId: string) => void
  onMutationDuringRefresh: () => void
}

interface UsePlaylistsMutationsProps {
  api: YandexMusicAPI | null
  uid?: number
  callbacks: MutationCallbacks
  isRefreshing: boolean
}

/**
 * Handles playlist mutations (add track, unlike track) with:
 * - Pending state tracking for UI loading indicators
 * - Optimistic updates via callbacks
 * - Rollback on API failure
 * - Proper cleanup on unmount
 */
export function usePlaylistsMutations({
  api,
  uid,
  callbacks,
  isRefreshing,
}: UsePlaylistsMutationsProps): UsePlaylistsMutationsResult {
  // State for UI rendering
  const [pendingAdds, setPendingAdds] = useState<Set<string>>(() => new Set())
  const [pendingUnlikes, setPendingUnlikes] = useState<Set<string>>(
    () => new Set(),
  )

  // Refs for synchronous duplicate checking (avoids stale closure)
  const pendingAddsRef = useRef<Set<string>>(new Set())
  const pendingUnlikesRef = useRef<Set<string>>(new Set())

  // Store in-flight promises to deduplicate concurrent requests
  const inFlightAddsRef = useRef<Map<string, Promise<MutationResult>>>(
    new Map(),
  )
  const inFlightUnlikesRef = useRef<Map<string, Promise<MutationResult>>>(
    new Map(),
  )

  // Ref for callbacks to avoid recreating mutation functions
  const callbacksRef = useRef(callbacks)
  useEffect(() => {
    callbacksRef.current = callbacks
  }, [callbacks])

  // Track in-flight requests for cleanup
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  const isMountedRef = useRef(true)

  // Cleanup on unmount or user change to prevent memory leaks
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      // Abort all in-flight requests
      abortControllersRef.current.forEach((controller) => controller.abort())
      abortControllersRef.current.clear()
      // Clear pending state
      pendingAddsRef.current.clear()
      pendingUnlikesRef.current.clear()
      setPendingAdds(new Set())
      setPendingUnlikes(new Set())
    }
  }, [uid])

  const addTrackToPlaylist = useCallback(
    async (trackId: string, playlistKind: number): Promise<MutationResult> => {
      if (!api || !uid) {
        return { success: false, error: 'API not initialized' }
      }

      // Check if request already in-flight - return same promise to prevent race condition
      // This prevents check-then-act race between has() and add()
      const existing = inFlightAddsRef.current.get(trackId)
      if (existing) {
        return existing // Return same promise for duplicate concurrent requests
      }

      // mutationKey includes playlistKind for abort controller tracking
      const mutationKey = `add_${trackId}_${playlistKind}`

      // Create promise for this mutation
      const promise = (async (): Promise<MutationResult> => {
        // Mark as pending (both ref and state)
        pendingAddsRef.current.add(trackId)
        setPendingAdds((prev) => new Set(prev).add(trackId))

      // Create abort controller for this request
      const controller = new AbortController()
      abortControllersRef.current.set(mutationKey, controller)

      try {
        await api.addTrackToPlaylist(
          uid,
          playlistKind,
          trackId,
          controller.signal,
        )

        // Success - notify parent via callback
        if (isMountedRef.current) {
          if (!isRefreshing) {
            // Normal case: update optimistically
            callbacksRef.current.onTrackAdded(trackId, playlistKind)
          } else {
            // Refreshing: mark for re-fetch to sync UI with server state
            callbacksRef.current.onMutationDuringRefresh()
          }
        }

        return { success: true }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return { success: false, error: 'Request cancelled' }
        }

        // Rollback optimistic update on API failure (skip if refreshing to avoid corrupting fresh data)
        if (isMountedRef.current && !isRefreshing) {
          callbacksRef.current.onTrackAddRollback(trackId, playlistKind)
        }

        const errorMessage =
          err instanceof Error ? err.message : 'Failed to add track'
        return { success: false, error: errorMessage }
        } finally {
          // Cleanup (both ref and state)
          // Note: finally always executes even if unmounted, ensuring no memory leaks
          pendingAddsRef.current.delete(trackId)
          abortControllersRef.current.delete(mutationKey)
          inFlightAddsRef.current.delete(trackId)
          if (isMountedRef.current) {
            setPendingAdds((prev) => {
              const next = new Set(prev)
              next.delete(trackId)
              return next
            })
          }
        }
      })()

      // Store promise to deduplicate concurrent calls
      inFlightAddsRef.current.set(trackId, promise)

      return promise
    },
    [api, uid, isRefreshing],
  )

  const unlikeTrack = useCallback(
    async (trackId: string): Promise<MutationResult> => {
      if (!api || !uid) {
        return { success: false, error: 'API not initialized' }
      }

      // Check if request already in-flight - return same promise to prevent race condition
      const existing = inFlightUnlikesRef.current.get(trackId)
      if (existing) {
        return existing // Return same promise for duplicate concurrent requests
      }

      const mutationKey = `unlike_${trackId}`

      // Create promise for this mutation
      const promise = (async (): Promise<MutationResult> => {
        // Mark as pending (both ref and state)
        pendingUnlikesRef.current.add(trackId)
        setPendingUnlikes((prev) => new Set(prev).add(trackId))

      // Create abort controller for this request
      const controller = new AbortController()
      abortControllersRef.current.set(mutationKey, controller)

      try {
        await api.unlikeTrack(uid, trackId, controller.signal)

        // Success - notify parent via callback
        if (isMountedRef.current) {
          if (!isRefreshing) {
            // Normal case: update optimistically
            callbacksRef.current.onTrackUnliked(trackId)
          } else {
            // Refreshing: mark for re-fetch to sync UI with server state
            callbacksRef.current.onMutationDuringRefresh()
          }
        }

        return { success: true }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return { success: false, error: 'Request cancelled' }
        }

        // Rollback optimistic update on API failure (skip if refreshing to avoid corrupting fresh data)
        if (isMountedRef.current && !isRefreshing) {
          callbacksRef.current.onTrackUnlikedRollback(trackId)
        }

        const errorMessage =
          err instanceof Error ? err.message : 'Failed to unlike track'
        return { success: false, error: errorMessage }
        } finally {
          // Cleanup (both ref and state)
          // Note: finally always executes even if unmounted, ensuring no memory leaks
          pendingUnlikesRef.current.delete(trackId)
          abortControllersRef.current.delete(mutationKey)
          inFlightUnlikesRef.current.delete(trackId)
          if (isMountedRef.current) {
            setPendingUnlikes((prev) => {
              const next = new Set(prev)
              next.delete(trackId)
              return next
            })
          }
        }
      })()

      // Store promise to deduplicate concurrent calls
      inFlightUnlikesRef.current.set(trackId, promise)

      return promise
    },
    [api, uid, isRefreshing],
  )

  return {
    addTrackToPlaylist,
    unlikeTrack,
    pendingAdds,
    pendingUnlikes,
  }
}
