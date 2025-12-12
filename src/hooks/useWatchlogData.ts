import { useState, useEffect } from 'react'
import type { WatchlogData } from '@/types/watchlog'

const GIST_ID = import.meta.env.GIST_ID
const GIST_FILENAME = import.meta.env.GIST_FILENAME

if (!GIST_ID || !GIST_FILENAME) {
  throw new Error(
    'GIST_ID and GIST_FILENAME environment variables are required',
  )
}

const GIST_RAW_URL = `https://gist.githubusercontent.com/raw/${GIST_ID}/${GIST_FILENAME}`

interface UseWatchlogDataResult {
  data?: WatchlogData
  isLoading: boolean
  error?: string
}

export function useWatchlogData(): UseWatchlogDataResult {
  const [data, setData] = useState<WatchlogData>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()

    const fetchData = async () => {
      setIsLoading(true)
      setError(undefined)

      try {
        const response = await fetch(GIST_RAW_URL, {
          cache: 'no-cache',
          signal: controller.signal,
        })

        if (!response.ok) {
          setError(`Failed to fetch: ${response.status}`)
          return
        }

        setData(await response.json())
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void fetchData()
    return () => controller.abort()
  }, [])

  return { data, isLoading, error }
}
