import { useState, useEffect, useCallback, useRef } from 'react'
import type { YandexUserInfo } from '../types'
import { YandexMusicAPI } from '../lib/yandex-music-api'

const STORAGE_KEY = 'ykvlv_playlists_yandex_music_token'

export interface AuthState {
  token?: string
  user?: YandexUserInfo
}

interface UseYandexAuthResult {
  auth: AuthState
  isAuthenticated: boolean
  loginWithToken: (token: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  error: string | null
}

function isValidAuthState(data: unknown): data is Required<AuthState> {
  return (
    typeof data === 'object' &&
    data !== null &&
    'token' in data &&
    'user' in data &&
    typeof data.token === 'string' &&
    typeof (data as AuthState).user?.uid === 'number'
  )
}

export function useYandexAuth(): UseYandexAuthResult {
  const [auth, setAuth] = useState<AuthState>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const initializedRef = useRef(false)

  // Initialize: restore from localStorage
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const abortController = new AbortController()
    const stored = localStorage.getItem(STORAGE_KEY)

    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored)
        if (isValidAuthState(parsed)) {
          YandexMusicAPI.fetchAccountStatus(
            parsed.token,
            abortController.signal,
          )
            .then((user) => {
              if (!abortController.signal.aborted) {
                setAuth({ token: parsed.token, user })
              }
            })
            .catch((err) => {
              if (err instanceof DOMException && err.name === 'AbortError')
                return
              localStorage.removeItem(STORAGE_KEY)
              setError('Session expired')
            })
            .finally(() => {
              if (!abortController.signal.aborted) {
                setIsLoading(false)
              }
            })
        } else {
          localStorage.removeItem(STORAGE_KEY)
          setIsLoading(false)
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
        setIsLoading(false)
      }
    } else {
      setIsLoading(false)
    }

    return () => abortController.abort()
  }, [])

  const loginWithToken = useCallback(async (token: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const user = await YandexMusicAPI.fetchAccountStatus(
        token,
        new AbortController().signal, // No cancellation needed
      )

      const stored: AuthState = { token, user }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

      setAuth({ token, user })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAuth({})
  }, [])

  const isAuthenticated = Boolean(auth.token && auth.user)

  return {
    auth,
    isAuthenticated,
    loginWithToken,
    logout,
    isLoading,
    error,
  }
}
