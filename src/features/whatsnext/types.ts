export interface WhatsnextEvent {
  /** `<channel>/<postId>#<n>`, assigned by the script once, never by the LLM */
  id: string
  /** YYYY-MM-DD */
  date: string
  date_end?: string
  title: string
  description: string
  /** `<channel>/<postId>` per announcing post */
  source_posts: string[]
  /** Release asset copied out of Telegram; set by the script, never the LLM */
  photo?: string
  /** Width / height, measured from the photo's own bytes */
  photo_ratio?: number
}

export interface WhatsnextData {
  updated_at: string
  /** channel -> num of the last processed post */
  cursors: Record<string, number>
  events: WhatsnextEvent[]
}
