import { useState, useEffect, useCallback, useRef } from 'react'
import type { YandexUserInfo } from '../types'
import {
  YandexApiError,
  YandexMusicAPI,
  type YandexApiErrorCategory,
} from '../lib/yandex-music-api'

const STORAGE_KEY = 'ykvlv_playlists_yandex_music_token'
const ATTEMPT_1_TIMEOUT_MS = 5000
const ATTEMPT_2_TIMEOUT_MS = 12000
const RETRY_DELAY_MS = 1500
// Hard cap on total restore time — guarantees the loader can never spin forever
const RESTORE_WATCHDOG_MS = 25000

export interface AuthState {
  token?: string
  user?: YandexUserInfo
  expiresAt?: number
}

export interface AuthError {
  category: YandexApiErrorCategory
  message: string
  status: number | null
  bodyText: string
}

export type RestoreAttempt = 0 | 1 | 2

interface UseYandexAuthResult {
  auth: AuthState
  isAuthenticated: boolean
  loginWithToken: (token: string, expiresIn?: number) => Promise<void>
  retryRestore: () => void
  cancelRestore: () => void
  logout: () => void
  isLoading: boolean
  restoreAttempt: RestoreAttempt
  error: AuthError | null
}

function isValidAuthState(
  data: unknown,
): data is Required<Pick<AuthState, 'token' | 'user'>> & AuthState {
  return (
    typeof data === 'object' &&
    data !== null &&
    'token' in data &&
    'user' in data &&
    typeof data.token === 'string' &&
    typeof (data as AuthState).user?.uid === 'number'
  )
}

function toAuthError(err: unknown): AuthError {
  if (err instanceof YandexApiError) {
    return {
      category: err.category,
      message: err.message,
      status: err.status,
      bodyText: err.bodyText,
    }
  }
  if (err instanceof Error) {
    return {
      category: 'unknown',
      message: err.message,
      status: null,
      bodyText: '',
    }
  }
  return {
    category: 'unknown',
    message: String(err),
    status: null,
    bodyText: '',
  }
}

function isAuthCategory(category: YandexApiErrorCategory): boolean {
  return category === 'auth'
}

function isRetryableCategory(category: YandexApiErrorCategory): boolean {
  return (
    category === 'worker' || category === 'timeout' || category === 'network'
  )
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export function useYandexAuth(): UseYandexAuthResult {
  const [auth, setAuth] = useState<AuthState>({})
  const [isLoading, setIsLoading] = useState(true)
  const [restoreAttempt, setRestoreAttempt] = useState<RestoreAttempt>(0)
  const [error, setError] = useState<AuthError | null>(null)

  const restoreAbortRef = useRef<AbortController | null>(null)

  const restoreFromStorage = useCallback(async (token: string) => {
    restoreAbortRef.current?.abort()
    const controller = new AbortController()
    restoreAbortRef.current = controller

    setIsLoading(true)
    setError(null)
    setRestoreAttempt(1)

    // Watchdog: hard cap on total restore time. If the inner promise hangs for
    // any reason (cold worker stalled past both timeouts, browser quirk, etc.)
    // this guarantees the user sees a recoverable failure UI instead of an
    // eternal spinner.
    const watchdogId = setTimeout(() => {
      if (controller.signal.aborted) return
      console.error(
        '[YandexAuth] Restore watchdog fired after',
        RESTORE_WATCHDOG_MS,
        'ms — forcing failure',
      )
      controller.abort()
      setError({
        category: 'timeout',
        message: `Session restore timed out after ${RESTORE_WATCHDOG_MS / 1000}s`,
        status: null,
        bodyText: '',
      })
      setIsLoading(false)
      setRestoreAttempt(0)
    }, RESTORE_WATCHDOG_MS)

    try {
      const user = await YandexMusicAPI.fetchAccountStatus(
        token,
        controller.signal,
        ATTEMPT_1_TIMEOUT_MS,
      )
      if (controller.signal.aborted) return
      setAuth({ token, user })
    } catch (firstErr) {
      if (firstErr instanceof DOMException && firstErr.name === 'AbortError') {
        return
      }

      const firstAuthErr = toAuthError(firstErr)
      console.error('[YandexAuth] Restore attempt 1 failed:', firstAuthErr)

      if (isAuthCategory(firstAuthErr.category)) {
        localStorage.removeItem(STORAGE_KEY)
        if (!controller.signal.aborted) {
          setError(firstAuthErr)
          setIsLoading(false)
          setRestoreAttempt(0)
        }
        return
      }

      if (!isRetryableCategory(firstAuthErr.category)) {
        if (!controller.signal.aborted) {
          setError(firstAuthErr)
          setIsLoading(false)
          setRestoreAttempt(0)
        }
        return
      }

      // Cold-start retry: longer timeout after a brief pause
      try {
        setRestoreAttempt(2)
        await delay(RETRY_DELAY_MS, controller.signal)
        const user = await YandexMusicAPI.fetchAccountStatus(
          token,
          controller.signal,
          ATTEMPT_2_TIMEOUT_MS,
        )
        if (controller.signal.aborted) return
        setAuth({ token, user })
      } catch (secondErr) {
        if (
          secondErr instanceof DOMException &&
          secondErr.name === 'AbortError'
        ) {
          return
        }
        const secondAuthErr = toAuthError(secondErr)
        console.error('[YandexAuth] Restore attempt 2 failed:', secondAuthErr)
        if (isAuthCategory(secondAuthErr.category)) {
          localStorage.removeItem(STORAGE_KEY)
        }
        if (!controller.signal.aborted) {
          setError(secondAuthErr)
        }
      }
    } finally {
      clearTimeout(watchdogId)
      if (!controller.signal.aborted) {
        setIsLoading(false)
        setRestoreAttempt(0)
      }
    }
  }, [])

  // Initial restore from localStorage.
  //
  // StrictMode in dev fires this effect as mount→cleanup→mount. If we abort
  // the in-flight request during cleanup AND guard the second mount with
  // initializedRef, the only restore attempt dies and the loader hangs
  // forever. Instead: don't gate, don't abort on cleanup. The second mount
  // re-enters restoreFromStorage, which calls `restoreAbortRef.current?.abort()`
  // at its start to cancel the duplicate, then runs cleanly. In prod (no
  // StrictMode) this fires once.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      setIsLoading(false)
      return
    }

    let parsedToken: string | null = null
    try {
      const parsed: unknown = JSON.parse(stored)
      if (isValidAuthState(parsed)) {
        // Check if token has expired
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
          localStorage.removeItem(STORAGE_KEY)
          setError({
            category: 'auth',
            message: 'Session expired — please sign in again',
            status: null,
            bodyText: '',
          })
          setIsLoading(false)
          return
        }
        parsedToken = parsed.token
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }

    if (parsedToken) {
      void restoreFromStorage(parsedToken)
    } else {
      setIsLoading(false)
    }
    // No cleanup: aborting here kills the StrictMode-first-mount restore.
    // Subsequent restoreFromStorage / loginWithToken / logout / cancelRestore
    // calls all explicitly abort the previous controller themselves.
  }, [restoreFromStorage])

  const retryRestore = useCallback(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    try {
      const parsed: unknown = JSON.parse(stored)
      if (isValidAuthState(parsed)) {
        void restoreFromStorage(parsed.token)
      }
    } catch {
      // Corrupt storage: nothing to retry with
    }
  }, [restoreFromStorage])

  const cancelRestore = useCallback(() => {
    restoreAbortRef.current?.abort()
    restoreAbortRef.current = null
    setIsLoading(false)
    setRestoreAttempt(0)
    setError(null)
  }, [])

  const loginWithToken = useCallback(
    async (token: string, expiresIn?: number) => {
      restoreAbortRef.current?.abort()
      const controller = new AbortController()
      restoreAbortRef.current = controller

      setIsLoading(true)
      setError(null)
      setRestoreAttempt(0)

      try {
        const user = await YandexMusicAPI.fetchAccountStatus(
          token,
          controller.signal,
        )
        if (controller.signal.aborted) return

        const expiresAt =
          expiresIn && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined
        const stored: AuthState = { token, user, expiresAt }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
        setAuth({ token, user })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err
        }
        const authErr = toAuthError(err)
        setError(authErr)
        throw err
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    },
    [],
  )

  const logout = useCallback(() => {
    restoreAbortRef.current?.abort()
    restoreAbortRef.current = null
    localStorage.removeItem(STORAGE_KEY)
    setAuth({})
    setError(null)
    setRestoreAttempt(0)
    setIsLoading(false)
  }, [])

  const isAuthenticated = Boolean(auth.token && auth.user)

  return {
    auth,
    isAuthenticated,
    loginWithToken,
    retryRestore,
    cancelRestore,
    logout,
    isLoading,
    restoreAttempt,
    error,
  }
}
