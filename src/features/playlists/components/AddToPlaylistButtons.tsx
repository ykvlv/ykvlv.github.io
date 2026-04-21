import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/shared'

interface AddToPlaylistButtonsProps {
  trackId: string
  selectedPlaylists: ReadonlyArray<{ kind: number; title: string }>
  isAdding: boolean
  disabled?: boolean
  variant?: 'compact' | 'cards'
  onAdd: (trackId: string, kind: number) => void
}

export const AddToPlaylistButtons = memo(function AddToPlaylistButtons({
  trackId,
  selectedPlaylists,
  isAdding,
  disabled,
  variant = 'compact',
  onAdd,
}: AddToPlaylistButtonsProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hoverIntent = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buttonsDisabled = Boolean(disabled || isAdding)

  const show = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(true)
  }, [])

  const hide = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }, [])

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  if (selectedPlaylists.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="relative shrink-0"
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return
        hoverIntent.current = true
        show()
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return
        hoverIntent.current = false
        hide()
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={buttonsDisabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Add to playlist"
        className={cn(
          'inline-flex items-center justify-center rounded-lg text-xs font-medium transition-colors outline-none',
          'border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          variant === 'compact' ? 'h-8 w-8' : 'h-7 w-7',
        )}
      >
        {isAdding ? (
          <span
            className="i-lucide-loader-2 size-4 animate-spin"
            aria-label="Adding"
          />
        ) : (
          <span className="i-lucide-plus size-4" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 z-20 min-w-[220px] max-w-[280px] rounded-xl border border-border bg-card shadow-lg shadow-black/10 py-1',
            variant === 'cards' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          {selectedPlaylists.map((p, idx) => (
            <button
              key={p.kind}
              type="button"
              role="menuitem"
              disabled={buttonsDisabled}
              onClick={() => {
                onAdd(trackId, p.kind)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="truncate">{p.title}</span>
              {idx < 9 && (
                <kbd className="text-[10px] font-mono text-muted-foreground bg-secondary border border-border rounded px-1.5 py-0.5">
                  {idx + 1}
                </kbd>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
