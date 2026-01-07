import { useState, useCallback, useEffect } from 'react'

const CACHE_KEY = 'ykvlv_playlists_bpm_cache'
const MULTIPLIER_CYCLE = [1, 2, 0.5] as const

type BpmMultiplier = (typeof MULTIPLIER_CYCLE)[number]

interface BpmEntry {
  bpm: number
  multiplier: BpmMultiplier
}

type BpmCache = Record<string, BpmEntry>

function isValidBpmEntry(entry: unknown): entry is BpmEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const { bpm, multiplier } = entry as Record<string, unknown>
  return (
    typeof bpm === 'number' &&
    MULTIPLIER_CYCLE.includes(multiplier as BpmMultiplier)
  )
}

function loadCache(): BpmCache {
  try {
    const data = localStorage.getItem(CACHE_KEY)
    if (!data) return {}

    const parsed: unknown = JSON.parse(data)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return {}

    // Filter out invalid entries
    const result: BpmCache = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (isValidBpmEntry(value)) {
        result[key] = value
      }
    }
    return result
  } catch {
    return {}
  }
}

function saveCache(cache: BpmCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage full or disabled
  }
}

export function useBpmCache() {
  const [cache, setCache] = useState<BpmCache>(loadCache)

  useEffect(() => {
    setCache(loadCache())
  }, [])

  const getBpm = useCallback(
    (trackId: string): number | null => {
      const entry = cache[trackId]
      if (!entry) return null
      return Math.round(entry.bpm * entry.multiplier)
    },
    [cache],
  )

  const setBpm = useCallback((trackId: string, bpm: number): void => {
    setCache((prev) => {
      const next = {
        ...prev,
        [trackId]: { bpm, multiplier: 1 as BpmMultiplier },
      }
      saveCache(next)
      return next
    })
  }, [])

  const cycleBpmMultiplier = useCallback((trackId: string): void => {
    setCache((prev) => {
      const entry = prev[trackId]
      if (!entry) return prev
      const currentIndex = MULTIPLIER_CYCLE.indexOf(entry.multiplier)
      const nextIndex = (currentIndex + 1) % MULTIPLIER_CYCLE.length
      const next = {
        ...prev,
        [trackId]: { ...entry, multiplier: MULTIPLIER_CYCLE[nextIndex] },
      }
      saveCache(next)
      return next
    })
  }, [])

  return { cache, getBpm, setBpm, cycleBpmMultiplier }
}
