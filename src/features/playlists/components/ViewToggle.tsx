import { memo } from 'react'
import { cn } from '@/shared'

export type ViewMode = 'compact' | 'cards'

interface ViewToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}

export const ViewToggle = memo(function ViewToggle({
  value,
  onChange,
}: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex items-center rounded-xl border border-border bg-card p-1"
    >
      <ToggleButton
        active={value === 'compact'}
        onClick={() => onChange('compact')}
        icon="i-lucide-list"
        label="Compact rows"
      />
      <ToggleButton
        active={value === 'cards'}
        onClick={() => onChange('cards')}
        icon="i-lucide-grid-2x2"
        label="Cards"
      />
    </div>
  )
})

interface ToggleButtonProps {
  active: boolean
  onClick: () => void
  icon: string
  label: string
}

function ToggleButton({ active, onClick, icon, label }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex items-center justify-center size-8 rounded-lg transition-colors outline-none',
        active
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
      )}
    >
      <span className={cn(icon, 'size-4')} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  )
}
