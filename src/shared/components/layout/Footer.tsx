import { Container } from './Container'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border py-8 mt-auto">
      <Container>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; {currentYear} ykvlv</p>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/ykvlv"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <span className="i-lucide-github size-5" />
            </a>
          </div>
        </div>
      </Container>
    </footer>
  )
}
