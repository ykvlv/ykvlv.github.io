/**
 * Cloudflare Worker for proxying requests to Yandex Music API
 *
 * Required due to Yandex API CORS restrictions.
 */

const YANDEX_API_BASE = 'https://api.music.yandex.net'

const ALLOWED_ORIGINS = ['https://www.ykvlv.dev', 'http://localhost:5173']

const ALLOWED_PATH_PREFIXES = ['/account/status', '/users/', '/tracks']

const ALLOWED_EXTERNAL_HOSTS = ['api.music.yandex.net']

// ============================================================================
// Helper Functions
// ============================================================================

function isExternalUrlAllowed(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return ALLOWED_EXTERNAL_HOSTS.includes(url.hostname)
  } catch {
    return false
  }
}

function isOriginAllowed(origin: string): boolean {
  try {
    const url = new URL(origin)
    return ALLOWED_ORIGINS.includes(url.origin)
  } catch {
    return false
  }
}

function addCorsHeaders(headers: Headers, origin: string): Headers {
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Credentials', 'true')
  return headers
}

function corsResponse(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin : '',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}

function errorResponse(
  error: unknown,
  errorType: string,
  origin: string,
): Response {
  return new Response(
    JSON.stringify({ error: errorType, message: String(error) }),
    {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
    },
  )
}

function forbiddenResponse(message = 'Forbidden', origin?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return new Response(message, { status: 403, headers })
}

function badRequestResponse(message: string, origin?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return new Response(message, { status: 400, headers })
}

// ============================================================================
// Proxy Handlers
// ============================================================================

async function proxyExternalUrl(
  url: string,
  origin: string,
  contentType?: string,
): Promise<Response> {
  const response = await fetch(url)
  const headers = new Headers()
  addCorsHeaders(headers, origin)
  headers.set(
    'Content-Type',
    contentType ||
      response.headers.get('Content-Type') ||
      'application/octet-stream',
  )
  return new Response(response.body, { status: response.status, headers })
}

async function handleDownloadInfo(url: URL, origin: string): Promise<Response> {
  const xmlUrl = url.searchParams.get('url')
  if (!xmlUrl) return badRequestResponse('Missing url parameter', origin)
  if (!isExternalUrlAllowed(xmlUrl))
    return forbiddenResponse('URL not allowed', origin)

  try {
    return await proxyExternalUrl(xmlUrl, origin)
  } catch (error) {
    return errorResponse(error, 'Failed to fetch XML', origin)
  }
}

async function handleProxyAudio(url: URL, origin: string): Promise<Response> {
  const audioUrl = url.searchParams.get('url')
  if (!audioUrl) return badRequestResponse('Missing url parameter', origin)
  if (!isExternalUrlAllowed(audioUrl))
    return forbiddenResponse('URL not allowed', origin)

  try {
    return await proxyExternalUrl(audioUrl, origin, 'audio/mpeg')
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
  if (!isPathAllowed) return forbiddenResponse('Path not allowed', origin)

  const targetUrl = `${YANDEX_API_BASE}${url.pathname}${url.search}`

  // Copy headers (excluding host and origin)
  const headers = new Headers()
  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase()
    if (lowerKey !== 'host' && lowerKey !== 'origin') {
      headers.set(key, value)
    }
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

    const responseHeaders = new Headers(response.headers)
    addCorsHeaders(responseHeaders, origin)

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
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin') || ''

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(origin)
    }

    // Check origin
    if (!isOriginAllowed(origin)) {
      return forbiddenResponse()
    }

    const url = new URL(request.url)

    // Route to the appropriate handler
    switch (url.pathname) {
      case '/download-info':
        return handleDownloadInfo(url, origin)
      case '/proxy-audio':
        return handleProxyAudio(url, origin)
      default:
        return handleYandexApiProxy(request, url, origin)
    }
  },
}
