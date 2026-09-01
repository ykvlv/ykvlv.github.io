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

import { requireEnv } from './lib/env.ts'
import { openGist } from './lib/gist.ts'
import { mediaStore } from './lib/media-store.ts'
import {
  MODEL,
  askModel,
  type ModelDelta,
  type ModelEntry,
} from './whatsnext/model.ts'
import { fetchChannel, type TelegramPost } from './whatsnext/telegram.ts'
import type { WhatsnextData, WhatsnextEvent } from '@/features/whatsnext/types'
import { zonedDate } from '@/shared/lib/zoned-date'

// ============================================================================
// Constants
// ============================================================================

const MEDIA_RELEASE_TAG = 'whatsnext-media'

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
// Channels
// ============================================================================

async function collectPosts(
  cursors: Record<string, number>,
): Promise<{ posts: TelegramPost[]; cursors: Record<string, number> }> {
  const posts: TelegramPost[] = []
  const advanced = { ...cursors }
  let failed = 0

  group(`Channels (${CHANNELS.length})`)
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
  endGroup()

  // Every channel failing at once is an outage, not a quiet news day.
  if (failed > 0 && failed === CHANNELS.length) {
    throw new Error('All channels failed')
  }

  return { posts, cursors: advanced }
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
// strings askModel enforces.
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
    const delta = await askModel(OPENROUTER_API_KEY, today, events, readable)

    const width = Math.max(
      ...delta.post_notes.map((note) => oneline(note.verdict).length),
    )
    group(`Post notes (${delta.post_notes.length})`)
    for (const note of delta.post_notes) {
      console.log(
        `  ${oneline(note.verdict).padEnd(width)}  ${note.post}  ${oneline(note.says)}`,
      )
      // A post off the listing writes a dash instead of a ledger; the glyph varies.
      const facts = oneline(note.facts)
      if (!/^[-–—]*$/.test(facts)) {
        console.log(`  ${' '.repeat(width)}  ╰ ${facts}`)
      }
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
