import { useCallback, useEffect, useRef, useState } from 'react'
import { YandexMusicAPI } from '../lib/yandex-music-api'

export type BpmDetectionStatus = 'idle' | 'queued' | 'fetching' | 'analyzing'

interface UseBpmDetectionQueueProps {
  api: YandexMusicAPI | null
  setBpm: (trackId: string, bpm: number) => void
  analyzeBpm: (trackId: string, buffer: ArrayBuffer) => Promise<number | null>
  onError?: (trackId: string, message: string) => void
}

export interface UseBpmDetectionQueueResult {
  detect: (trackId: string) => void
  detectMany: (trackIds: string[]) => void
  detectWithUrl: (
    trackId: string,
    downloadUrl: string,
    options?: {
      onBuffer?: (buffer: ArrayBuffer) => void
      skipAnalysis?: boolean
    },
  ) => void
  cancelAll: () => void
  cancelOne: (trackId: string) => void
  cancelPlaybackDetection: () => void
  getStatus: (trackId: string) => BpmDetectionStatus
  queueLength: number
  processedCount: number
  totalCount: number
  isProcessing: boolean
}

export function useBpmDetectionQueue({
  api,
  setBpm,
  analyzeBpm,
  onError,
}: UseBpmDetectionQueueProps): UseBpmDetectionQueueResult {
  const queueRef = useRef<string[]>([])
  const statusMapRef = useRef<Map<string, BpmDetectionStatus>>(new Map())
  const isProcessingRef = useRef(false)
  const isMountedRef = useRef(true)
  const currentAbortControllerRef = useRef<AbortController | null>(null)
  const playbackAbortRef = useRef<AbortController | null>(null)

  const apiRef = useRef(api)
  const setBpmRef = useRef(setBpm)
  const analyzeBpmRef = useRef(analyzeBpm)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    apiRef.current = api
    setBpmRef.current = setBpm
    analyzeBpmRef.current = analyzeBpm
    onErrorRef.current = onError
  })

  const [processedCount, setProcessedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    isMountedRef.current = true
    const queue = queueRef
    const statusMap = statusMapRef
    const abortController = currentAbortControllerRef
    return () => {
      isMountedRef.current = false
      abortController.current?.abort()
      abortController.current = null
      playbackAbortRef.current?.abort()
      playbackAbortRef.current = null
      queue.current = []
      statusMap.current.clear()
    }
  }, [])

  const bump = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  const drain = useCallback(async () => {
    if (isProcessingRef.current) return
    if (queueRef.current.length === 0) return
    if (!apiRef.current) {
      bump()
      return
    }

    isProcessingRef.current = true
    bump()

    try {
      while (queueRef.current.length > 0 && isMountedRef.current) {
        const api = apiRef.current
        if (!api) break

        const trackId = queueRef.current[0]
        const controller = new AbortController()
        currentAbortControllerRef.current = controller

        statusMapRef.current.set(trackId, 'fetching')
        bump()

        let aborted = false
        try {
          const url = await api.getTrackDownloadUrl(trackId, controller.signal)
          if (controller.signal.aborted || !isMountedRef.current) {
            aborted = true
            break
          }

          const buffer = await YandexMusicAPI.fetchProxyAudio(
            url,
            controller.signal,
          )
          if (controller.signal.aborted || !isMountedRef.current) {
            aborted = true
            break
          }

          statusMapRef.current.set(trackId, 'analyzing')
          bump()

          const bpm = await analyzeBpmRef.current(trackId, buffer)
          if (!isMountedRef.current) {
            aborted = true
            break
          }

          if (bpm !== null) {
            setBpmRef.current(trackId, bpm)
          } else {
            onErrorRef.current?.(trackId, 'Could not detect BPM')
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            aborted = true
            break
          }
          const msg =
            err instanceof Error ? err.message : 'BPM detection failed'
          onErrorRef.current?.(trackId, msg)
        } finally {
          currentAbortControllerRef.current = null
          if (!aborted) {
            queueRef.current.shift()
            statusMapRef.current.delete(trackId)
            if (isMountedRef.current) {
              setProcessedCount((c) => c + 1)
            }
          }
        }

        if (isMountedRef.current) bump()
      }
    } finally {
      isProcessingRef.current = false
      if (isMountedRef.current) {
        if (queueRef.current.length === 0) {
          setProcessedCount(0)
          setTotalCount(0)
        }
        bump()
      }
    }
  }, [bump])

  const detect = useCallback(
    (trackId: string) => {
      if (statusMapRef.current.has(trackId)) return
      queueRef.current.push(trackId)
      statusMapRef.current.set(trackId, 'queued')
      setTotalCount((t) => t + 1)
      bump()
      void drain()
    },
    [bump, drain],
  )

  const detectMany = useCallback(
    (trackIds: string[]) => {
      let added = 0
      for (const id of trackIds) {
        if (statusMapRef.current.has(id)) continue
        queueRef.current.push(id)
        statusMapRef.current.set(id, 'queued')
        added++
      }
      if (added > 0) {
        setTotalCount((t) => t + added)
        bump()
        void drain()
      }
    },
    [bump, drain],
  )

  const cancelAll = useCallback(() => {
    queueRef.current = []
    statusMapRef.current.clear()
    currentAbortControllerRef.current?.abort()
    currentAbortControllerRef.current = null
    playbackAbortRef.current?.abort()
    playbackAbortRef.current = null
    setProcessedCount(0)
    setTotalCount(0)
    bump()
  }, [bump])

  const cancelPlaybackDetection = useCallback(() => {
    playbackAbortRef.current?.abort()
    playbackAbortRef.current = null
  }, [])

  const cancelOne = useCallback(
    (trackId: string) => {
      const status = statusMapRef.current.get(trackId)
      if (!status) return
      if (status === 'fetching' || status === 'analyzing') {
        // Only abort if this track is the one currently being processed by drain
        if (queueRef.current[0] === trackId) {
          currentAbortControllerRef.current?.abort()
        }
        return
      }
      queueRef.current = queueRef.current.filter((id) => id !== trackId)
      statusMapRef.current.delete(trackId)
      bump()
    },
    [bump],
  )

  const detectWithUrl = useCallback(
    (
      trackId: string,
      downloadUrl: string,
      options?: {
        onBuffer?: (buffer: ArrayBuffer) => void
        skipAnalysis?: boolean
      },
    ) => {
      const current = statusMapRef.current.get(trackId)
      if (current === 'fetching' || current === 'analyzing') return

      // Remove from queue if it was waiting — we'll handle it now
      if (current === 'queued') {
        queueRef.current = queueRef.current.filter((id) => id !== trackId)
      }

      // Abort previous playback-triggered detection
      playbackAbortRef.current?.abort()
      const controller = new AbortController()
      playbackAbortRef.current = controller

      statusMapRef.current.set(trackId, 'fetching')
      bump()

      void (async () => {
        try {
          const buffer = await YandexMusicAPI.fetchProxyAudio(
            downloadUrl,
            controller.signal,
          )
          if (controller.signal.aborted || !isMountedRef.current) return

          // Pass buffer to caller (e.g. player blob URL swap) before analysis
          options?.onBuffer?.(buffer)

          if (options?.skipAnalysis) return

          statusMapRef.current.set(trackId, 'analyzing')
          bump()

          const bpm = await analyzeBpmRef.current(trackId, buffer)
          if (!isMountedRef.current) return

          if (bpm !== null) {
            setBpmRef.current(trackId, bpm)
          } else {
            onErrorRef.current?.(trackId, 'Could not detect BPM')
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (!isMountedRef.current) return
          const msg =
            err instanceof Error ? err.message : 'BPM detection failed'
          onErrorRef.current?.(trackId, msg)
        } finally {
          statusMapRef.current.delete(trackId)
          if (isMountedRef.current) bump()
        }
      })()
    },
    [bump],
  )

  const getStatus = useCallback(
    (trackId: string): BpmDetectionStatus => {
      void version
      return statusMapRef.current.get(trackId) ?? 'idle'
    },
    [version],
  )

  return {
    detect,
    detectMany,
    detectWithUrl,
    cancelAll,
    cancelOne,
    cancelPlaybackDetection,
    getStatus,
    queueLength: queueRef.current.length,
    processedCount,
    totalCount,
    isProcessing: isProcessingRef.current,
  }
}
