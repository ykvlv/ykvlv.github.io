import { type ManifestOptions } from 'vite-plugin-pwa'

export const manifest: Partial<ManifestOptions> = {
  short_name: 'ykvlv',
  name: 'ykvlv',
  start_url: '/',
  id: '/',
  description: 'personal website',
  theme_color: '#F7F5F2',
  background_color: '#F7F5F2',
  orientation: 'any',
  display: 'standalone',
  icons: [
    {
      src: 'icon192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: 'icon512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: 'icon512_maskable.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
}
