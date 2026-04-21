import { useEffect } from 'react'
import { cn } from '@/shared'

interface KeyboardHelpProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  {
    keys: ['↑', '↓', 'W', 'S'],
    action: 'Navigate tracks (list) / rows (grid)',
  },
  { keys: ['←', '→', 'A', 'D'], action: 'Navigate columns (grid mode)' },
  { keys: ['Tab'], action: 'Next / previous track' },
  { keys: ['Home', 'End'], action: 'First / last track on page' },
  { keys: ['PgUp', 'PgDn'], action: 'Previous / next page' },
  { keys: ['Enter'], action: 'Play active track' },
  { keys: ['Space', 'K'], action: 'Play / pause' },
  { keys: ['J', 'L'], action: 'Seek −10s / +10s' },
  { keys: [',', '.'], action: 'Previous / next track (player)' },
  { keys: ['M'], action: 'Mute / unmute' },
  { keys: ['1', '…', '9'], action: 'Add to N-th playlist' },
  { keys: ['Backspace'], action: 'Unlike active track' },
  { keys: ['?'], action: 'Toggle this help' },
  { keys: ['Esc'], action: 'Close' },
]

export function KeyboardHelp({ open, onClose }: KeyboardHelpProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-md rounded-2xl border border-border bg-card shadow-xl',
          'animate-in slide-in-from-bottom-4 fade-in',
        )}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-serif text-lg font-medium text-foreground">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors outline-none"
          >
            <span className="i-lucide-x size-5" aria-hidden="true" />
          </button>
        </div>
        <ul className="p-5 space-y-3">
          {SHORTCUTS.map(({ keys, action }, i) => (
            <li key={i} className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{action}</span>
              <span className="flex items-center gap-1">
                {keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="px-2 py-1 text-[11px] font-mono leading-none bg-secondary border border-border rounded-md text-foreground"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

interface KeyboardHelpButtonProps {
  onClick: () => void
}

export function KeyboardHelpButton({ onClick }: KeyboardHelpButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Keyboard shortcuts (?)"
      aria-label="Show keyboard shortcuts"
      className="inline-flex items-center justify-center size-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors outline-none"
    >
      <span className="i-lucide-keyboard size-4" aria-hidden="true" />
    </button>
  )
}
