# ykvlv.dev

Personal portfolio PWA with Trakt watchlog and Yandex Music playlist sorter.

**Live:** https://www.ykvlv.dev

## Features

- **Home** — Landing page with project cards
- **Watchlog** — Movie/TV watch history synced from Trakt every 6 hours
- **Playlists** — Sort Yandex Music liked tracks into playlists (runs entirely in browser, token stays on device)

## Tech Stack

React 19, TypeScript, Vite, UnoCSS, PWA (Workbox), Bun

## Getting Started

```bash
bun install        # Install dependencies
bun run dev        # Start dev server (localhost:5173)
bun run build      # TypeScript check + production build
bun run lint       # Run ESLint
bun run format     # Format with Prettier
```

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
| `YANDEX_MUSIC_PROXY_URL` | Cloudflare Worker URL for audio proxy                                                |
| `CLOUDFLARE_API_TOKEN`   | Cloudflare API token ([create here](https://dash.cloudflare.com/profile/api-tokens)) |

## Project Structure

```
src/
├── features/           # Feature modules (isolated by domain)
│   ├── home/           # Landing page components
│   ├── watchlog/       # Watchlog components, hooks, types
│   └── playlists/      # Playlists hooks, API client, types
├── shared/             # Shared UI, hooks, utilities
│   ├── components/     # Layout, UI primitives
│   ├── hooks/          # useTheme
│   └── lib/            # cn() utility
├── pages/              # Route entry points (lazy-loaded)
└── layouts/            # App shell (Header + Footer)

scripts/
└── sync-trakt.ts       # Trakt → Gist sync script

workers/
└── yandex-music-proxy/ # Cloudflare Worker for CORS proxy
```

## Architecture

### Watchlog

```
Trakt API  →  sync-trakt.ts (cron every 6h)  →  GitHub Gist  →  Frontend
```

The sync script fetches watch history, ratings, and upcoming calendar from Trakt, then stores it in a public Gist. Frontend fetches from Gist raw URL with service worker caching.

### Playlists

```
Frontend  →  Yandex Music Proxy (Cloudflare Worker)  →  Yandex Music API
```

User provides their Yandex Music OAuth token. All API calls and audio streams go through CORS proxy.

**BPM Analyzer:** Built-in tempo detection using Web Audio API. Analyzes tracks on playback or in batch mode. Results cached in localStorage.

### PWA

Built with vite-plugin-pwa and Workbox:

- **Installable** — standalone app on mobile/desktop
- **Auto-update** — new versions apply automatically
- **Offline support** — static assets precached

**Runtime caching:**

| Resource      | Strategy      | Max Age |
| ------------- | ------------- | ------- |
| Gist data     | Network-first | 7 days  |
| Trakt images  | Cache-first   | 30 days |
| Yandex covers | Cache-first   | 1 year  |

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

- CORS proxy with origin whitelist (`localhost:5173`, `www.ykvlv.dev`)
- Allowed paths: `/account/status`, `/users/*`, `/tracks`
- Special routes: `/download-info`, `/proxy-audio` for audio streaming

```bash
cd workers/yandex-music-proxy
bunx wrangler dev      # Dev server (port 8787)
bunx wrangler deploy   # Manually deploy to Cloudflare
bunx wrangler tail     # View live logs
```

## Deployment

Three GitHub Actions workflows handle deployment:

| Workflow            | Trigger               | Action                         |
| ------------------- | --------------------- | ------------------------------ |
| `deploy.yml`        | Push to `main`        | Build & deploy to GitHub Pages |
| `sync-trakt.yml`    | Cron (every 6h)       | Sync watch history to Gist     |
| `deploy-worker.yml` | Changes in `workers/` | Deploy Cloudflare Worker       |

Required secrets: `GH_TOKEN`, `TRAKT_*`, `CLOUDFLARE_API_TOKEN`

Required variables: `GIST_ID`, `GIST_FILENAME`, `YANDEX_MUSIC_PROXY_URL`
