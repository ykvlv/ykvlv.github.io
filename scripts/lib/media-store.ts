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
  /** Deletes the oldest names nobody kept this run, and only near the cap. */
  sweep(): Promise<void>
}

/** Width / height from a JPEG's own header; `undefined` for anything else. */
function jpegRatio(bytes: Uint8Array): number | undefined {
  // Refuse anything else outright: the scan below would find marker-shaped
  // bytes in a PNG too and answer with a shape nobody measured
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return

  // Every marker is 0xFF plus a code, then a big-endian length. SOFn holds
  // height then width; the coding-table markers in that range hold neither.
  for (let i = 2; i + 9 < bytes.length;) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6]
      const width = (bytes[i + 7] << 8) | bytes[i + 8]
      return height > 0 ? Number((width / height).toFixed(3)) : undefined
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3])
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
          `GitHub API error: ${response.status} - ${await response.text()}`,
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
      throw new Error(`GitHub API error: ${response.status} - ${detail}`)
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
      console.warn(`${name}: source unreachable (${error}), no picture`)
      return undefined
    }
    if (!response.ok) {
      console.warn(`${name}: source answered ${response.status}, no picture`)
      return undefined
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    const url = await upload(
      name,
      bytes,
      response.headers.get('content-type') ?? 'image/jpeg',
    )
    return { url, ratio: jpegRatio(bytes) }
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
        console.warn(`Release at ${assets.length}, no orphans to sweep`)
        return
      }

      let swept = 0
      for (const asset of doomed) {
        const response = await fetch(
          `${GITHUB_API_BASE}/repos/${repository}/releases/assets/${asset.id}`,
          { method: 'DELETE', headers },
        )
        if (!response.ok) {
          console.warn(`${asset.name}: delete failed, ${response.status}`)
          continue
        }
        swept++
      }
      console.log(`Swept ${swept} orphans, release at ${assets.length - swept}`)
    },
  }
}
