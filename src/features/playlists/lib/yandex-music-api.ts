import md5 from 'blueimp-md5'
import type { YandexPlaylist, YandexTrack, YandexUserInfo } from '../types'
import {
  TRACKS_BATCH_SIZE,
  MAX_REVISION_RETRIES,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} from '../config'

// ============================================================================
// Constants
// ============================================================================

const PROXY_URL = import.meta.env.YANDEX_MUSIC_PROXY_URL
const YANDEX_DOWNLOAD_SALT = 'XGRlBW9FXlekgbPrRHuSiA' // Not secret

// ============================================================================
// Internal Types
// ============================================================================

interface YandexPlaylistWithTracks extends YandexPlaylist {
  revision: number
  tracks: Array<{ track: YandexTrack }>
}

interface PlaylistsListResponse {
  result: YandexPlaylist[]
}

interface LikedTracksResponse {
  result: {
    library: {
      tracks: Array<{ id: string }>
    }
  }
}

interface TracksResponse {
  result: YandexTrack[]
}

interface AccountStatusResponse {
  result: {
    account: {
      uid: number
      login: string
      displayName: string
    }
  }
}

interface PlaylistDiffOperation {
  op: 'insert' | 'delete'
  at: number
  tracks: Array<{ id: string }>
}

// ============================================================================
// API Client
// ============================================================================

export class YandexMusicAPI {
  private readonly token: string

  constructor(token: string) {
    this.token = token
  }

  // --- Transport Layer ---

  /** Low-level authenticated fetch through CORS proxy */
  private static async fetchApi(
    endpoint: string,
    token: string,
    init: RequestInit = {},
  ): Promise<Response> {
    if (!PROXY_URL) {
      throw new Error('[YandexMusicAPI] Proxy URL is not configured')
    }

    const response = await fetch(`${PROXY_URL}${endpoint}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `OAuth ${token}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `[YandexMusicAPI] API error: ${response.status} - ${text}`,
      )
    }

    return response
  }

  /** Authenticated request with form-urlencoded body */
  private async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    signal: AbortSignal,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = {}
    let requestBody: string | undefined

    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(body)) {
        if (Array.isArray(value)) {
          params.set(key, value.join(','))
        } else {
          params.set(key, String(value))
        }
      }
      requestBody = params.toString()
    }

    const response = await YandexMusicAPI.fetchApi(endpoint, this.token, {
      method,
      headers,
      body: requestBody,
      signal,
    })

    return response.json()
  }

  // --- Static Methods (no instance required) ---

  /** Validate token and get account info */
  static async fetchAccountStatus(
    token: string,
    signal: AbortSignal,
  ): Promise<YandexUserInfo> {
    const response = await YandexMusicAPI.fetchApi('/account/status', token, {
      signal,
    })
    const data: AccountStatusResponse = await response.json()
    const account = data.result?.account

    if (!account?.uid) {
      throw new Error('[YandexMusicAPI] Invalid token: no account uid returned')
    }

    return {
      uid: account.uid,
      name: account.displayName || account.login,
    }
  }

  /** Fetch audio file as ArrayBuffer */
  static async fetchProxyAudio(
    audioUrl: string,
    signal: AbortSignal,
  ): Promise<ArrayBuffer> {
    if (!PROXY_URL) {
      throw new Error('[YandexMusicAPI] Proxy URL is not configured')
    }

    const response = await fetch(
      `${PROXY_URL}/proxy-audio?url=${encodeURIComponent(audioUrl)}`,
      { signal },
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `[YandexMusicAPI] API error: ${response.status} - ${text}`,
      )
    }

    return response.arrayBuffer()
  }

  // --- Playlists ---

  async getPlaylists(
    uid: number,
    signal: AbortSignal,
  ): Promise<YandexPlaylist[]> {
    const data = await this.request<PlaylistsListResponse>(
      'GET',
      `/users/${uid}/playlists/list`,
      signal,
    )
    return data.result
  }

  async getPlaylistTracks(
    uid: number,
    kind: number,
    signal: AbortSignal,
  ): Promise<YandexTrack[]> {
    const data = await this.request<{ result: YandexPlaylistWithTracks }>(
      'GET',
      `/users/${uid}/playlists/${kind}`,
      signal,
    )
    return data.result.tracks?.map((t) => t.track) ?? []
  }

  /** Uses optimistic concurrency with revision, retries on conflict */
  async addTrackToPlaylist(
    uid: number,
    kind: number,
    trackId: string,
    signal: AbortSignal,
    retries = MAX_REVISION_RETRIES,
  ): Promise<void> {
    for (let attempt = 0; attempt < retries; attempt++) {
      this.checkAborted(signal)

      try {
        // Get current playlist revision
        const playlist = await this.request<{
          result: YandexPlaylistWithTracks
        }>('GET', `/users/${uid}/playlists/${kind}`, signal)

        const diff: PlaylistDiffOperation[] = [
          { op: 'insert', at: 0, tracks: [{ id: trackId }] },
        ]

        await this.request<unknown>(
          'POST',
          `/users/${uid}/playlists/${kind}/change`,
          signal,
          { diff: JSON.stringify(diff), revision: playlist.result.revision },
        )
        return // Success
      } catch (err) {
        // Don't retry AbortError
        if (err instanceof DOMException && err.name === 'AbortError') throw err

        // Check if this is a revision conflict (409 or revision-related error)
        const isRevisionConflict =
          err instanceof Error &&
          (err.message.includes('revision') ||
            err.message.includes('conflict') ||
            err.message.includes('409'))

        // Only retry on revision conflicts
        if (!isRevisionConflict) {
          throw err
        }

        // Last attempt - throw with context
        if (attempt === retries - 1) {
          throw new Error(
            `Failed to add track after ${retries} attempts: ${err instanceof Error ? err.message : String(err)}`,
          )
        }

        // Exponential backoff for revision conflicts with max cap
        const delay = Math.min(
          RETRY_BASE_DELAY_MS * Math.pow(2, attempt),
          RETRY_MAX_DELAY_MS,
        )
        await this.abortableDelay(delay, signal)
      }
    }
  }

  // --- Tracks ---

  async getTracksById(
    trackIds: string[],
    signal: AbortSignal,
  ): Promise<YandexTrack[]> {
    if (trackIds.length === 0) return []

    const results: YandexTrack[] = []

    for (let i = 0; i < trackIds.length; i += TRACKS_BATCH_SIZE) {
      this.checkAborted(signal)

      const batch = trackIds.slice(i, i + TRACKS_BATCH_SIZE)
      const tracksData = await this.request<TracksResponse>(
        'POST',
        '/tracks',
        signal,
        { 'track-ids': batch },
      )
      results.push(...tracksData.result)
    }

    return results
  }

  /** Multistep: get download info, fetch XML, generate signed URL */
  async getTrackDownloadUrl(
    trackId: string,
    signal: AbortSignal,
  ): Promise<string> {
    // Step 1: Get download info
    const downloadInfo = await this.request<{
      result: Array<{
        codec: string
        bitrateInKbps: number
        downloadInfoUrl: string
      }>
    }>('GET', `/tracks/${trackId}/download-info`, signal)

    // Find the lowest quality mp3 to save bandwidth
    const mp3Info = downloadInfo.result
      .filter((info) => info.codec === 'mp3')
      .sort((a, b) => a.bitrateInKbps - b.bitrateInKbps)[0]

    const info = mp3Info || downloadInfo.result[0]
    if (!info) {
      throw new Error('[YandexMusicAPI] No download info available')
    }

    // Step 2: Fetch download info XML (proxy through worker to avoid CORS)
    const xmlResponse = await YandexMusicAPI.fetchApi(
      `/download-info?url=${encodeURIComponent(info.downloadInfoUrl)}`,
      this.token,
      { signal },
    )
    const xmlText = await xmlResponse.text()

    // Step 3: Parse XML
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')

    const host = doc.querySelector('host')?.textContent
    const path = doc.querySelector('path')?.textContent
    const s = doc.querySelector('s')?.textContent
    const ts = doc.querySelector('ts')?.textContent

    if (!host || !path || !s || !ts) {
      throw new Error('[YandexMusicAPI] Invalid download info XML')
    }

    // Step 4: Generate signature
    const signStr = YANDEX_DOWNLOAD_SALT + path.slice(1) + s
    const sign = md5(signStr)

    // Step 5: Build final URL
    return `https://${host}/get-mp3/${sign}/${ts}${path}?track-id=${trackId}`
  }

  // --- Likes ---

  async getLikedTrackIds(uid: number, signal: AbortSignal): Promise<string[]> {
    const likesData = await this.request<LikedTracksResponse>(
      'GET',
      `/users/${uid}/likes/tracks`,
      signal,
    )
    return likesData.result.library.tracks.map((t) => t.id)
  }

  async unlikeTrack(
    uid: number,
    trackId: string,
    signal: AbortSignal,
  ): Promise<void> {
    await this.request<unknown>(
      'POST',
      `/users/${uid}/likes/tracks/remove`,
      signal,
      { 'track-ids': [trackId] },
    )
  }

  // --- Private Helpers ---

  private static createAbortError(): DOMException {
    return new DOMException('Aborted', 'AbortError')
  }

  private checkAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw YandexMusicAPI.createAbortError()
    }
  }

  private abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(YandexMusicAPI.createAbortError())
        return
      }

      const onAbort = () => {
        clearTimeout(timeoutId)
        reject(YandexMusicAPI.createAbortError())
      }

      const timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)

      signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}

// ============================================================================
// Helpers
// ============================================================================

export function getCoverUrl(uri: string, size = '200x200'): string {
  return `https://${uri.replace('%%', size)}`
}
