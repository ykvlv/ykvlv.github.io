import { memo } from 'react'
import { cn, Skeleton } from '@/shared'
import type { YandexUserInfo } from '../types'

interface UserHeaderProps {
  user?: YandexUserInfo | null
  isRefreshing?: boolean
  onRefresh?: () => void
  onLogout?: () => void
  isLoading?: boolean
  loadingHint?: string
}

export const UserHeader = memo(function UserHeader({
  user,
  isRefreshing,
  onRefresh,
  onLogout,
  isLoading,
  loadingHint,
}: UserHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Signed in as
        </p>
        {isLoading ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className="i-lucide-loader-2 size-4 text-muted-foreground animate-spin"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-muted-foreground">
                Restoring session…
              </p>
            </div>
            {loadingHint && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                {loadingHint}
              </p>
            )}
          </>
        ) : (
          <p className="truncate text-base font-medium text-foreground">
            {user?.name}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isLoading ? (
          <>
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
          </>
        ) : (
          <>
            <IconButton
              icon={cn(
                'i-lucide-refresh-cw size-4',
                isRefreshing && 'animate-spin',
              )}
              label="Refresh data"
              onClick={onRefresh!}
              disabled={isRefreshing}
            />
            <IconButton
              icon="i-lucide-log-out size-4"
              label="Sign out"
              onClick={onLogout!}
            />
          </>
        )}
      </div>
    </div>
  )
})

interface IconButtonProps {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}

function IconButton({ icon, label, onClick, disabled }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center size-9 rounded-lg border border-border bg-card text-muted-foreground transition-colors outline-none',
        'hover:bg-secondary hover:text-foreground',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:text-muted-foreground',
      )}
    >
      <span className={icon} aria-hidden="true" />
    </button>
  )
}
