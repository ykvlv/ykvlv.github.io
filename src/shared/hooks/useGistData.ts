import { useState, useEffect } from 'react'

const { GIST_ID } = import.meta.env

interface UseGistDataResult<T> {
  data?: T
  isLoading: boolean
  error?: string
}

export function useGistData<T>(filename: string): UseGistDataResult<T> {
  const [data, setData] = useState<T>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()

    const fetchData = async () => {
      setIsLoading(true)
      setError(undefined)
      // A retry or filename change must not pair an error with stale data
      setData(undefined)

      try {
        const response = await fetch(
          `https://gist.githubusercontent.com/raw/${GIST_ID}/${filename}`,
          { cache: 'no-cache', signal: controller.signal },
        )

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
  }, [filename])

  return { data, isLoading, error }
}
