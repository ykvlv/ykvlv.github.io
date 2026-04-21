import { createContext, useContext } from 'react'

export type ToastVariant = 'error' | 'success' | 'info'

export interface ToastContextValue {
  pushToast: (message: string, variant?: ToastVariant) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToasts must be used inside ToastProvider')
  }
  return ctx
}
