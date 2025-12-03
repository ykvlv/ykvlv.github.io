import {
  defineConfig,
  presetWind3,
  presetIcons,
  transformerDirectives,
} from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/',
    }),
  ],
  transformers: [transformerDirectives()],
  theme: {
    colors: {
      background: 'var(--color-background)',
      foreground: 'var(--color-foreground)',
      accent: 'var(--color-accent)',
      muted: 'var(--color-muted)',
      'watchlog-primary': 'var(--color-watchlog-primary)',
    },
  },
})
