import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/shared'
import {
  ToastContext,
  type ToastVariant,
  type ToastContextValue,
} from '../hooks/useToasts'

interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  )

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const pushToast = useCallback(
    (message: string, variant: ToastVariant = 'error') => {
      const id = ++idRef.current
      setToasts((prev) => {
        const next = [...prev, { id, message, variant }]
        return next.length > MAX_TOASTS
          ? next.slice(next.length - MAX_TOASTS)
          : next
      })
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
      timersRef.current.set(id, timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ pushToast }), [pushToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

interface ToastStackProps {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onDismiss: (id: number) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const variantClass =
    toast.variant === 'error'
      ? 'border-destructive/40 bg-card text-foreground'
      : toast.variant === 'success'
        ? 'border-success/40 bg-card text-foreground'
        : 'border-border bg-card text-foreground'

  const icon =
    toast.variant === 'error'
      ? 'i-lucide-alert-circle text-destructive'
      : toast.variant === 'success'
        ? 'i-lucide-check-circle text-success'
        : 'i-lucide-info text-primary'

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 pl-3 pr-1.5 py-2 rounded-xl border shadow-lg shadow-black/10',
        'animate-in fade-in slide-in-from-top-4',
        variantClass,
      )}
      role={toast.variant === 'error' ? 'alert' : 'status'}
    >
      <span className={cn(icon, 'size-4 shrink-0')} aria-hidden="true" />
      <p className="text-sm flex-1 leading-snug break-words">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className={cn(
          'shrink-0 inline-flex items-center justify-center size-7 rounded-lg',
          'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
          'outline-none transition-colors',
        )}
        aria-label="Dismiss"
      >
        <span className="i-lucide-x size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
