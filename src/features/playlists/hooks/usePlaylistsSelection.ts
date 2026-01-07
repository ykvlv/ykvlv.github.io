import { useState, useCallback, useEffect } from 'react'

/** localStorage key prefix for persisting playlist selection */
const STORAGE_KEY_PREFIX = 'ykvlv_playlists_selection'

/** Safe localStorage access with SSR guard */
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return typeof window !== 'undefined' ? localStorage.getItem(key) : null
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, value)
      }
    } catch {
      // localStorage full or disabled
    }
  },
}

export interface UsePlaylistsSelectionResult {
  selectedPlaylistKinds: number[]
  setSelectedPlaylistKinds: (kinds: number[]) => void
}

/** Parse selection from localStorage */
const parseStoredSelection = (storageKey: string | null): number[] => {
  if (!storageKey) return []

  const stored = safeLocalStorage.getItem(storageKey)
  if (!stored) return []

  try {
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'number')) {
      return parsed
    }
  } catch {
    // Corrupted data
  }
  return []
}

/**
 * Manages playlist selection state with localStorage persistence.
 * Selection is persisted per user (uid).
 * Re-syncs from localStorage when uid changes.
 */
export function usePlaylistsSelection(
  uid: number | undefined,
): UsePlaylistsSelectionResult {
  const storageKey = uid ? `${STORAGE_KEY_PREFIX}_${uid}` : null

  const [selectedPlaylistKinds, setSelectedState] = useState<number[]>(() =>
    parseStoredSelection(storageKey),
  )

  // Re-sync from localStorage when uid changes
  useEffect(() => {
    setSelectedState(parseStoredSelection(storageKey))
  }, [storageKey])

  const setSelectedPlaylistKinds = useCallback(
    (kinds: number[]) => {
      setSelectedState(kinds)
      if (storageKey) {
        safeLocalStorage.setItem(storageKey, JSON.stringify(kinds))
      }
    },
    [storageKey],
  )

  return { selectedPlaylistKinds, setSelectedPlaylistKinds }
}
