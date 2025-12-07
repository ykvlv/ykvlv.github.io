/**
 * Sync Trakt watch history to GitHub Gist
 *
 * Fetches movie and episode history from Trakt API,
 * groups consecutive episodes by show+season,
 * and saves to a public Gist.
 */

import type {
  WatchlogItem,
  WatchlogStats,
  CalendarItem,
  WatchlogData,
} from '../src/types/watchlog'

// ============================================================================
// Constants
// ============================================================================

const TRAKT_API_BASE = 'https://api.trakt.tv'
const GITHUB_API_BASE = 'https://api.github.com'
const HISTORY_LIMIT = 100
const CALENDAR_DAYS = 365
const OUTPUT_ITEMS_LIMIT = 20

// ============================================================================
// Environment
// ============================================================================

const {
  TRAKT_CLIENT_ID,
  TRAKT_ACCESS_TOKEN,
  GIST_ID,
  GH_GIST_TOKEN,
} = process.env

if (!TRAKT_CLIENT_ID || !TRAKT_ACCESS_TOKEN || !GIST_ID || !GH_GIST_TOKEN) {
  console.error('Missing required environment variables')
  process.exit(1)
}

// ============================================================================
// Trakt API Types
// ============================================================================

interface TraktIds {
  trakt: number
  slug: string
}

interface TraktImages {
  poster?: string[]
}

interface TraktMovie {
  title: string
  year: number
  ids: TraktIds
  images?: TraktImages
}

interface TraktShow {
  title: string
  year: number
  ids: TraktIds
  images?: TraktImages
}

interface TraktEpisode {
  season: number
  number: number
}

interface TraktSeason {
  number: number
  first_aired?: string
  images?: TraktImages
}

interface TraktHistoryItem {
  watched_at: string
  type: 'movie' | 'episode'
  movie?: TraktMovie
  show?: TraktShow
  episode?: TraktEpisode
}

interface TraktRatingItem {
  type: 'movie' | 'show' | 'season' | 'episode'
  rating: number
  movie?: TraktMovie
  show?: TraktShow
  season?: { number: number }
  episode?: { season: number; number: number }
}

interface TraktStats {
  movies: { watched: number; minutes: number }
  shows: { watched: number }
  episodes: { minutes: number }
}

interface TraktCalendarEpisode {
  first_aired: string
  episode: { season: number; number: number }
  show: TraktShow
}

interface TraktCalendarMovie {
  released: string
  movie: TraktMovie
}

// ============================================================================
// Internal Types
// ============================================================================

interface Ratings {
  movies: Map<number, number>
  shows: Map<number, number>
  seasons: Map<string, number>
  episodes: Map<string, number>
}

interface GroupedSeason {
  show: TraktShow
  season: number
  episodes: number[]
  watched_at: string
}

type GroupedItem =
  | { type: 'movie'; movie: TraktMovie; watched_at: string }
  | { type: 'season'; group: GroupedSeason }

interface RawCalendar {
  episodes: TraktCalendarEpisode[]
  movies: TraktCalendarMovie[]
}

// ============================================================================
// Trakt Client
// ============================================================================

class TraktClient {
  private readonly headers: Record<string, string>

  constructor(clientId: string, token: string) {
    this.headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId,
      Authorization: `Bearer ${token}`,
    }
  }

  private async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${TRAKT_API_BASE}${endpoint}`, {
      headers: this.headers,
    })

    if (!response.ok) {
      throw new Error(`Trakt API error: ${response.status} - ${endpoint}`)
    }

    return await response.json()
  }

  async getHistory(): Promise<TraktHistoryItem[]> {
    return this.get(`/sync/history?extended=images&limit=${HISTORY_LIMIT}`)
  }

  async getStats(): Promise<WatchlogStats> {
    const stats = await this.get<TraktStats>('/users/me/stats')
    return {
      movies_watched: stats.movies.watched,
      shows_watched: stats.shows.watched,
      total_hours: Math.round(
        (stats.movies.minutes + stats.episodes.minutes) / 60,
      ),
    }
  }

  async getRatings(): Promise<Ratings> {
    const all = await this.get<TraktRatingItem[]>('/sync/ratings/all')

    const ratings: Ratings = {
      movies: new Map(),
      shows: new Map(),
      seasons: new Map(),
      episodes: new Map(),
    }

    for (const item of all) {
      if (item.type === 'movie' && item.movie) {
        ratings.movies.set(item.movie.ids.trakt, item.rating)
      } else if (item.type === 'show' && item.show) {
        ratings.shows.set(item.show.ids.trakt, item.rating)
      } else if (item.type === 'season' && item.show && item.season) {
        ratings.seasons.set(
          `${item.show.ids.trakt}-${item.season.number}`,
          item.rating,
        )
      } else if (item.type === 'episode' && item.show && item.episode) {
        ratings.episodes.set(
          `${item.show.ids.trakt}-${item.episode.season}-${item.episode.number}`,
          item.rating,
        )
      }
    }

    return ratings
  }

  async getShowSeasons(slug: string): Promise<Map<number, TraktSeason>> {
    try {
      const seasons = await this.get<TraktSeason[]>(
        `/shows/${slug}/seasons?extended=full`,
      )
      return new Map(seasons.map((s) => [s.number, s]))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Failed to fetch seasons for ${slug}: ${message}`)
      return new Map()
    }
  }

  async getShowSeasonsParallel(
    slugs: string[],
  ): Promise<Map<string, Map<number, TraktSeason>>> {
    const results = await Promise.all(
      slugs.map(
        async (slug) => [slug, await this.getShowSeasons(slug)] as const,
      ),
    )
    return new Map(results)
  }

  async getRawCalendar(): Promise<RawCalendar> {
    const today = toDateString(new Date().toISOString())

    const [episodes, movies] = await Promise.all([
      this.get<TraktCalendarEpisode[]>(
        `/calendars/my/shows/${today}/${CALENDAR_DAYS}?extended=images`,
      ),
      this.get<TraktCalendarMovie[]>(
        `/calendars/my/movies/${today}/${CALENDAR_DAYS}?extended=images`,
      ),
    ])

    return { episodes, movies }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getPosterUrl(images?: TraktImages): string | undefined {
  const poster = images?.poster?.[0]
  if (!poster) return undefined
  return poster.startsWith('http') ? poster : `https://${poster}`
}

function toDateString(iso: string): string {
  return iso.split('T')[0]
}

function buildShowUrl(slug: string, season: number, episode?: number): string {
  const base = `https://trakt.tv/shows/${slug}/seasons/${season}`
  return episode ? `${base}/episodes/${episode}` : base
}

// ============================================================================
// Grouping Logic
// ============================================================================

function groupHistory(history: TraktHistoryItem[]): GroupedItem[] {
  const items: GroupedItem[] = []
  let currentGroup: GroupedSeason | undefined

  for (const item of history) {
    if (item.type === 'movie' && item.movie) {
      if (currentGroup) {
        items.push({ type: 'season', group: currentGroup })
        currentGroup = undefined
      }
      items.push({
        type: 'movie',
        movie: item.movie,
        watched_at: item.watched_at,
      })
    } else if (item.type === 'episode' && item.show && item.episode) {
      const showId = item.show.ids.trakt
      const season = item.episode.season

      if (
        currentGroup &&
        currentGroup.show.ids.trakt === showId &&
        currentGroup.season === season
      ) {
        // Don't update watched_at - keep the first (most recent) timestamp
        currentGroup.episodes.push(item.episode.number)
      } else {
        if (currentGroup) {
          items.push({ type: 'season', group: currentGroup })
        }
        currentGroup = {
          show: item.show,
          season,
          episodes: [item.episode.number],
          watched_at: item.watched_at,
        }
      }
    }
  }

  if (currentGroup) {
    items.push({ type: 'season', group: currentGroup })
  }

  return items
}

function collectUniqueSlugs(
  grouped: GroupedItem[],
  rawCalendar: RawCalendar,
): string[] {
  const slugs = new Set<string>()

  for (const item of grouped) {
    if (item.type === 'season') {
      slugs.add(item.group.show.ids.slug)
    }
  }

  for (const ep of rawCalendar.episodes) {
    slugs.add(ep.show.ids.slug)
  }

  return Array.from(slugs)
}

// ============================================================================
// Enrichment
// ============================================================================

function enrichItems(
  grouped: GroupedItem[],
  seasonsMap: Map<string, Map<number, TraktSeason>>,
  ratings: Ratings,
): WatchlogItem[] {
  return grouped.map((item): WatchlogItem => {
    if (item.type === 'movie') {
      const poster = getPosterUrl(item.movie.images)
      const rating = ratings.movies.get(item.movie.ids.trakt)

      return {
        type: 'movie',
        title: item.movie.title,
        year: item.movie.year,
        ...(poster && { poster }),
        watched_at: toDateString(item.watched_at),
        trakt_url: `https://trakt.tv/movies/${item.movie.ids.slug}`,
        ...(rating && { rating }),
      }
    }

    const { group } = item
    const showSeasons = seasonsMap.get(group.show.ids.slug)
    const seasonData = showSeasons?.get(group.season)
    const episodes = group.episodes

    const year = seasonData?.first_aired
      ? new Date(seasonData.first_aired).getFullYear()
      : group.show.year

    const poster =
      getPosterUrl(seasonData?.images) ?? getPosterUrl(group.show.images)

    const isSingleEpisode = episodes.length === 1
    const subtitle = formatEpisodeSubtitle(group.season, episodes)

    const showId = group.show.ids.trakt
    const seasonKey = `${showId}-${group.season}`
    const seasonRating =
      ratings.seasons.get(seasonKey) ?? ratings.shows.get(showId)

    if (isSingleEpisode) {
      const episodeKey = `${showId}-${group.season}-${episodes[0]}`
      const rating = ratings.episodes.get(episodeKey) ?? seasonRating

      return {
        type: 'episode',
        title: group.show.title,
        subtitle,
        year,
        ...(poster && { poster }),
        watched_at: toDateString(group.watched_at),
        trakt_url: buildShowUrl(group.show.ids.slug, group.season, episodes[0]),
        ...(rating && { rating }),
      }
    }

    return {
      type: 'season',
      title: group.show.title,
      subtitle,
      year,
      ...(poster && { poster }),
      watched_at: toDateString(group.watched_at),
      trakt_url: buildShowUrl(group.show.ids.slug, group.season),
      ...(seasonRating && { rating: seasonRating }),
    }
  })
}

interface GroupedCalendarEpisode {
  show: TraktShow
  season: number
  date: string
  episodes: number[]
}

function groupCalendarEpisodes(
  episodes: TraktCalendarEpisode[],
): GroupedCalendarEpisode[] {
  const groups = new Map<string, GroupedCalendarEpisode>()

  for (const ep of episodes) {
    const date = toDateString(ep.first_aired)
    const key = `${date}|${ep.show.ids.slug}|${ep.episode.season}`

    const existing = groups.get(key)
    if (existing) {
      existing.episodes.push(ep.episode.number)
    } else {
      groups.set(key, {
        show: ep.show,
        season: ep.episode.season,
        date,
        episodes: [ep.episode.number],
      })
    }
  }

  return Array.from(groups.values())
}

function formatEpisodeSubtitle(season: number, episodes: number[]): string {
  const sorted = [...episodes].sort((a, b) => a - b)

  if (sorted.length === 1) {
    return `S${season} E${sorted[0]}`
  }

  const isConsecutive = sorted.every(
    (ep, i) => i === 0 || ep === sorted[i - 1] + 1,
  )

  if (isConsecutive) {
    return `S${season} E${sorted[0]}-${sorted[sorted.length - 1]}`
  }

  return `S${season} E${sorted.join(',')}`
}

function enrichCalendar(
  rawCalendar: RawCalendar,
  seasonsMap: Map<string, Map<number, TraktSeason>>,
): CalendarItem[] {
  const groupedEpisodes = groupCalendarEpisodes(rawCalendar.episodes)

  const items: CalendarItem[] = [
    ...groupedEpisodes.map((group): CalendarItem => {
      const showSeasons = seasonsMap.get(group.show.ids.slug)
      const seasonData = showSeasons?.get(group.season)
      const poster =
        getPosterUrl(seasonData?.images) ?? getPosterUrl(group.show.images)

      const isSingleEpisode = group.episodes.length === 1
      const type = isSingleEpisode ? 'episode' : 'season'
      const trakt_url = buildShowUrl(
        group.show.ids.slug,
        group.season,
        isSingleEpisode ? group.episodes[0] : undefined,
      )

      return {
        type,
        title: group.show.title,
        subtitle: formatEpisodeSubtitle(group.season, group.episodes),
        date: group.date,
        ...(poster && { poster }),
        trakt_url,
      }
    }),
    ...rawCalendar.movies.map((m): CalendarItem => {
      const poster = getPosterUrl(m.movie.images)
      return {
        type: 'movie',
        title: m.movie.title,
        date: m.released,
        ...(poster && { poster }),
        trakt_url: `https://trakt.tv/movies/${m.movie.ids.slug}`,
      }
    }),
  ]

  return items.sort((a, b) => a.date.localeCompare(b.date))
}

// ============================================================================
// Gist API
// ============================================================================

async function updateGist(data: WatchlogData): Promise<void> {
  const response = await fetch(`${GITHUB_API_BASE}/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_GIST_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      files: {
        'watchlog.json': {
          content: JSON.stringify(data, null, 2),
        },
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub API error: ${response.status} - ${body}`)
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const client = new TraktClient(TRAKT_CLIENT_ID, TRAKT_ACCESS_TOKEN)

  // Phase 1: Fetch history, stats, calendar in parallel
  console.log('Fetching history, stats, and calendar...')
  const [history, stats, rawCalendar] = await Promise.all([
    client.getHistory(),
    client.getStats(),
    client.getRawCalendar(),
  ])
  console.log(
    `History: ${history.length}, Calendar: ${rawCalendar.episodes.length} episodes, ${rawCalendar.movies.length} movies`,
  )
  console.log(
    `Stats: ${stats.movies_watched} movies, ${stats.shows_watched} shows, ${stats.total_hours}h`,
  )

  // Phase 2: Group episodes by season + collect all slugs
  console.log('Grouping episodes...')
  const grouped = groupHistory(history)
  const slugs = collectUniqueSlugs(grouped, rawCalendar)
  console.log(
    `Grouped into ${grouped.length} items, ${slugs.length} unique shows`,
  )

  // Phase 3: Fetch seasons and ratings in parallel
  console.log('Fetching seasons and ratings...')
  const [seasonsMap, ratings] = await Promise.all([
    client.getShowSeasonsParallel(slugs),
    client.getRatings(),
  ])

  // Phase 4: Enrich history and calendar
  const items = enrichItems(grouped, seasonsMap, ratings).slice(
    0,
    OUTPUT_ITEMS_LIMIT,
  )
  const calendar = enrichCalendar(rawCalendar, seasonsMap)
  console.log(`Output: ${items.length} items, ${calendar.length} calendar`)

  // Phase 5: Update Gist
  const data: WatchlogData = {
    updated_at: new Date().toISOString(),
    items,
    stats,
    calendar,
  }

  console.log('Updating Gist...')
  await updateGist(data)
  console.log('Done!')
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
