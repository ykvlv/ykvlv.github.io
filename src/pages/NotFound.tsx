import { Link } from 'react-router-dom'
import { Container } from '@/shared'

export default function NotFound() {
  return (
    <div className="py-12 sm:py-16">
      <Container>
        <h1 className="page-title">Not found</h1>
        <p className="mt-3 text-muted-foreground">
          There is no page at this address.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg text-primary hover:underline focusable"
        >
          <span className="i-lucide-arrow-left size-4" />
          Back home
        </Link>
      </Container>
    </div>
  )
}
