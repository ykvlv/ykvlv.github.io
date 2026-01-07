/**
 * Configuration constants for Yandex Music playlists feature
 */

/** Maximum number of refresh attempts when mutations occur during refresh */
export const MAX_REFRESH_ATTEMPTS = 2

/** Maximum number of retries for revision conflict errors */
export const MAX_REVISION_RETRIES = 3

/** Base delay in milliseconds for exponential backoff retry */
export const RETRY_BASE_DELAY_MS = 100

/** Maximum delay in milliseconds for retry backoff (prevent excessive waiting) */
export const RETRY_MAX_DELAY_MS = 2000

/** Number of playlists to load concurrently in a single batch */
export const PLAYLIST_BATCH_SIZE = 5

/** Number of tracks to load per page */
export const TRACKS_PER_PAGE = 100

/** Number of tracks to fetch in a single API request */
export const TRACKS_BATCH_SIZE = 100
