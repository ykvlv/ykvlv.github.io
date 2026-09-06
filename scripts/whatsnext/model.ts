/**
 * Extract a listing delta from fresh posts
 *
 * Sends the prompt, the current listing, and the posts to the model through
 * OpenRouter as strict structured output, and refuses an answer that lies:
 * a skipped post or an impossible date throws instead of merging.
 */

import { readFile } from 'node:fs/promises'
import type { WhatsnextEvent } from '@/features/whatsnext/types'
import { withWeekday } from '@/shared/lib/zoned-date'

export const MODEL = 'google/gemini-3-flash-preview'
const REASONING_EFFORT = 'high'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export const PROMPT_FILE = new URL('./prompt.md', import.meta.url)

// ============================================================================
// Schema
// ============================================================================

const str = (description: string) => ({ type: 'string', description })
const nullable = (description: string) => ({
  type: ['string', 'null'],
  description,
})

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

function arrayOf(
  properties: Record<string, unknown>,
  description?: string,
): Record<string, unknown> {
  return { type: 'array', items: objectSchema(properties), description }
}

const SOURCE_POSTS_SCHEMA = {
  type: 'array',
  description: 'id постов этой пачки, из которых взяты факты записи',
  items: { type: 'string' },
  minItems: 1,
}

// Key order matters: the model writes fields in this order, dates go before
const ENTRY_PROPERTIES = {
  source_posts: SOURCE_POSTS_SCHEMA,
  title: str('Заголовок записи в афише'),
  date: str(
    'Первый день события, который ещё не прошёл: календарная дата YYYY-MM-DD',
  ),
  date_end: nullable(
    'Последний день события, которое идёт несколько дней или повторяется: YYYY-MM-DD, не раньше date; null, если событие в один день',
  ),
  description: str('Текст записи одним куском, без переносов строк'),
} satisfies Record<keyof Omit<ModelEntry, 'id'>, unknown>

// post_notes first: the model accounts for every post before writing entries.
export const RESPONSE_SCHEMA = objectSchema({
  post_notes: arrayOf(
    {
      post: str('id поста, как он дан на входе'),
      says: str('Пересказ поста своими словами'),
      facts: str(
        'Ведомость фактов анонса. Пост мимо афиши получает вместо ведомости один прочерк',
      ),
      verdict: str(
        'Итог разбора в одно-два слова: что пост делает с афишей или почему он мимо',
      ),
    },
    'Ровно одна заметка на каждый пост из new_posts, в порядке входа',
  ),
  entries_to_write: arrayOf({
    id: nullable(
      'Для апдейта существующей записи – её id, скопированный из existing_entries буква в букву; null для новой записи',
    ),
    ...ENTRY_PROPERTIES,
  }),
  entries_to_cancel: arrayOf({
    id: str(
      'id отменяемой записи, скопированный из existing_entries буква в букву',
    ),
    source_posts: SOURCE_POSTS_SCHEMA,
    reason: str('Причина отмены в несколько слов'),
  }),
})

// ============================================================================
// Types
// ============================================================================

/** A post as the model sees it; `date` is YYYY-MM-DD in the site's zone. */
export interface ModelPost {
  id: string
  date: string
  text: string
}

export interface ModelEntry {
  /** Existing entry this rewrites, null for a new one */
  id: string | null
  source_posts: string[]
  title: string
  description: string
  date: string
  date_end: string | null
}

export interface PostNote {
  post: string
  says: string
  facts: string
  verdict: string
}

export interface ModelDelta {
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

export interface AskOptions {
  model?: string
  promptFile?: URL
  effort?: string
}

// ============================================================================
// Call
// ============================================================================

// Merge and expiry compare dates as strings, so exact YYYY-MM-DD only.
// The regex alone admits 2026-13-45, which as a string never expires,
// so round-trip the value through a real calendar too.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isRealDate = (d: string) =>
  DATE_RE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d

/** Asks the model for the listing delta these posts imply. */
export async function askModel(
  apiKey: string,
  today: string,
  events: WhatsnextEvent[],
  posts: ModelPost[],
  {
    model = MODEL,
    promptFile = PROMPT_FILE,
    effort = REASONING_EFFORT,
  }: AskOptions = {},
): Promise<ModelDelta> {
  const system = (await readFile(promptFile, 'utf8')).trim()

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
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          // Indented: each post starting on its own line helps the model.
          content: JSON.stringify(input, null, 2),
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
      reasoning: { effort },
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
