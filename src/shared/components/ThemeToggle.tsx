import { useTheme, cn } from '@/shared'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    const next =
      theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
  }

  const icon =
    theme === 'light'
      ? 'i-lucide-sun'
      : theme === 'dark'
        ? 'i-lucide-moon'
        : 'i-lucide-sun-moon'

  const label =
    theme === 'light'
      ? 'Light theme (click for dark)'
      : theme === 'dark'
        ? 'Dark theme (click for auto)'
        : 'Auto theme (click for light)'

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        'p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      aria-label={label}
    >
      <span className={cn(icon, 'size-5 -translate-y-px')} />
    </button>
  )
}
