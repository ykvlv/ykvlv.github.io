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
 */

import { readFile } from 'node:fs/promises'
import type { WhatsnextData, WhatsnextEvent } from '@/features/whatsnext/types'
import { zonedDate, withWeekday } from '@/shared/lib/zoned-date'

// ============================================================================
// Constants
// ============================================================================

const TELEGRAM_PREVIEW_BASE = 'https://t.me/s'
const GITHUB_API_BASE = 'https://api.github.com'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

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

const CHANNELS = requireEnv('WHATSNEXT_CHANNELS').split(',')
const OPENROUTER_API_KEY = requireEnv('OPENROUTER_API_KEY')
const GIST_ID = requireEnv('GIST_ID')
const GIST_FILENAME_WHATSNEXT = requireEnv('GIST_FILENAME_WHATSNEXT')
const GH_TOKEN = requireEnv('GH_TOKEN')

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

      // First text block only: link previews carry the same class further down.
      const body =
        /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(
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
const EVENT_PROPERTIES = {
  source_posts: SOURCE_POSTS_SCHEMA,
  title: { type: 'string' },
  description: { type: 'string' },
  date: { type: 'string' },
  date_end: { type: ['string', 'null'] },
} satisfies Record<keyof Omit<ModelEvent, 'id'>, unknown>

// post_notes first: the model accounts for every post before writing entries.
const RESPONSE_SCHEMA = objectSchema({
  post_notes: arrayOf({
    post: { type: 'string' },
    says: { type: 'string' },
    verdict: { type: 'string' },
  }),
  events_to_write: arrayOf({
    id: { type: ['string', 'null'] },
    ...EVENT_PROPERTIES,
  }),
  events_to_cancel: arrayOf({
    id: { type: 'string' },
    source_posts: SOURCE_POSTS_SCHEMA,
    reason: { type: 'string' },
  }),
})

interface ModelEvent {
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
  events_to_write: ModelEvent[]
  events_to_cancel: { id: string; source_posts: string[]; reason: string }[]
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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
    existing_events: events.map(
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
  for (const event of delta.events_to_write) {
    if (
      !DATE_RE.test(event.date) ||
      (event.date_end !== null && !DATE_RE.test(event.date_end))
    ) {
      throw new Error(`Bad date in "${event.title}"`)
    }
  }

  return delta
}

// ============================================================================
// Merge
// ============================================================================

function toStored(
  id: string,
  event: ModelEvent,
  photo?: string,
): WhatsnextEvent {
  return {
    id,
    date: event.date,
    ...(event.date_end && { date_end: event.date_end }),
    title: event.title,
    description: event.description,
    source_posts: event.source_posts,
    ...(photo && { photo }),
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
  for (const event of delta.events_to_write) {
    const post = event.source_posts[0]
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

  for (const event of delta.events_to_write) {
    const post = event.source_posts[0]
    const known = event.id === null ? undefined : byId.get(event.id)

    // A new entry may only cite posts of this batch: posts are public input,
    // and a foreign id would mint into another channel's namespace.
    if (!known && !sent.has(post)) {
      console.warn(
        `${event.title}: source post ${post} not in this batch, dropped`,
      )
      continue
    }
    if (event.id !== null && !known) {
      // Filed as new rather than dropped: a missing event is worse than a repeat.
      console.warn(`No entry with id ${event.id}, filing it as new`)
    }

    const id = known?.id ?? nextId(post, counters)

    // An update keeps its photo: its source post is long behind the cursor.
    const photo =
      known?.photo ??
      (yieldByPost.get(post) === 1 ? photoByPost.get(post) : undefined)

    byId.set(id, toStored(id, event, photo))
  }

  // Cancels last, so an explicit cancellation wins over a same-run rewrite.
  for (const { id, source_posts } of delta.events_to_cancel) {
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
// Gist API
// ============================================================================

async function readGist(): Promise<WhatsnextData> {
  const response = await fetch(`${GITHUB_API_BASE}/gists/${GIST_ID}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
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
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
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
    for (const event of delta.events_to_write) {
      const target = event.id !== null && known.has(event.id) ? event.id : 'new'
      console.log(`  ${event.date}  ${event.title}  [${target}]`)
    }
    const updated = delta.events_to_write.filter(
      (event) => event.id !== null && known.has(event.id),
    ).length
    console.log(
      `Delta: ${delta.events_to_write.length - updated} new, ${updated} updated, ${delta.events_to_cancel.length} cancelled`,
    )

    events = applyDelta(state.events, delta, readable, today)
    console.log(`Events: ${events.length} after merge and expiry`)
  }

  // Phase 4: Update Gist
  const data: WhatsnextData = {
    updated_at: new Date().toISOString(),
    cursors,
    events,
  }
  console.log('Updating Gist...')
  await updateGist(data)
  console.log('Done!')
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
