import { cn } from '@/shared'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: string
  title: string
  description: ReactNode
  action?: ReactNode
  className?: string
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card p-8 text-center',
        className,
      )}
    >
      <span
        className={cn(icon, 'size-12 text-muted-foreground mx-auto mb-4')}
        aria-hidden="true"
      />
      <h3 className="font-serif text-xl font-medium text-foreground mb-2">
        {title}
      </h3>
      <div className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
        {description}
      </div>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function NoPlaylists() {
  return (
    <EmptyState
      icon="i-lucide-list-music"
      title="No playlists found"
      description={
        <>
          You don&apos;t have any playlists in your Yandex Music account. Create
          some at{' '}
          <a
            href="https://music.yandex.ru"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            music.yandex.ru
          </a>{' '}
          first, then come back here.
        </>
      }
    />
  )
}

export function AllSorted() {
  return (
    <EmptyState
      icon="i-lucide-check-circle"
      title="All caught up"
      description="Every liked track is filed away in one of your selected playlists. Pick more destinations or like more tracks."
    />
  )
}
