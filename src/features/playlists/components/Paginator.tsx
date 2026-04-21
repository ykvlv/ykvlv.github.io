import { memo, useEffect, useState } from 'react'
import { cn } from '@/shared'

interface PaginatorProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  disabled?: boolean
}

export const Paginator = memo(function Paginator({
  currentPage,
  totalPages,
  onPageChange,
  disabled,
}: PaginatorProps) {
  const [draft, setDraft] = useState(String(currentPage))

  useEffect(() => {
    setDraft(String(currentPage))
  }, [currentPage])

  const commit = () => {
    const parsed = parseInt(draft, 10)
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(Math.max(1, parsed), totalPages)
      if (clamped !== currentPage) onPageChange(clamped)
      setDraft(String(clamped))
    } else {
      setDraft(String(currentPage))
    }
  }

  if (totalPages <= 1) return null

  return (
    <nav
      className="flex items-center justify-center gap-2"
      aria-label="Pagination"
    >
      <PageButton
        disabled={disabled || currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        icon="i-lucide-chevron-left"
        label="Previous page"
      />
      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <span className="hidden sm:inline">Page</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            } else if (e.key === 'Escape') {
              setDraft(String(currentPage))
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          aria-label="Current page"
          className={cn(
            'w-12 h-9 text-center rounded-lg border border-border bg-card text-foreground',
            'outline-none tabular-nums',
          )}
        />
        <span>of {totalPages}</span>
      </div>
      <PageButton
        disabled={disabled || currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        icon="i-lucide-chevron-right"
        label="Next page"
      />
    </nav>
  )
})

interface PageButtonProps {
  disabled: boolean
  onClick: () => void
  icon: string
  label: string
}

function PageButton({ disabled, onClick, icon, label }: PageButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center size-9 rounded-lg border border-border bg-card transition-colors outline-none',
        'text-foreground hover:bg-secondary',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-card',
      )}
    >
      <span className={cn(icon, 'size-4')} aria-hidden="true" />
    </button>
  )
}
