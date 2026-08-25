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
import { requireEnv } from './lib/env.ts'
import { openGist } from './lib/gist.ts'
import { mediaStore } from './lib/media-store.ts'
import type { WhatsnextData, WhatsnextEvent } from '@/features/whatsnext/types'
import { zonedDate, withWeekday } from '@/shared/lib/zoned-date'

// ============================================================================
// Constants
// ============================================================================

const TELEGRAM_PREVIEW_BASE = 'https://t.me/s'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
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

const CHANNELS = requireEnv('WHATSNEXT_CHANNELS')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean)
const OPENROUTER_API_KEY = requireEnv('OPENROUTER_API_KEY')
const GIST_ID = requireEnv('GIST_ID')
const GIST_FILENAME_WHATSNEXT = requireEnv('GIST_FILENAME_WHATSNEXT')
const GH_TOKEN = requireEnv('GH_TOKEN')
const GH_REPOSITORY = requireEnv('GH_REPOSITORY')

const gist = openGist(GIST_ID, GH_TOKEN)
const media = mediaStore(GH_REPOSITORY, MEDIA_RELEASE_TAG, GH_TOKEN)

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
  return (
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(
        /&(?:amp|lt|gt|quot|nbsp);/g,
        (entity) => NAMED_ENTITIES[entity] ?? entity,
      )
      // fromCodePoint throws past 0x10FFFF, and a throw here freezes the
      // cursor on that post forever. Leave an impossible number as text.
      .replace(/&#(\d+);/g, (entity, code: string) =>
        Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : entity,
      )
      .trim()
  )
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
          console.log(`  ${channel}: empty preview, check the name`)
        }
        continue
      }

      posts.push(...fetched)
      advanced[channel] = fetched[fetched.length - 1].num
      console.log(`  ${channel}: ${fetched.length} new`)
    } catch (error) {
      // One dead channel must not take the others down: its cursor stays put.
      console.log(
        `  ${channel}: ${error instanceof Error ? error.message : String(error)}`,
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
      throw new Error(
        `Bad date in "${entry.title}": ${entry.date} .. ${entry.date_end}`,
      )
    }
    // A reversed range reads as already expired and silently vanishes
    if (entry.date_end !== null && entry.date_end < entry.date) {
      throw new Error(
        `date_end ${entry.date_end} before date ${entry.date} in "${entry.title}"`,
      )
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
  known?: WhatsnextEvent,
  photo?: string,
): WhatsnextEvent {
  return {
    id,
    date: entry.date,
    ...(entry.date_end && { date_end: entry.date_end }),
    title: entry.title,
    description: entry.description,
    // Union: the announcing channel keeps its right to cancel.
    source_posts: [
      ...new Set([...(known?.source_posts ?? []), ...entry.source_posts]),
    ],
    ...(photo && { photo }),
    ...(known?.photo_ratio && { photo_ratio: known.photo_ratio }),
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
): WhatsnextEvent[] {
  const byId = new Map(existing.map((event) => [event.id, event]))
  const sent = new Set(posts.map((post) => post.id))
  const photoByPost = new Map(
    posts.flatMap((post) =>
      post.photo ? [[post.id, post.photo] as const] : [],
    ),
  )

  const photoPost = (entry: ModelEntry) =>
    entry.source_posts.find((post) => photoByPost.has(post))

  // A post lends its photo only to a single photoless entry: a digest would
  // put one collage on all five. Entries already pictured do not compete.
  const yieldByPost = new Map<string, number>()
  for (const entry of delta.entries_to_write) {
    const known = entry.id === null ? undefined : byId.get(entry.id)
    if (known?.photo) continue
    const post = photoPost(entry)
    if (post) yieldByPost.set(post, (yieldByPost.get(post) ?? 0) + 1)
  }

  // Seeded from existing ids so a minted id never collides with a stored event.
  const counters = new Map<string, number>()
  for (const id of byId.keys()) {
    const [post, count] = id.split('#')
    if (Number.isFinite(Number(count))) {
      counters.set(post, Math.max(counters.get(post) ?? 0, Number(count)))
    }
  }

  const total = delta.entries_to_write.length + delta.entries_to_cancel.length
  if (total > 0) group(`Delta (${total})`)

  for (const entry of delta.entries_to_write) {
    const post = entry.source_posts[0]
    const known = entry.id === null ? undefined : byId.get(entry.id)

    // A new entry may only cite posts of this batch: posts are public input,
    // and a foreign id would mint into another channel's namespace.
    if (!known && !sent.has(post)) {
      console.log(
        `  ! ${oneline(entry.title)}: source post ${post} not in this batch, dropped`,
      )
      continue
    }
    // An id neither copied from the listing nor null is fabricated, and gets
    // the same answer as any forged reference: rejected, not guessed around.
    if (entry.id !== null && !known) {
      console.log(
        `  ! ${oneline(entry.title)}: unknown id ${entry.id}, dropped`,
      )
      continue
    }

    const id = known?.id ?? nextId(post, counters)

    // An update keeps its photo: its source post is long behind the cursor.
    const from = photoPost(entry)
    const photo =
      known?.photo ??
      (from && yieldByPost.get(from) === 1 ? photoByPost.get(from) : undefined)

    // A photo arriving from Telegram is measured later, when it is copied into the release.
    byId.set(id, toStored(id, entry, known, photo))
    console.log(`  ${known ? '~' : '+'} ${entry.date}  ${oneline(entry.title)}`)
  }

  // Cancels last, so an explicit cancellation wins over a same-run rewrite.
  for (const { id, source_posts, reason } of delta.entries_to_cancel) {
    const cancellers = new Set(source_posts.map((post) => post.split('/')[0]))
    const target = byId.get(id)
    if (!target) {
      console.log(`  ! cancel of ${id} ignored: no such entry`)
    } else if (
      // Only an announcing channel may cancel: a forged cancel is an invisible miss.
      target.source_posts.some((post) => cancellers.has(post.split('/')[0]))
    ) {
      console.log(`  - ${id}  "${oneline(target.title)}"  (${oneline(reason)})`)
      byId.delete(id)
    } else {
      console.log(
        `  ! ${id}  cancel by ${source_posts.join(', ')} ignored: foreign channel`,
      )
    }
  }

  if (total > 0) endGroup()

  // The id tiebreak keeps same-day order stable between runs.
  return [...byId.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )
}

// The only removal path besides cancels. `<` compares the YYYY-MM-DD
// strings extractDelta enforces.
function dropExpired(
  events: WhatsnextEvent[],
  today: string,
): WhatsnextEvent[] {
  const over = (event: WhatsnextEvent) => (event.date_end ?? event.date) < today

  const expired = events.filter(over)
  if (expired.length > 0) {
    group(`Expired (${expired.length})`)
    for (const event of expired) {
      console.log(`  - ${event.date}  ${oneline(event.title)}`)
    }
    endGroup()
  }

  return events.filter((event) => !over(event))
}

// ============================================================================
// Release assets
// ============================================================================

// GitHub rewrites some characters in an asset name, so the id separators go first.
function assetName(eventId: string): string {
  return `${eventId.replaceAll('/', '-').replaceAll('#', '-')}.jpg`
}

/** Copies every Telegram photo into the release and points the event at it. */
async function rehostPhotos(
  events: WhatsnextEvent[],
): Promise<WhatsnextEvent[]> {
  const rehosted: WhatsnextEvent[] = []

  for (const event of events) {
    if (!event.photo) {
      rehosted.push(event)
      continue
    }

    const kept = await media.keep(assetName(event.id), event.photo)
    rehosted.push({
      ...event,
      photo: kept?.url,
      // Off the stored bytes, never the post's HTML, which publishes the
      // collage crop for a photo inside an album.
      photo_ratio: kept && (kept.ratio ?? event.photo_ratio),
    })
  }

  if (media.copied() > 0) console.log(`Photos: ${media.copied()} rehosted`)
  return rehosted
}

// ============================================================================
// Main
// ============================================================================

// ::group:: folds a block in the Actions log viewer; locally it's just a title.
const IN_ACTIONS = Boolean(process.env.GITHUB_ACTIONS)

function group(title: string): void {
  console.log(IN_ACTIONS ? `::group::${title}` : title)
}

function endGroup(): void {
  if (IN_ACTIONS) console.log('::endgroup::')
}

function oneline(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

async function main(): Promise<void> {
  // Read the stored listing
  console.log('Reading Gist...')
  const state = (await gist.read<WhatsnextData>(GIST_FILENAME_WHATSNEXT)) ?? {
    updated_at: '',
    cursors: {},
    events: [],
  }
  console.log(
    `Stored: ${state.events.length} events, cursors for ${Object.keys(state.cursors).length} channels`,
  )

  // Collect fresh posts
  console.log('Fetching channel previews...')
  const { posts, cursors } = await collectPosts(state.cursors)

  // Captionless posts (round videos, stickers) are dropped here rather than
  // in the parser, so they still move the cursor.
  const readable = posts.filter((post) => post.text)
  console.log(`Posts: ${posts.length} new, ${readable.length} readable`)

  // Drop finished events
  const today = zonedDate(new Date())
  let events = dropExpired(state.events, today)

  if (readable.length === 0) {
    console.log('No readable posts, advancing cursors only')
  } else {
    // Ask the model for a delta
    console.log(`Asking ${MODEL} about ${readable.length} posts...`)
    const delta = await extractDelta(today, events, readable)

    const width = Math.max(
      ...delta.post_notes.map((note) => oneline(note.verdict).length),
    )
    group(`Post notes (${delta.post_notes.length})`)
    for (const note of delta.post_notes) {
      console.log(
        `  ${oneline(note.verdict).padEnd(width)}  ${note.post}  ${oneline(note.says)}`,
      )
    }
    endGroup()

    // Merge
    events = applyDelta(events, delta, readable)
    console.log(`Events: ${events.length} after merge`)
  }

  // Copy fresh photos out of Telegram before their urls expire
  events = await rehostPhotos(events)

  // Update Gist
  const data: WhatsnextData = {
    updated_at: new Date().toISOString(),
    cursors,
    events,
  }
  console.log('Updating Gist...')
  await gist.write(GIST_FILENAME_WHATSNEXT, data)

  // Sweep, after the write that decided which photos are still live
  await media.sweep()
  console.log('Done!')
}

main().catch((error) => {
  if (IN_ACTIONS) {
    console.log(
      `::error::${error instanceof Error ? error.message : String(error)}`,
    )
  }
  console.error('Error:', error)
  process.exit(1)
})
