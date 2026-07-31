import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Container } from './Container'
import { ThemeToggle } from '../ThemeToggle'
import { cn } from '../../lib/utils'

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
          <NavItem to="/whatsnext">Whatsnext</NavItem>
          <ThemeToggle className="ml-2" />
        </nav>
      </Container>
    </header>
  )
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'px-3 py-2.5 text-sm font-medium rounded-xl transition-colors',
          'hover:bg-secondary hover:text-foreground',
          'focusable',
          isActive ? 'text-foreground bg-secondary' : 'text-muted-foreground',
        )
      }
    >
      {children}
    </NavLink>
  )
}
