export interface WatchlogItem {
  type: 'episode' | 'season' | 'movie'
  title: string
  subtitle?: string
  year: number
  poster?: string
  watched_at: string
  trakt_url: string
  rating?: number
}

export interface WatchlogStats {
  movies_watched: number
  shows_watched: number
  total_hours: number
}

export type EpisodeType =
  | 'standard'
  | 'series_premiere'
  | 'season_premiere'
  | 'mid_season_premiere'
  | 'mid_season_finale'
  | 'season_finale'
  | 'series_finale'

export interface CalendarItem {
  type: 'episode' | 'season' | 'movie'
  title: string
  subtitle?: string
  date: string
  poster?: string
  trakt_url: string
  episode_type?: EpisodeType
}

export interface WatchlogData {
  updated_at: string
  items: WatchlogItem[]
  stats: WatchlogStats
  calendar: CalendarItem[]
}
