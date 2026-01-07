export interface YandexArtist {
  name: string
}

export interface YandexTrack {
  id: string
  title: string
  artists: YandexArtist[]
  durationMs: number
  coverUri: string
  available: boolean
  derivedColors: {
    miniPlayer: string // TODO: implement MiniPlayer component
  }
}

export interface YandexPlaylist {
  kind: number
  title: string
  trackCount: number
}

export interface YandexUserInfo {
  uid: number
  name: string
}
