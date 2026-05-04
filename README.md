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

### PWA

Installable, auto-updating, offline-capable. Service worker caches Gist data and Trakt poster images.

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
│   └── watchlog/       # Watchlog components, hooks, types
├── shared/             # Shared UI, hooks, utilities
│   ├── components/     # Layout, UI primitives
│   ├── hooks/          # useTheme
│   └── lib/            # cn() utility
├── pages/              # Route entry points (lazy-loaded)
└── layouts/            # App shell (Header + Footer)

scripts/
└── sync-trakt.ts       # Trakt → Gist sync script
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

## Deployment

Two GitHub Actions workflows handle deployment:

| Workflow         | Trigger        | Action                         |
| ---------------- | -------------- | ------------------------------ |
| `deploy.yml`     | Push to `main` | Build & deploy to GitHub Pages |
| `sync-trakt.yml` | Cron (daily)   | Sync watch history to Gist     |

Required secrets: `GH_TOKEN`, `TRAKT_*`

Required variables: `GIST_ID`, `GIST_FILENAME`

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable              | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `TRAKT_CLIENT_ID`     | Trakt OAuth app ID ([create here](https://trakt.tv/oauth/applications)) |
| `TRAKT_CLIENT_SECRET` | Trakt OAuth app secret                                                  |
| `TRAKT_ACCESS_TOKEN`  | User access token                                                       |
| `TRAKT_REFRESH_TOKEN` | Token for auto-refresh                                                  |
| `GIST_ID`             | GitHub Gist ID for watchlog storage                                     |
| `GIST_FILENAME`       | Filename in Gist (e.g., `watchlog.json`)                                |
| `GH_TOKEN`            | GitHub token (scopes: `gist`, `repo`)                                   |
| `GH_REPOSITORY`       | Repository name (auto-set in GitHub Actions)                            |
