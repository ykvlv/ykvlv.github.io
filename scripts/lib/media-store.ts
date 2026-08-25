/**
 * Pictures rehosted as assets of one GitHub release, shared by both syncs.
 *
 * `keep` looks the name up among the release assets first and returns that one
 * without fetching the source, so a name must always mean the same picture:
 * reuse one for a different picture and the old one is served in its place.
 */

import { GITHUB_API_BASE, githubHeaders } from './github.ts'

const GITHUB_UPLOADS_BASE = 'https://uploads.github.com'

// GitHub caps a release at 1000 assets. The rest is headroom: a run uploads
// before it sweeps, so it must never meet the cap mid-copy.
const ASSET_LIMIT = 900

interface ReleaseAsset {
  id: number
  name: string
  created_at: string
}

interface StoredPicture {
  url: string
  /**
   * Width / height, off the bytes. Only the run that fetched them measures, so
   * a picture stored earlier answers without one and a caller that needs the
   * shape must keep its own copy.
   */
  ratio?: number
}

interface MediaStore {
  /**
   * The picture at `source`, stored under `name` and served from github.com.
   * `undefined` once the source will not answer; a GitHub failure still throws.
   *
   * Every name asked for counts as live, so anything the caller still wants
   * must pass through here on every run - including pictures stored long ago,
   * which cost nothing but a lookup.
   */
  keep(name: string, source: string): Promise<StoredPicture | undefined>
  /**
   * How many pictures this run actually fetched and uploaded. Cache hits and
   * refused sources stay out - callers cannot tell those apart from a copy by
   * comparing urls, so the store is the one place this can be counted.
   */
  copied(): number
  /** Deletes the oldest names nobody kept this run, and only near the cap. */
  sweep(): Promise<void>
}

/** Width / height off the bytes; `undefined` for anything else. */
async function measure(bytes: Uint8Array): Promise<number | undefined> {
  try {
    const { width, height } = await new Bun.Image(bytes).metadata()
    return height > 0 ? Number((width / height).toFixed(3)) : undefined
  } catch {
    // Not a recognizable format
    return undefined
  }
}

export function mediaStore(
  repository: string,
  tag: string,
  token: string,
): MediaStore {
  const headers = githubHeaders(token)
  const base = `https://github.com/${repository}/releases/download/${tag}/`

  let release: Promise<number> | undefined
  // The release as it stood before this run touched it, read at most once.
  let stored: Promise<Set<string>> | undefined
  // Never cleared: within a run it dedupes fetches (a refusal included), and
  // by the end it is the set the sweep must not touch.
  const kept = new Map<string, Promise<StoredPicture | undefined>>()
  let copies = 0

  const id = () =>
    (release ??= (async () => {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${repository}/releases/tags/${tag}`,
        { headers },
      )
      if (!response.ok) {
        throw new Error(
          `${tag} release: ${response.status} - ${await response.text()}`,
        )
      }
      return ((await response.json()) as { id: number }).id
    })())

  async function list(): Promise<ReleaseAsset[]> {
    const assets: ReleaseAsset[] = []
    for (let page = 1; ; page++) {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${repository}/releases/${await id()}/assets?per_page=100&page=${page}`,
        { headers },
      )
      if (!response.ok) {
        throw new Error(
          `Release assets list: ${response.status} - ${await response.text()}`,
        )
      }
      const batch = (await response.json()) as ReleaseAsset[]
      assets.push(...batch)
      if (batch.length < 100) return assets
    }
  }

  async function upload(
    name: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<string> {
    const response = await fetch(
      `${GITHUB_UPLOADS_BASE}/repos/${repository}/releases/${await id()}/assets?name=${name}`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType },
        body: bytes,
      },
    )
    if (!response.ok) {
      const detail = await response.text()
      // A run that died before its write leaves the asset: same name, same picture.
      if (response.status === 422 && detail.includes('already_exists')) {
        return `${base}${name}`
      }
      throw new Error(`Asset upload ${name}: ${response.status} - ${detail}`)
    }
    const { browser_download_url } = (await response.json()) as {
      browser_download_url: string
    }
    return browser_download_url
  }

  async function copy(
    name: string,
    source: string,
  ): Promise<StoredPicture | undefined> {
    // A refusal and a host that never answers are one case here: no picture.
    let response: Response
    try {
      response = await fetch(source)
    } catch (error) {
      const cause =
        error instanceof Error ? (error.cause ?? error.message) : error
      console.log(`  ${name}: source unreachable (${cause}), no picture`)
      return undefined
    }
    if (!response.ok) {
      console.log(`  ${name}: source answered ${response.status}, no picture`)
      return undefined
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    const url = await upload(
      name,
      bytes,
      response.headers.get('content-type') ?? 'image/jpeg',
    )
    copies++
    return { url, ratio: await measure(bytes) }
  }

  return {
    keep(name, source) {
      const pending = kept.get(name)
      if (pending) return pending

      const picture = (async () => {
        stored ??= list().then((assets) => new Set(assets.map((a) => a.name)))
        if ((await stored).has(name)) return { url: `${base}${name}` }
        return copy(name, source)
      })()
      kept.set(name, picture)
      return picture
    },

    copied: () => copies,

    async sweep() {
      // Freshly listed rather than reusing `stored`, which predates this run's
      // own uploads and would undercount the release against the cap.
      const assets = await list()
      if (assets.length <= ASSET_LIMIT) return

      const doomed = assets
        .filter((asset) => !kept.has(asset.name))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(0, assets.length - ASSET_LIMIT)

      if (doomed.length === 0) {
        // Silence would let the release fill to 1000 and start refusing
        // uploads with nothing in the log to explain it.
        console.log(`Release at ${assets.length}, no orphans to sweep`)
        return
      }

      let swept = 0
      for (const asset of doomed) {
        const response = await fetch(
          `${GITHUB_API_BASE}/repos/${repository}/releases/assets/${asset.id}`,
          { method: 'DELETE', headers },
        )
        if (!response.ok) {
          console.log(`  ${asset.name}: delete failed, ${response.status}`)
          continue
        }
        swept++
      }
      console.log(`Swept ${swept} orphans, release at ${assets.length - swept}`)
    },
  }
}
