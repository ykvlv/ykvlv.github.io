import { formatDistanceToNowStrict } from 'date-fns'

/** How stale the Gist behind a page is. The slot stays, dated or not. */
export function GistStatus({ updatedAt }: { updatedAt?: string }) {
  return (
    <p className="h-4 mb-12 text-xs text-muted-foreground">
      {updatedAt &&
        `Last updated: ${formatDistanceToNowStrict(new Date(updatedAt), { addSuffix: true })}`}
    </p>
  )
}
