import { useState, useEffect } from 'react'

interface PWAState {
  isStandalone: boolean
  isInstallable: boolean
}

export function usePWA(): PWAState {
  const [state, setState] = useState<PWAState>({
    isStandalone: false,
    isInstallable: false,
  })

  useEffect(() => {
    // Check if running in standalone mode (PWA installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true

    setState((prev) => ({ ...prev, isStandalone }))

    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleChange = (e: MediaQueryListEvent) => {
      setState((prev) => ({ ...prev, isStandalone: e.matches }))
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return state
}
