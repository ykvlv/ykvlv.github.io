import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { usePWA } from '@/hooks/usePWA'

export function AppLayout() {
  const { isStandalone } = usePWA()
  const location = useLocation()
  const navigate = useNavigate()

  const isHome = location.pathname === '/'
  const showBackButton = isStandalone && !isHome

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-foreground/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          {showBackButton ? (
            <button
              onClick={() => navigate(-1)}
              className="text-sm font-medium hover:text-accent transition-colors"
            >
              ← Назад
            </button>
          ) : (
            <Link
              to="/"
              className="text-lg font-bold hover:text-accent transition-colors"
            >
              ykvlv
            </Link>
          )}

          <nav className="flex items-center gap-4">
            <Link
              to="/watchlog"
              className="text-sm font-medium hover:text-accent transition-colors"
            >
              Watchlog
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
