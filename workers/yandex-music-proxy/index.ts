/**
 * Cloudflare Worker for proxying requests to Yandex Music API
 *
 * Required due to Yandex API CORS restrictions.
 */

interface Env {
  ALLOWED_ORIGINS: string
}

const YANDEX_API_BASE = 'https://api.music.yandex.net'

const ALLOWED_PATH_PREFIXES = ['/account/status', '/users/', '/tracks']

// Only api.music.yandex.net is needed: the X-Yandex-Music-Client Android header
// forces Yandex to return download-info/audio URLs on this same CDN host
const ALLOWED_EXTERNAL_HOSTS = ['api.music.yandex.net']

const FORWARDED_REQUEST_HEADERS = ['authorization', 'content-type', 'accept']

const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-length']

// ============================================================================
// Helper Functions
// ============================================================================

function parseAllowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
}

function isExternalUrlAllowed(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return ALLOWED_EXTERNAL_HOSTS.includes(url.hostname)
  } catch {
    return false
  }
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  try {
    const url = new URL(origin)
    return allowedOrigins.includes(url.origin)
  } catch {
    return false
  }
}

function addCorsHeaders(headers: Headers, origin: string): Headers {
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set(
    'Access-Control-Expose-Headers',
    'Content-Range, Accept-Ranges, Content-Length',
  )
  return headers
}

function corsResponse(origin: string, allowedOrigins: string[]): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': isOriginAllowed(origin, allowedOrigins)
        ? origin
        : '',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
      'Access-Control-Max-Age': '86400',
    },
  })
}

function errorResponse(
  error: unknown,
  errorType: string,
  origin: string,
): Response {
  console.error(errorType, error)
  return new Response(
    JSON.stringify({ error: errorType, message: 'An internal error occurred' }),
    {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
    },
  )
}

function forbiddenResponse(message = 'Forbidden'): Response {
  return new Response(message, {
    status: 403,
    headers: { 'Content-Type': 'text/plain' },
  })
}

function badRequestResponse(message: string, origin: string): Response {
  return new Response(message, {
    status: 400,
    headers: {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': origin,
    },
  })
}

// ============================================================================
// Proxy Handlers
// ============================================================================

async function proxyExternalUrl(
  url: string,
  origin: string,
  contentType?: string,
  request?: Request,
): Promise<Response> {
  const fetchHeaders = new Headers()
  const rangeHeader = request?.headers.get('Range')
  if (rangeHeader) {
    fetchHeaders.set('Range', rangeHeader)
  }

  const response = await fetch(url, { headers: fetchHeaders })

  const headers = new Headers()
  addCorsHeaders(headers, origin)
  headers.set(
    'Content-Type',
    contentType ||
      response.headers.get('Content-Type') ||
      'application/octet-stream',
  )

  // Forward range-related headers for seeking support
  for (const name of ['Content-Range', 'Accept-Ranges', 'Content-Length']) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }

  return new Response(response.body, { status: response.status, headers })
}

async function handleDownloadInfo(url: URL, origin: string): Promise<Response> {
  const xmlUrl = url.searchParams.get('url')
  if (!xmlUrl) return badRequestResponse('Missing url parameter', origin)
  if (!isExternalUrlAllowed(xmlUrl)) return forbiddenResponse('URL not allowed')

  try {
    return await proxyExternalUrl(xmlUrl, origin)
  } catch (error) {
    return errorResponse(error, 'Failed to fetch XML', origin)
  }
}

async function handleProxyAudio(
  request: Request,
  url: URL,
  origin: string,
): Promise<Response> {
  const audioUrl = url.searchParams.get('url')
  if (!audioUrl) return badRequestResponse('Missing url parameter', origin)
  if (!isExternalUrlAllowed(audioUrl))
    return forbiddenResponse('URL not allowed')

  try {
    return await proxyExternalUrl(audioUrl, origin, 'audio/mpeg', request)
  } catch (error) {
    return errorResponse(error, 'Failed to fetch audio', origin)
  }
}

async function handleYandexApiProxy(
  request: Request,
  url: URL,
  origin: string,
): Promise<Response> {
  // Check allowed paths
  const isPathAllowed = ALLOWED_PATH_PREFIXES.some((prefix) =>
    url.pathname.startsWith(prefix),
  )
  if (!isPathAllowed) return forbiddenResponse('Path not allowed')

  const targetUrl = `${YANDEX_API_BASE}${url.pathname}${url.search}`

  // Forward only necessary request headers (allowlist)
  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  // Pretend to be Android client - Yandex returns stable CDN hosts for mobile clients,
  // without this header we get dynamic storage hosts like s897sas.storage.yandex.net
  headers.set('X-Yandex-Music-Client', 'YandexMusicAndroid/24023621')

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' ? await request.text() : undefined,
    })

    const responseHeaders = new Headers()
    addCorsHeaders(responseHeaders, origin)
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    return errorResponse(error, 'Proxy error', origin)
  }
}

// ============================================================================
// Main Handler
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigins = parseAllowedOrigins(env)
    const origin = request.headers.get('Origin') || ''

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(origin, allowedOrigins)
    }

    // Check origin
    if (!isOriginAllowed(origin, allowedOrigins)) {
      return forbiddenResponse()
    }

    const url = new URL(request.url)

    // Route to the appropriate handler
    switch (url.pathname) {
      case '/download-info':
        return handleDownloadInfo(url, origin)
      case '/proxy-audio':
        return handleProxyAudio(request, url, origin)
      default:
        return handleYandexApiProxy(request, url, origin)
    }
  },
}
