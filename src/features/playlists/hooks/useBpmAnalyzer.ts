import { useCallback, useEffect, useRef } from 'react'
import { guess } from 'web-audio-beat-detector'

export function useBpmAnalyzer() {
  const ctxRef = useRef<AudioContext | null>(null)

  const getContext = () => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext({ sampleRate: 44100 })
    }
    return ctxRef.current
  }

  useEffect(() => {
    return () => {
      void ctxRef.current?.close()
      ctxRef.current = null
    }
  }, [])

  const analyzeBpm = useCallback(
    async (
      _trackId: string,
      arrayBuffer: ArrayBuffer,
    ): Promise<number | null> => {
      try {
        const ctx = getContext()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        const { bpm } = await guess(audioBuffer)
        return Math.round(bpm)
      } catch (error) {
        console.error('Failed to analyze BPM:', error)
        return null
      }
    },
    [],
  )

  return { analyzeBpm }
}
