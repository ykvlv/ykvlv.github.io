# ykvlv.dev

**Live:** https://www.ykvlv.dev

## Tech Stack

React 19, TypeScript, Vite, UnoCSS, PWA (Workbox), Bun

## Features

### Watchlog

```
Trakt API  ->  sync-trakt.ts (daily cron)  ->  GitHub Gist  ->  Frontend
```

Movie and TV watch history synced from Trakt. No backend: a daily cron script fetches history, ratings, and upcoming calendar from Trakt API, saves everything to a public GitHub Gist, and the frontend reads from the raw Gist URL.

- **Recently watched** - last 30 items with posters, ratings, and relative dates ("2d ago", "3mo ago"). Consecutive episodes from the same season are grouped into a single card
- **My Premieres** - horizontal scrollable timeline of upcoming episodes and movies. Cards are tagged by episode type: season premiere, mid-season finale, series finale, etc.
- **Stats** - total movies, shows, and hours watched
- Token auto-refresh: when Trakt tokens expire, the sync script refreshes them and updates GitHub Actions secrets automatically

### Whatsnext

```
Telegram channels  ->  sync-whatsnext.ts (daily cron)  ->  LLM  ->  GitHub Gist  ->  Frontend
```

Personal event listing distilled from public Telegram channels. A daily cron
script scrapes channel web previews past each channel's cursor, hands fresh
posts to an LLM (Gemini via OpenRouter) that turns announcements into listing
entries with a deadpan editorial voice, and merges the returned delta into the
Gist.

- **Mosaic** - a hand-rolled skyline packer rather than CSS grid: tiles hold strict date order, a portrait photo takes two columns with the text beside it, and a seam closes by stretching a tile instead of leaving a hole
- **Long-running** - events with an end date leave the chronological stream for their own section, sorted by what closes first. Anything already over is dimmed, never hidden: expiry is the sync script's job alone
- **Still layout** - the sync script stores each photo's shape, so a tile is its final height before the image arrives and nothing reshuffles as photos land

### PWA

Installable, auto-updating, offline-capable. Service worker caches Gist data, Trakt poster images, event photos, and fonts.

## Getting Started

```bash
bun install        # Install dependencies
bun run dev        # Start dev server (localhost:5173)
bun run build      # TypeScript check + production build
bun run lint       # Run ESLint
bun run format     # Format with Prettier
```

## Project Structure

```
src/
├── features/           # Feature modules (isolated by domain)
│   ├── home/           # Landing page components
│   ├── watchlog/       # Watchlog components, hooks, types
│   └── whatsnext/      # Whatsnext components, hooks, types
├── shared/             # Shared UI, hooks, utilities
│   ├── components/     # Layout, UI primitives
│   ├── hooks/          # useTheme, useGistData
│   └── lib/            # cn() utility, zoned dates
├── pages/              # Route entry points (lazy-loaded)
└── layouts/            # App shell (Header + Footer)

scripts/
├── sync-trakt.ts       # Trakt to Gist sync script
├── sync-whatsnext.ts   # Telegram to LLM to Gist sync script
└── whatsnext-prompt.md # Every word the LLM reads
```

## Scripts

### sync-trakt.ts

Syncs Trakt data to GitHub Gist:

- Fetches 100 most recent watch history items
- Groups consecutive episodes by show/season
- Fetches user ratings and upcoming calendar
- Auto-refreshes expired tokens (updates GitHub secrets)
- Outputs top 30 items + stats + calendar to Gist

### sync-whatsnext.ts

Turns public Telegram channel previews into an event listing:

- Scrapes `t.me/s/<channel>` pages past each channel's cursor
- Asks an LLM (via OpenRouter) to turn fresh posts into listing entries
- Merges the returned delta: upserts, verified cancellations, expiry by date
- Copies photos into a GitHub release, since Telegram's own urls expire in a day
- Measures each photo from its JPEG header, so the frontend can reserve its box
- Sweeps release assets only near GitHub's 1000-asset cap, oldest orphans first
- Writes events and cursors to the Gist in one atomic PATCH

## Deployment

Three GitHub Actions workflows handle deployment:

| Workflow             | Trigger        | Action                         |
| -------------------- | -------------- | ------------------------------ |
| `deploy.yml`         | Push to `main` | Build & deploy to GitHub Pages |
| `sync-trakt.yml`     | Cron (daily)   | Sync watch history to Gist     |
| `sync-whatsnext.yml` | Cron (daily)   | Sync Telegram events to Gist   |

## Environment Variables

Copy `.env.example` to `.env` and fill in the blanks. The same names are used in
GitHub Actions: filled in the example means repo variable, empty means repo secret.
Naming rules and per-variable notes live in the file itself.
