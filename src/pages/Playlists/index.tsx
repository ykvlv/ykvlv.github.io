// ============================================================================
// Playlists Page - Music Sorter
// ============================================================================
//
// Imports:
//   import { useYandexAuth } from '@/features/playlists'
//   import { usePlaylistsData } from '@/features/playlists'
//   import { useBpmCache, useBpmAnalyzer } from '@/features/playlists'
//   import { YandexMusicAPI } from '@/features/playlists'
//   import type { YandexTrack, YandexPlaylist } from '@/features/playlists'
//
// useYandexAuth() returns:
//   - auth: AuthState { token?, user?: YandexUserInfo }
//   - isAuthenticated: boolean
//   - loginWithToken(token): Promise<void>
//   - logout(): void
//   - isLoading: boolean
//   - error: string | null
//
// usePlaylistsData({ token, uid }) returns:
//   - playlists: YandexPlaylist[]
//   - totalLikedCount: number
//   - unsortedTrackIds: string[]
//   - currentPageTracks: YandexTrack[]
//   - currentPage, totalPages, setPage(page)
//   - selectedPlaylistKinds: number[]
//   - setSelectedPlaylistKinds(kinds): void
//   - addTrackToPlaylist(trackId, playlistKind): Promise<void>
//   - unlikeTrack(trackId): Promise<void>
//   - refresh(): Promise<void>
//   - isLoading, isLoadingPage: boolean
//   - error: string | null
//
// useBpmCache() returns:
//   - getBpm(trackId): number | null
//   - setBpm(trackId, bpm): void
//   - cycleBpmMultiplier(trackId): void
//
// useBpmAnalyzer() returns:
//   - analyzeBpm(trackId, arrayBuffer): Promise<number | null>
//   - analyzingTrackId: string | null
//
// YandexMusicAPI:
//   - new YandexMusicAPI(token)
//   - api.getTrackDownloadUrl(trackId): Promise<string>
//   - YandexMusicAPI.fetchProxyAudio(url): Promise<ArrayBuffer>
//
// Helpers:
//   - getCoverUrl(coverUri, size = '200x200'): string
//
// Types:
//   - YandexTrack: { id, title, durationMs, coverUri, available, artists: YandexArtist[], derivedColors: { miniPlayer } }
//   - YandexArtist: { name }
//   - YandexPlaylist: { kind, title, trackCount }
//   - YandexUserInfo: { uid, name }
//
// OAuth URL:
//   https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d
//
// ============================================================================

export default function Playlists() {
  return (
    <div>
      <h1>Playlists - UI not implemented</h1>
      <p>See comments in this file for available hooks and API.</p>
    </div>
  )
}
