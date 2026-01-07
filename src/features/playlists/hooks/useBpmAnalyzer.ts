import { useState, useCallback } from 'react'
import { guess } from 'web-audio-beat-detector'

export function useBpmAnalyzer() {
  const [analyzingTrackId, setAnalyzingTrackId] = useState<string | null>(null)

  const analyzeBpm = useCallback(
    async (
      trackId: string,
      arrayBuffer: ArrayBuffer,
    ): Promise<number | null> => {
      setAnalyzingTrackId(trackId)

      const audioContext = new AudioContext({ sampleRate: 44100 })
      try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        const { bpm } = await guess(audioBuffer)
        return Math.round(bpm)
      } catch (error) {
        console.error('Failed to analyze BPM:', error)
        return null
      } finally {
        await audioContext.close()
        setAnalyzingTrackId(null)
      }
    },
    [],
  )

  return { analyzeBpm, analyzingTrackId }
}
