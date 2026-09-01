/**
 * Reads a public channel through its t.me/s preview: no API, no account.
 */

import { zonedDate } from '@/shared/lib/zoned-date'

const TELEGRAM_PREVIEW_BASE = 'https://t.me/s'

// Only bounds a flooded channel: paging normally stops on an empty page
const MAX_PAGES = 5

export interface TelegramPost {
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

/** Posts past the cursor, oldest first; without a cursor, the latest page. */
export async function fetchChannel(
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
