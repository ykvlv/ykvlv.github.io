import { Link, NavLink } from 'react-router-dom'
import { Container, ThemeToggle, cn } from '@/shared'
import * as React from 'react'

export function Header() {
  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-background/80 backdrop-blur-md">
      <Container className="h-full flex items-center justify-between">
        <Link
          to="/"
          className="font-serif text-xl font-semibold text-foreground hover:text-primary transition-colors"
        >
          ykvlv
        </Link>

        <nav className="flex items-center gap-1" aria-label="Main navigation">
          <NavItem to="/watchlog">Watchlog</NavItem>
          <NavItem to="/playlists">Playlists</NavItem>
          <ThemeToggle className="ml-2" />
        </nav>
      </Container>
    </header>
  )
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'px-3 py-2.5 text-sm font-medium rounded-xl transition-colors',
          'hover:bg-secondary hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive ? 'text-foreground bg-secondary' : 'text-muted-foreground',
        )
      }
    >
      {children}
    </NavLink>
  )
}
