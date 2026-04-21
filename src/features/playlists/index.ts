// Hooks
export { usePlaylistsData } from './hooks/usePlaylistsData'
export type { UsePlaylistsDataResult } from './hooks/usePlaylistsData'
export { useYandexAuth } from './hooks/useYandexAuth'
export type {
  AuthError,
  AuthState,
  RestoreAttempt,
} from './hooks/useYandexAuth'
export { useBpmAnalyzer } from './hooks/useBpmAnalyzer'
export { useBpmCache } from './hooks/useBpmCache'
export { useAudioPlayer } from './hooks/useAudioPlayer'
export type { PlayerStatus, UseAudioPlayerResult } from './hooks/useAudioPlayer'

// Lib
export {
  YandexMusicAPI,
  YandexApiError,
  getCoverUrl,
  joinArtists,
} from './lib/yandex-music-api'
export type { YandexApiErrorCategory } from './lib/yandex-music-api'

// Components (public entry)
export { AuthGate } from './components/AuthGate'

// Types
export type {
  YandexTrack,
  YandexPlaylist,
  YandexArtist,
  YandexUserInfo,
} from './types'
