import { defineConfig, presetWind3, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  theme: {
    colors: {
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',
      card: {
        DEFAULT: 'hsl(var(--card))',
        foreground: 'hsl(var(--card-foreground))',
      },
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      secondary: {
        DEFAULT: 'hsl(var(--secondary))',
        foreground: 'hsl(var(--secondary-foreground))',
      },
      muted: {
        DEFAULT: 'hsl(var(--muted))',
        foreground: 'hsl(var(--muted-foreground))',
      },
      destructive: {
        DEFAULT: 'hsl(var(--destructive))',
        foreground: 'hsl(var(--destructive-foreground))',
      },
      success: {
        DEFAULT: 'hsl(var(--success))',
        foreground: 'hsl(var(--success-foreground))',
      },
      border: 'hsl(var(--border))',
      ring: 'hsl(var(--ring))',
    },
    borderRadius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    },
    fontFamily: {
      sans: 'var(--font-sans)',
      serif: 'var(--font-serif)',
    },
  },
  shortcuts: {
    // Layout
    'container-main': 'max-w-[1148px] mx-auto px-4 sm:px-6 lg:px-8',

    // Typography
    'section-heading': 'font-serif text-2xl font-medium text-foreground',

    // Interactive
    focusable:
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'card-hover':
      'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10',

    // Surfaces
    'card-surface': 'rounded-2xl border border-border bg-card',
    'card-interactive':
      'card-surface transition-all duration-200 card-hover focusable',

    // Controls
    'icon-button':
      'p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focusable',
  },
})
