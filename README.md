# ykvlv.dev

**Live:** https://www.ykvlv.dev

## Tech Stack

React 19, TypeScript, Vite, UnoCSS, PWA (Workbox), Bun

## Features

### Watchlog

```
Trakt API  →  sync-trakt.ts (daily cron)  →  GitHub Gist  →  Frontend
```

Movie and TV watch history synced from Trakt. No backend — a daily cron script fetches history, ratings, and upcoming calendar from Trakt API, saves everything to a public GitHub Gist, and the frontend reads from the raw Gist URL.

- **Recently watched** — last 20 items with posters, ratings, and relative dates ("2d ago", "3mo ago"). Consecutive episodes from the same season are grouped into a single card
- **My Premieres** — horizontal scrollable timeline of upcoming episodes and movies. Cards are tagged by episode type: season premiere, mid-season finale, series finale, etc.
- **Stats** — total movies, shows, and hours watched
- Token auto-refresh: when Trakt tokens expire, the sync script refreshes them and updates GitHub Actions secrets automatically

### Playlists

```
Frontend  →  Yandex Music Proxy (Cloudflare Worker)  →  Yandex Music API
```

Sort Yandex Music liked tracks into playlists. Yandex Music API doesn't support CORS, so all requests go through a Cloudflare Worker proxy. Authenticates via Yandex OAuth implicit flow.

- **Unsorted tracks** — pick destination playlists and see only liked tracks that aren't in any of them. Add tracks to playlists or unlike them, work through the list until everything is sorted
- **Audio player** — built-in streaming player with seek and volume control. Audio is proxied through the Cloudflare Worker
- **BPM analyzer** — detects tempo via Web Audio API, automatically on playback or in batch for the whole page. Results cached in localStorage. Multiplier cycling (0.5×/1×/2×) lets you correct tracks detected at half or double their actual tempo
- **Keyboard shortcuts** — WASD navigation, 1-9 to add to playlists, Enter to play, Backspace to unlike, Space to pause, J/L to seek, ? for help
- **Two view modes** — compact list and cards

### PWA

Installable, auto-updating, offline-capable. Service worker caches Gist data, Trakt poster images, and Yandex Music album covers.

## Getting Started

```bash
bun install        # Install dependencies
bun run dev        # Start dev server (localhost:5173)
bun run build      # TypeScript check + production build
bun run lint       # Run ESLint
bun run format     # Format with Prettier
```

For playlists development, also run the CORS proxy locally:

```bash
cd workers/yandex-music-proxy
bunx wrangler dev  # Starts proxy on localhost:8787
```

## Project Structure

```
src/
├── features/           # Feature modules (isolated by domain)
│   ├── home/           # Landing page components
│   ├── watchlog/       # Watchlog components, hooks, types
│   └── playlists/      # Playlists components, hooks, API client, types
├── shared/             # Shared UI, hooks, utilities
│   ├── components/     # Layout, UI primitives
│   ├── hooks/          # useTheme
│   └── lib/            # cn() utility
├── pages/              # Route entry points (lazy-loaded)
└── layouts/            # App shell (Header + Footer)

scripts/
└── sync-trakt.ts       # Trakt → Gist sync script

workers/
└── yandex-music-proxy/ # Cloudflare Worker CORS proxy
```

## Scripts & Workers

### sync-trakt.ts

Syncs Trakt data to GitHub Gist:

- Fetches 100 most recent watch history items
- Groups consecutive episodes by show/season
- Fetches user ratings and upcoming calendar
- Auto-refreshes expired tokens (updates GitHub secrets)
- Outputs top 20 items + stats + calendar to Gist

Run manually: `bun run scripts/sync-trakt.ts`

### yandex-music-proxy

Cloudflare Worker for Yandex Music API:

- CORS proxy with origin whitelist (configured via `ALLOWED_ORIGINS` env var)
- Prod origins: `wrangler.toml`, dev origins: `.dev.vars` (not deployed)
- Allowed paths: `/account/status`, `/users/*`, `/tracks`
- Special routes: `/download-info`, `/proxy-audio` for audio streaming

```bash
cd workers/yandex-music-proxy
bunx wrangler dev      # Dev server (port 8787, reads .dev.vars)
bunx wrangler deploy   # Deploy to Cloudflare (uses wrangler.toml vars)
bunx wrangler tail     # View live logs
```

## Deployment

Three GitHub Actions workflows handle deployment:

| Workflow            | Trigger               | Action                         |
| ------------------- | --------------------- | ------------------------------ |
| `deploy.yml`        | Push to `main`        | Build & deploy to GitHub Pages |
| `sync-trakt.yml`    | Cron (daily)          | Sync watch history to Gist     |
| `deploy-worker.yml` | Changes in `workers/` | Deploy Cloudflare Worker       |

Required secrets: `GH_TOKEN`, `TRAKT_*`, `CLOUDFLARE_API_TOKEN`

Required variables: `GIST_ID`, `GIST_FILENAME`, `YANDEX_MUSIC_PROXY_URL`

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable                 | Description                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `TRAKT_CLIENT_ID`        | Trakt OAuth app ID ([create here](https://trakt.tv/oauth/applications))              |
| `TRAKT_CLIENT_SECRET`    | Trakt OAuth app secret                                                               |
| `TRAKT_ACCESS_TOKEN`     | User access token                                                                    |
| `TRAKT_REFRESH_TOKEN`    | Token for auto-refresh                                                               |
| `GIST_ID`                | GitHub Gist ID for watchlog storage                                                  |
| `GIST_FILENAME`          | Filename in Gist (e.g., `watchlog.json`)                                             |
| `GH_TOKEN`               | GitHub token (scopes: `gist`, `repo`)                                                |
| `GH_REPOSITORY`          | Repository name (auto-set in GitHub Actions)                                         |
| `YANDEX_MUSIC_PROXY_URL` | CORS proxy URL (`http://localhost:8787` for dev, set via CI variable in prod)        |
| `CLOUDFLARE_API_TOKEN`   | Cloudflare API token ([create here](https://dash.cloudflare.com/profile/api-tokens)) |
