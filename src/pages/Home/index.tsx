import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-16">
      <section className="text-center mb-16">
        <h1 className="text-4xl font-bold mb-4">ykvlv</h1>
        <p className="text-muted text-lg">Software Engineer</p>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <Link
          to="/watchlog"
          className="group block p-6 rounded-lg border border-foreground/10 hover:border-watchlog-primary/50 transition-colors"
        >
          <h2 className="text-xl font-semibold mb-2 group-hover:text-watchlog-primary transition-colors">
            Watchlog
          </h2>
          <p className="text-muted text-sm">
            Movie and TV show watch history from Trakt
          </p>
        </Link>
      </section>
    </div>
  )
}
