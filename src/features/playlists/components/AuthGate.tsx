import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/shared'
import { useYandexAuth, type AuthError } from '../hooks/useYandexAuth'
import { PlaylistsApp } from './PlaylistsApp'
import { PlaylistsPageSkeleton } from './PlaylistsPageSkeleton'

// Yandex OAuth only supports Implicit flow (response_type=token) for SPAs.
const OAUTH_URL =
  'https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d'

interface OAuthParams {
  token: string
  expiresIn?: number
}

/**
 * Yandex's OAuth implicit flow redirects to music.yandex.ru with
 * `#access_token=...&token_type=bearer&expires_in=...` in the fragment.
 * Users land there, copy the address bar, and paste it into our input.
 *
 * Accepts: full URL with hash, raw `#access_token=...`, raw `access_token=...`,
 * or a bare token string. Returns null on no match.
 */
function extractOAuthParams(input: string): OAuthParams | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const parseParams = (params: URLSearchParams): OAuthParams | null => {
    const token = params.get('access_token')
    if (!token) return null
    const expiresRaw = params.get('expires_in')
    const expiresIn = expiresRaw ? parseInt(expiresRaw, 10) : undefined
    return {
      token,
      expiresIn: expiresIn && expiresIn > 0 ? expiresIn : undefined,
    }
  }

  // Strategy 1: parse as URL (handles full URL with #fragment or ?query)
  try {
    const url = new URL(trimmed)
    if (url.hash) {
      const result = parseParams(
        new URLSearchParams(url.hash.replace(/^#/, '')),
      )
      if (result) return result
    }
    const result = parseParams(url.searchParams)
    if (result) return result
  } catch {
    // Not a valid URL — fall through to fragment/query/raw checks
  }

  // Strategy 2: raw fragment or query string starting with `#`/`?` or `access_token=`
  const fragmentLike = trimmed.replace(/^[#?]/, '')
  if (fragmentLike.includes('access_token=')) {
    const result = parseParams(new URLSearchParams(fragmentLike))
    if (result) return result
  }

  // Strategy 3: bare token — Yandex tokens look like `y0_AgAAA...` or similar
  // Reject anything containing whitespace or an `=` sign that we already failed to parse
  if (!/\s/.test(trimmed) && !trimmed.includes('=')) {
    return { token: trimmed }
  }

  return null
}

export function AuthGate() {
  const {
    auth,
    isAuthenticated,
    loginWithToken,
    retryRestore,
    logout,
    isLoading,
    restoreAttempt,
    error,
  } = useYandexAuth()

  const [hashError, setHashError] = useState<AuthError | null>(null)
  const [manualToken, setManualToken] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const hashHandledRef = useRef(false)

  // Auto-parse #access_token from URL on mount (in case the OAuth app is ever
  // reconfigured to redirect back here — currently it goes to music.yandex.ru)
  useEffect(() => {
    if (hashHandledRef.current) return
    hashHandledRef.current = true

    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash || hash.length < 2) return

    const params = extractOAuthParams(hash)
    if (!params) return

    // Clean URL immediately — token shouldn't linger in history/referrer
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    )

    setSubmitting(true)
    loginWithToken(params.token, params.expiresIn)
      .catch((err) => {
        setHashError({
          category: 'unknown',
          message: err instanceof Error ? err.message : 'Login failed',
          status: null,
          bodyText: '',
        })
      })
      .finally(() => {
        setSubmitting(false)
      })
  }, [loginWithToken])

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setParseError(null)
    const params = extractOAuthParams(manualToken)
    if (!params) {
      setParseError(
        'Could not find an access_token. Paste the full URL from the Yandex tab address bar.',
      )
      return
    }
    setSubmitting(true)
    setHashError(null)
    try {
      await loginWithToken(params.token, params.expiresIn)
      setManualToken('')
    } catch {
      // error already surfaced via auth.error
    } finally {
      setSubmitting(false)
    }
  }

  if (isAuthenticated && auth.token && auth.user) {
    return (
      <PlaylistsApp
        key={auth.user.uid}
        user={auth.user}
        token={auth.token}
        onLogout={logout}
      />
    )
  }

  if (isLoading) {
    return <RestoringState attempt={restoreAttempt} />
  }

  // Restore failed but token is still in storage (non-auth failure) → recovery UI
  const canRetryRestore = error !== null && error.category !== 'auth'
  if (canRetryRestore) {
    return (
      <RestoreFailed
        error={error}
        onRetry={retryRestore}
        onSignInAgain={logout}
      />
    )
  }

  const displayedError = hashError ?? error

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
        <div className="text-center space-y-2">
          <span
            className="i-lucide-music-2 size-10 text-primary mx-auto block"
            aria-hidden="true"
          />
          <h2 className="font-serif text-2xl font-medium text-foreground">
            Connect Yandex Music
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sign in to sort your liked tracks into playlists. Your token stays
            in this browser.
          </p>
        </div>

        <ol className="space-y-2 text-sm text-foreground">
          <Step n={1}>
            Click <strong>Open Yandex login</strong> below — it opens in a new
            tab.
          </Step>
          <Step n={2}>Authorize the app on the Yandex page.</Step>
          <Step n={3}>
            You'll land on{' '}
            <code className="font-mono text-xs px-1 py-0.5 rounded bg-secondary text-foreground">
              music.yandex.ru/#access_token=…
            </code>
            . Copy the <strong>full URL</strong> from the address bar.
          </Step>
          <Step n={4}>Paste it into the field below and submit.</Step>
        </ol>

        <a
          href={OAUTH_URL}
          target="_blank"
          rel="noopener noreferrer"
          // Inline backgroundColor guarantees the rest-state fill even if UnoCSS's
          // dev-mode per-chunk class generation skips `bg-primary` for this route.
          style={{ backgroundColor: 'hsl(var(--primary))' }}
          className={cn(
            'flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-medium text-primary-foreground',
            'hover:brightness-110 active:brightness-95 transition-[filter] focus-ring shadow-md',
          )}
        >
          <span className="i-lucide-external-link size-4" aria-hidden="true" />
          Open Yandex login
        </a>

        <form onSubmit={handleManualSubmit} className="space-y-3">
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
              Pasted URL or token
            </span>
            <textarea
              value={manualToken}
              onChange={(e) => {
                setManualToken(e.target.value)
                if (parseError) setParseError(null)
              }}
              placeholder="https://music.yandex.ru/#access_token=y0_…"
              autoComplete="off"
              spellCheck={false}
              rows={3}
              className={cn(
                'block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground resize-none',
                'focus-ring placeholder:text-muted-foreground/60 placeholder:font-sans',
              )}
            />
          </label>
          {parseError && (
            <p className="text-xs text-destructive flex items-start gap-1.5">
              <span
                className="i-lucide-alert-circle size-3.5 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{parseError}</span>
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || !manualToken.trim()}
            className={cn(
              'flex items-center justify-center gap-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground',
              'hover:bg-secondary transition-colors focus-ring',
              'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-card',
            )}
          >
            {submitting && (
              <span
                className="i-lucide-loader-2 size-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {submitting ? 'Validating…' : 'Sign in'}
          </button>
        </form>

        {displayedError && !submitting && (
          <ErrorBanner error={displayedError} />
        )}
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 items-start">
      <span
        className="inline-flex items-center justify-center size-5 rounded-full bg-secondary text-secondary-foreground text-[11px] font-medium shrink-0 mt-0.5"
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}

function RestoringState({ attempt }: { attempt: 0 | 1 | 2 }) {
  return (
    <PlaylistsPageSkeleton
      loadingHint={
        attempt === 2 ? 'Retrying — this can take a few seconds' : undefined
      }
    />
  )
}

function categoryHeading(category: AuthError['category']): string {
  switch (category) {
    case 'worker':
    case 'network':
      return 'Proxy unreachable'
    case 'timeout':
      return 'Request timed out'
    case 'auth':
      return 'Authentication error'
    default:
      return 'Something went wrong'
  }
}

function categoryHint(category: AuthError['category']): string {
  switch (category) {
    case 'worker':
    case 'network':
      return 'Could not reach the proxy. Check that the worker is running, or try again.'
    case 'timeout':
      return 'The request took too long. Try again — cold workers warm up after the first hit.'
    case 'auth':
      return 'Your token was rejected. Sign in again to get a fresh one.'
    default:
      return 'An unexpected error occurred while restoring your session.'
  }
}

function RestoreFailed({
  error,
  onRetry,
  onSignInAgain,
}: {
  error: AuthError
  onRetry: () => void
  onSignInAgain: () => void
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-border bg-card p-8 space-y-5">
        <div className="text-center space-y-2">
          <span
            className="i-lucide-alert-triangle size-10 text-destructive mx-auto block"
            aria-hidden="true"
          />
          <h2 className="font-serif text-2xl font-medium text-foreground">
            {categoryHeading(error.category)}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {categoryHint(error.category)}
          </p>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onRetry}
            style={{ backgroundColor: 'hsl(var(--primary))' }}
            className={cn(
              'flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-medium text-primary-foreground',
              'hover:brightness-110 active:brightness-95 transition-[filter] focus-ring shadow-md',
            )}
          >
            <span className="i-lucide-rotate-cw size-4" aria-hidden="true" />
            Retry
          </button>
          <button
            type="button"
            onClick={onSignInAgain}
            className={cn(
              'flex items-center justify-center gap-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground',
              'hover:bg-secondary transition-colors focus-ring',
            )}
          >
            <span className="i-lucide-log-in size-4" aria-hidden="true" />
            Sign in again
          </button>
        </div>

        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-ring rounded"
            aria-expanded={detailsOpen}
          >
            <span
              className={cn(
                'i-lucide-chevron-right size-3 transition-transform',
                detailsOpen && 'rotate-90',
              )}
              aria-hidden="true"
            />
            {detailsOpen ? 'Hide' : 'Show'} details
          </button>
          {detailsOpen && (
            <dl className="mt-2 space-y-1.5 text-xs">
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-20 shrink-0">
                  Category
                </dt>
                <dd className="font-mono text-foreground">{error.category}</dd>
              </div>
              {error.status !== null && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-20 shrink-0">
                    Status
                  </dt>
                  <dd className="font-mono text-foreground">{error.status}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-20 shrink-0">Message</dt>
                <dd className="font-mono text-foreground break-all">
                  {error.message}
                </dd>
              </div>
              {error.bodyText && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-20 shrink-0">Body</dt>
                  <dd className="font-mono text-foreground break-all whitespace-pre-wrap max-h-32 overflow-auto">
                    {error.bodyText.slice(0, 500)}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>
    </div>
  )
}

function ErrorBanner({ error }: { error: AuthError }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-foreground"
    >
      <span
        className="i-lucide-alert-circle size-4 text-destructive shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <span className="break-words">{error.message}</span>
    </div>
  )
}
