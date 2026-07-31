/**
 * Sync Telegram event announcements to GitHub Gist
 *
 * Reads public channel previews (t.me/s/<channel>), hands fresh posts to an
 * LLM, and merges the returned delta into an event listing in a Gist for
 * frontend consumption.
 *
 * Features:
 * - Delta merge: events the model does not mention are never touched
 * - Cursors live next to the events, so a failed run writes nothing and the
 *   next run re-reads the same posts
 * - Photos are copied into a release asset, since Telegram's own urls expire,
 *   and measured on the way so the frontend can reserve the tile's photo box
 */

import { readFile } from 'node:fs/promises'
import type { WhatsnextData, WhatsnextEvent } from '@/features/whatsnext/types'
import { zonedDate, withWeekday } from '@/shared/lib/zoned-date'

// ============================================================================
// Constants
// ============================================================================

const TELEGRAM_PREVIEW_BASE = 'https://t.me/s'
const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_UPLOADS_BASE = 'https://uploads.github.com'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// One release holds every photo; the sweep keeps it under the 1000-asset cap.
const MEDIA_RELEASE_TAG = 'whatsnext-media'

const MODEL = 'google/gemini-3-flash-preview'
const REASONING_EFFORT = 'high'

// Only bounds a flooded channel: paging normally stops on an empty page
const MAX_PAGES = 5

// Resolved against this file so the script runs from any working directory.
const PROMPT_FILE = new URL('./whatsnext-prompt.md', import.meta.url)
const PROMPT_MARKER = '<!-- tail -->'

// ============================================================================
// Environment
// ============================================================================

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return value
}

const CHANNELS = requireEnv('WHATSNEXT_CHANNELS')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean)
const OPENROUTER_API_KEY = requireEnv('OPENROUTER_API_KEY')
const GIST_ID = requireEnv('GIST_ID')
const GIST_FILENAME_WHATSNEXT = requireEnv('GIST_FILENAME_WHATSNEXT')
const GH_TOKEN = requireEnv('GH_TOKEN')
const GH_REPOSITORY = requireEnv('GH_REPOSITORY')

const GH_HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${GH_TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
}

// ============================================================================
// Telegram Preview
// ============================================================================

interface TelegramPost {
  /** `<channel>/<postId>` */
  id: string
  /** Post number, doubles as the pagination cursor */
  num: number
  /** Publication date, YYYY-MM-DD in the site's zone */
  date: string
  text: string
  photo?: string
}

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&nbsp;': ' ',
}

function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(
      /&(?:amp|lt|gt|quot|nbsp);/g,
      (entity) => NAMED_ENTITIES[entity] ?? entity,
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .trim()
}

function parsePosts(html: string): TelegramPost[] {
  // data-post opens each message div: one chunk per post plus a page header.
  return html
    .split('data-post="')
    .slice(1)
    .flatMap((chunk): TelegramPost[] => {
      const id = chunk.slice(0, chunk.indexOf('"'))
      const num = Number(id.split('/')[1])
      const published = /<time datetime="([^"]+)"/.exec(chunk)?.[1]
      if (!Number.isFinite(num) || !published) return []

      // A reply repeats the quoted post under the same tgme class, above its own
      const body = /class="[^"]*js-message_text"[^>]*>([\s\S]*?)<\/div>/.exec(
        chunk,
      )

      // The media wrapper specifically: the chunk also holds avatar and emoji images.
      const media =
        /tgme_widget_message_(?:photo_wrap|video_thumb)[\s\S]*?background-image:url\('([^']+)'\)/.exec(
          chunk,
        )?.[1]

      return [
        {
          id,
          num,
          date: zonedDate(new Date(published)),
          text: toPlainText(body?.[1] ?? ''),
          // https-only drops Telegram's protocol-relative emoji sprites.
          ...(media?.startsWith('https://') && { photo: media }),
        },
      ]
    })
}

async function fetchPage(channel: string, after?: number): Promise<string> {
  const url =
    after === undefined
      ? `${TELEGRAM_PREVIEW_BASE}/${channel}`
      : `${TELEGRAM_PREVIEW_BASE}/${channel}?after=${after}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`)
  }
  return response.text()
}

async function fetchChannel(
  channel: string,
  cursor?: number,
): Promise<TelegramPost[]> {
  // No cursor is a first run: one page, so a new channel seeds from today.
  if (cursor === undefined) {
    return parsePosts(await fetchPage(channel))
  }

  const posts: TelegramPost[] = []
  let after = cursor

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = parsePosts(await fetchPage(channel, after))
    if (batch.length === 0) break

    // `?after=N` returns a window reaching back before N, so each batch keeps
    // only what lies past `after` - on later pages too, or page boundaries
    // duplicate posts - and the loop bails unless the window actually moved.
    const last = batch[batch.length - 1].num
    if (last <= after) break

    posts.push(...batch.filter((post) => post.num > after))
    after = last
  }

  return posts
}

async function collectPosts(
  cursors: Record<string, number>,
): Promise<{ posts: TelegramPost[]; cursors: Record<string, number> }> {
  const posts: TelegramPost[] = []
  const advanced = { ...cursors }
  let failed = 0

  for (const channel of CHANNELS) {
    try {
      const fetched = await fetchChannel(channel, cursors[channel])

      if (fetched.length === 0) {
        // A switched-off preview answers 200 with an empty page, later
        // indistinguishable from "no news" - so only the first run complains.
        if (cursors[channel] === undefined) {
          console.warn(`${channel}: empty preview, check the name`)
        }
        continue
      }

      posts.push(...fetched)
      advanced[channel] = fetched[fetched.length - 1].num
      console.log(`${channel}: ${fetched.length} new posts`)
    } catch (error) {
      // One dead channel must not take the others down: its cursor stays put.
      console.warn(
        `${channel}: ${error instanceof Error ? error.message : String(error)}`,
      )
      failed++
    }
  }

  // Every channel failing at once is an outage, not a quiet news day.
  if (failed > 0 && failed === CHANNELS.length) {
    throw new Error('All channels failed')
  }

  return { posts, cursors: advanced }
}

// ============================================================================
// Model Schema
// ============================================================================

const SOURCE_POSTS_SCHEMA = {
  type: 'array',
  items: { type: 'string' },
  minItems: 1,
}

function objectSchema(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

function arrayOf(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'array', items: objectSchema(properties) }
}

// Key order matters: the model writes fields in this order, prose before dates.
const ENTRY_PROPERTIES = {
  source_posts: SOURCE_POSTS_SCHEMA,
  title: { type: 'string' },
  description: { type: 'string' },
  date: { type: 'string' },
  date_end: { type: ['string', 'null'] },
} satisfies Record<keyof Omit<ModelEntry, 'id'>, unknown>

// post_notes first: the model accounts for every post before writing entries.
const RESPONSE_SCHEMA = objectSchema({
  post_notes: arrayOf({
    post: { type: 'string' },
    says: { type: 'string' },
    verdict: { type: 'string' },
  }),
  entries_to_write: arrayOf({
    id: { type: ['string', 'null'] },
    ...ENTRY_PROPERTIES,
  }),
  entries_to_cancel: arrayOf({
    id: { type: 'string' },
    source_posts: SOURCE_POSTS_SCHEMA,
    reason: { type: 'string' },
  }),
})

interface ModelEntry {
  /** Existing entry this rewrites, null for a new one */
  id: string | null
  source_posts: string[]
  title: string
  description: string
  date: string
  date_end: string | null
}

interface PostNote {
  post: string
  says: string
  verdict: string
}

interface ModelDelta {
  post_notes: PostNote[]
  entries_to_write: ModelEntry[]
  entries_to_cancel: { id: string; source_posts: string[]; reason: string }[]
}

interface OpenRouterResponse {
  /** Which upstream OpenRouter routed to; voice regressions correlate with it */
  provider?: string
  choices?: {
    message: { content: string }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    completion_tokens_details?: { reasoning_tokens?: number }
  }
  error?: { message: string }
}

// ============================================================================
// LLM Call
// ============================================================================

// Merge and expiry compare dates as strings, so exact YYYY-MM-DD only.
// The regex alone admits 2026-13-45, which as a string never expires,
// so round-trip the value through a real calendar too.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isRealDate = (d: string) =>
  DATE_RE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d

async function readPrompt(): Promise<{ system: string; tail: string }> {
  const parts = (await readFile(PROMPT_FILE, 'utf8')).split(PROMPT_MARKER)
  if (parts.length !== 2) {
    throw new Error(
      `${PROMPT_FILE.pathname}: expected one ${PROMPT_MARKER} marker, found ${parts.length - 1}`,
    )
  }
  return { system: parts[0].trim(), tail: parts[1].trim() }
}

// The model follows a count it can check; a lost placeholder must fail loudly.
function withCount(tail: string, posts: number): string {
  if (!tail.includes('{{new_posts}}')) {
    throw new Error(
      `${PROMPT_FILE.pathname}: tail has no {{new_posts}} placeholder`,
    )
  }
  return tail.replaceAll('{{new_posts}}', String(posts))
}

async function extractDelta(
  today: string,
  events: WhatsnextEvent[],
  posts: TelegramPost[],
): Promise<ModelDelta> {
  const { system, tail } = await readPrompt()

  const input = {
    today: withWeekday(today),
    // Everything except photo, which the model must not know about.
    existing_entries: events.map(
      ({ id, date, date_end, title, description, source_posts }) => ({
        id,
        date,
        date_end: date_end ?? null,
        title,
        description,
        source_posts,
      }),
    ),
    new_posts: posts.map(({ id, date, text }) => ({
      id,
      published: withWeekday(date),
      text,
    })),
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          // Indented: each post starting on its own line helps the model.
          content: `${JSON.stringify(input, null, 2)}\n\n${withCount(tail, posts.length)}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'listing_delta',
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
      reasoning: { effort: REASONING_EFFORT },
      // No temperature: Gemini is tuned for its default, anything else loops.
    }),
  })
  if (!response.ok) {
    throw new Error(
      `OpenRouter error: ${response.status} - ${await response.text()}`,
    )
  }

  const data = (await response.json()) as OpenRouterResponse
  const choice = data.choices?.[0]
  if (data.error || !choice) {
    throw new Error(
      `OpenRouter error: ${data.error?.message ?? 'no choices returned'}`,
    )
  }
  // A truncated answer is invalid JSON anyway, but saying so beats a parse error.
  if (choice.finish_reason === 'length') {
    throw new Error('Model hit its output limit, response truncated')
  }

  const usage = data.usage
  if (usage) {
    const reasoning = usage.completion_tokens_details?.reasoning_tokens
    console.log(
      `Tokens: ${usage.prompt_tokens} in, ${usage.completion_tokens} out` +
        (reasoning === undefined ? '' : ` (${reasoning} of it thinking)`) +
        (data.provider ? ` via ${data.provider}` : ''),
    )
  }

  const delta = JSON.parse(choice.message.content) as ModelDelta

  // The two model lies worth catching: a skipped post, and a date the merge
  // cannot compare.
  if (delta.post_notes.length !== posts.length) {
    throw new Error(
      `Model returned ${delta.post_notes.length} post_notes for ${posts.length} posts`,
    )
  }
  for (const entry of delta.entries_to_write) {
    if (
      !isRealDate(entry.date) ||
      (entry.date_end !== null && !isRealDate(entry.date_end))
    ) {
      throw new Error(`Bad date in "${entry.title}"`)
    }
    // A reversed range reads as already expired and silently vanishes
    if (entry.date_end !== null && entry.date_end < entry.date) {
      throw new Error(`date_end before date in "${entry.title}"`)
    }
  }

  return delta
}

// ============================================================================
// Merge
// ============================================================================

function toStored(
  id: string,
  entry: ModelEntry,
  photo?: string,
  photoRatio?: number,
): WhatsnextEvent {
  return {
    id,
    date: entry.date,
    ...(entry.date_end && { date_end: entry.date_end }),
    title: entry.title,
    description: entry.description,
    source_posts: entry.source_posts,
    ...(photo && { photo }),
    ...(photoRatio && { photo_ratio: photoRatio }),
  }
}

function nextId(post: string, counters: Map<string, number>): string {
  const next = (counters.get(post) ?? 0) + 1
  counters.set(post, next)
  return `${post}#${next}`
}

function applyDelta(
  existing: WhatsnextEvent[],
  delta: ModelDelta,
  posts: TelegramPost[],
  today: string,
): WhatsnextEvent[] {
  const byId = new Map(existing.map((event) => [event.id, event]))
  const sent = new Set(posts.map((post) => post.id))
  const photoByPost = new Map(
    posts.flatMap((post) =>
      post.photo ? [[post.id, post.photo] as const] : [],
    ),
  )

  // A post that produced exactly one entry lends it its photo; a digest that
  // produced five would put the same collage on all five.
  const yieldByPost = new Map<string, number>()
  for (const entry of delta.entries_to_write) {
    const post = entry.source_posts[0]
    yieldByPost.set(post, (yieldByPost.get(post) ?? 0) + 1)
  }

  // Seeded from existing ids so a minted id never collides with a stored event.
  const counters = new Map<string, number>()
  for (const id of byId.keys()) {
    const [post, count] = id.split('#')
    if (Number.isFinite(Number(count))) {
      counters.set(post, Math.max(counters.get(post) ?? 0, Number(count)))
    }
  }

  for (const entry of delta.entries_to_write) {
    const post = entry.source_posts[0]
    const known = entry.id === null ? undefined : byId.get(entry.id)

    // A new entry may only cite posts of this batch: posts are public input,
    // and a foreign id would mint into another channel's namespace.
    if (!known && !sent.has(post)) {
      console.warn(
        `${entry.title}: source post ${post} not in this batch, dropped`,
      )
      continue
    }
    if (entry.id !== null && !known) {
      // Filed as new rather than dropped: a missing event is worse than a repeat.
      console.warn(`No entry with id ${entry.id}, filing it as new`)
    }

    const id = known?.id ?? nextId(post, counters)

    // An update keeps its photo: its source post is long behind the cursor.
    const photo =
      known?.photo ??
      (yieldByPost.get(post) === 1 ? photoByPost.get(post) : undefined)

    // A photo arriving from Telegram is measured later, when it is copied into the release.
    byId.set(id, toStored(id, entry, photo, known?.photo_ratio))
  }

  // Cancels last, so an explicit cancellation wins over a same-run rewrite.
  for (const { id, source_posts } of delta.entries_to_cancel) {
    const cancellers = new Set(source_posts.map((post) => post.split('/')[0]))
    const target = byId.get(id)
    if (!target) {
      console.warn(`Cancel of ${id} ignored: no such entry`)
    } else if (
      // Only an announcing channel may cancel: a forged cancel is an invisible miss.
      target.source_posts.some((post) => cancellers.has(post.split('/')[0]))
    ) {
      byId.delete(id)
    } else {
      console.warn(
        `Cancel of ${id} by ${source_posts.join(', ')} ignored: foreign channel`,
      )
    }
  }

  return (
    [...byId.values()]
      // The only removal path besides cancels; `>=` compares the YYYY-MM-DD
      // strings extractDelta enforces.
      .filter((event) => (event.date_end ?? event.date) >= today)
      // The id tiebreak keeps same-day order stable between runs.
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  )
}

// ============================================================================
// Release Media
// ============================================================================

// A Telegram CDN url embeds an expiring file_reference: most die within a day,
// a dead one never revives, and re-rendering the post mints a different url
// instead. So a photo is copied out on the run that first sees it - by the next
// one its post is behind the cursor and the url is already gone. Release assets
// rather than the repo, whose git history would carry every photo forever.

const ASSET_BASE = `https://github.com/${GH_REPOSITORY}/releases/download/${MEDIA_RELEASE_TAG}/`

interface ReleaseAsset {
  id: number
  name: string
  created_at: string
}

// GitHub caps a release at 1000 assets. The rest is headroom: a run uploads
// before it sweeps, so it must never meet the cap mid-copy.
const ASSET_LIMIT = 900

// GitHub rewrites some characters in an asset name, so the id separators go first.
function assetName(eventId: string): string {
  return `${eventId.replaceAll('/', '-').replaceAll('#', '-')}.jpg`
}

/** Id of the one media release, which this script only ever reads. */
async function readMediaRelease(): Promise<number> {
  const found = await fetch(
    `${GITHUB_API_BASE}/repos/${GH_REPOSITORY}/releases/tags/${MEDIA_RELEASE_TAG}`,
    { headers: GH_HEADERS },
  )
  if (!found.ok) {
    throw new Error(
      `${MEDIA_RELEASE_TAG} release: ${found.status} - ${await found.text()}`,
    )
  }
  return ((await found.json()) as { id: number }).id
}

/**
 * Width / height from a JPEG's own header, which is what Telegram serves.
 * The frontend reserves the tile's photo box from this, so it must come from
 * the bytes: a post's HTML publishes the shape of a single photo, but inside
 * an album it publishes the collage crop instead of the photo.
 */
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

/** Asset url and shape, or nothing once Telegram's copy is gone. */
async function uploadPhoto(
  releaseId: number,
  name: string,
  source: string,
): Promise<{ url: string; ratio?: number } | undefined> {
  const image = await fetch(source)
  if (!image.ok) {
    // Expired between the page render and here. The post is unreachable now, so
    // the entry loses its picture rather than wedging every future run.
    console.warn(`${name}: source photo ${image.status}, dropped`)
    return undefined
  }

  const bytes = new Uint8Array(await image.arrayBuffer())
  const response = await fetch(
    `${GITHUB_UPLOADS_BASE}/repos/${GH_REPOSITORY}/releases/${releaseId}/assets?name=${name}`,
    {
      method: 'POST',
      headers: {
        ...GH_HEADERS,
        'Content-Type': image.headers.get('content-type') ?? 'image/jpeg',
      },
      body: bytes,
    },
  )
  if (!response.ok) {
    const detail = await response.text()
    // A run that dies before the gist write leaves the asset but not the
    // advanced cursor, so the next run mints that id again. Throwing here
    // would wedge every run after it on the same name.
    if (response.status === 422 && detail.includes('already_exists')) {
      console.warn(`${name}: already in the release, kept as is`)
      return { url: `${ASSET_BASE}${name}`, ratio: jpegRatio(bytes) }
    }
    throw new Error(`GitHub API error: ${response.status} - ${detail}`)
  }

  const { browser_download_url } = (await response.json()) as {
    browser_download_url: string
  }
  return { url: browser_download_url, ratio: jpegRatio(bytes) }
}

/** The events again, with every Telegram photo now pointing at the release. */
async function rehostPhotos(
  releaseId: number,
  events: WhatsnextEvent[],
): Promise<WhatsnextEvent[]> {
  const rehosted: WhatsnextEvent[] = []
  let copied = 0

  for (const event of events) {
    // Copied by an earlier run, so it is never re-read either: a photo older
    // than photo_ratio keeps none, which is why the frontend tolerates that
    if (!event.photo || event.photo.startsWith(ASSET_BASE)) {
      rehosted.push(event)
      continue
    }

    const photo = await uploadPhoto(releaseId, assetName(event.id), event.photo)
    if (photo) copied++
    rehosted.push({ ...event, photo: photo?.url, photo_ratio: photo?.ratio })
  }

  if (copied > 0) console.log(`Photos: ${copied} copied into the release`)
  return rehosted
}

/** Every asset of the release, across as many pages as it takes. */
async function readAssets(releaseId: number): Promise<ReleaseAsset[]> {
  const assets: ReleaseAsset[] = []
  for (let page = 1; ; page++) {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${GH_REPOSITORY}/releases/${releaseId}/assets?per_page=100&page=${page}`,
      { headers: GH_HEADERS },
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

/**
 * Frees room once the release nears the cap and only then, oldest orphans
 * first. Below the limit nothing is deleted: an orphan costs a slot and
 * nothing else, while deleting one takes the last surviving copy of a photo
 * with it, and an event dropped by mistake can be restored where its picture
 * cannot.
 */
async function sweepAssets(
  releaseId: number,
  events: WhatsnextEvent[],
): Promise<void> {
  const assets = await readAssets(releaseId)
  if (assets.length <= ASSET_LIMIT) return

  const live = new Set(
    events.flatMap((event) => (event.photo ? [assetName(event.id)] : [])),
  )
  const doomed = assets
    .filter((asset) => !live.has(asset.name))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    // Clamped: a negative end slices from the tail and would take every
    // orphan but the newest
    .slice(0, Math.max(0, assets.length - ASSET_LIMIT))

  for (const asset of doomed) {
    await fetch(
      `${GITHUB_API_BASE}/repos/${GH_REPOSITORY}/releases/assets/${asset.id}`,
      { method: 'DELETE', headers: GH_HEADERS },
    )
  }

  console.log(
    `Photos: ${assets.length} assets in the release, ${doomed.length} oldest orphans swept`,
  )
}

// ============================================================================
// Gist API
// ============================================================================

async function readGist(): Promise<WhatsnextData> {
  const response = await fetch(`${GITHUB_API_BASE}/gists/${GIST_ID}`, {
    headers: GH_HEADERS,
  })

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} - ${await response.text()}`,
    )
  }

  const gist = (await response.json()) as {
    files: Record<string, { content: string } | undefined>
  }
  const file = gist.files[GIST_FILENAME_WHATSNEXT]

  return file
    ? (JSON.parse(file.content) as WhatsnextData)
    : { updated_at: '', cursors: {}, events: [] }
}

async function updateGist(data: WhatsnextData): Promise<void> {
  const response = await fetch(`${GITHUB_API_BASE}/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: GH_HEADERS,
    body: JSON.stringify({
      files: {
        [GIST_FILENAME_WHATSNEXT]: { content: JSON.stringify(data, null, 2) },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} - ${await response.text()}`,
    )
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  // Phase 0: Read the stored listing
  console.log('Reading Gist...')
  const state = await readGist()
  console.log(
    `Stored: ${state.events.length} events, cursors for ${Object.keys(state.cursors).length} channels`,
  )

  // Phase 1: Collect fresh posts
  console.log('Fetching channel previews...')
  const { posts, cursors } = await collectPosts(state.cursors)
  if (posts.length === 0) {
    console.log('No new posts, nothing to do')
    return
  }

  // Captionless posts (round videos, stickers) are dropped here rather than
  // in the parser, so they still move the cursor.
  const readable = posts.filter((post) => post.text)
  console.log(`Posts: ${posts.length} new, ${readable.length} readable`)

  const today = zonedDate(new Date())
  let events = state.events

  if (readable.length === 0) {
    console.log('No readable posts, advancing cursors only')
  } else {
    // Phase 2: Ask the model for a delta
    console.log(`Asking ${MODEL} about ${readable.length} posts...`)
    const delta = await extractDelta(today, state.events, readable)

    // Phase 3: Merge
    const known = new Set(state.events.map((event) => event.id))
    for (const entry of delta.entries_to_write) {
      const target = entry.id !== null && known.has(entry.id) ? entry.id : 'new'
      console.log(`  ${entry.date}  ${entry.title}  [${target}]`)
    }
    const updated = delta.entries_to_write.filter(
      (entry) => entry.id !== null && known.has(entry.id),
    ).length
    console.log(
      `Delta: ${delta.entries_to_write.length - updated} new, ${updated} updated, ${delta.entries_to_cancel.length} cancelled`,
    )

    events = applyDelta(state.events, delta, readable, today)
    console.log(`Events: ${events.length} after merge and expiry`)
  }

  // Phase 4: Copy fresh photos out of Telegram before their urls expire
  const releaseId = await readMediaRelease()
  events = await rehostPhotos(releaseId, events)

  // Phase 5: Update Gist
  const data: WhatsnextData = {
    updated_at: new Date().toISOString(),
    cursors,
    events,
  }
  console.log('Updating Gist...')
  await updateGist(data)

  // Phase 6: Sweep, after the write that decided which photos are still live
  await sweepAssets(releaseId, events)
  console.log('Done!')
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
