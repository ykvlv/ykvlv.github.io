import { type ManifestOptions } from 'vite-plugin-pwa'

export const manifest: Partial<ManifestOptions> = {
  short_name: 'ykvlv',
  name: 'ykvlv',
  start_url: '/',
  id: '/',
  description: 'personal website',
  theme_color: '#232323',
  background_color: '#ffffff',
  orientation: 'any',
  display: 'standalone',
  icons: [
    {
      purpose: 'maskable',
      sizes: '512x512',
      src: 'icon512_maskable.png',
      type: 'image/png',
    },
    {
      purpose: 'any',
      sizes: '512x512',
      src: 'icon512_rounded.png',
      type: 'image/png',
    },
  ],
  // TODO add screenshots
}


// TODO хедер в PWA
// TODO если захочу разобраться с отзумом https://youtu.be/VeDsUgrUQlk?t=988
// TODO тоже отзум https://youtu.be/VeDsUgrUQlk?t=1735
// TODO вроде можно менять его динамически https://youtu.be/VeDsUgrUQlk?t=1091
// TODO манифест али экспреса https://youtu.be/VeDsUgrUQlk?t=870
// whatpwacando.today
