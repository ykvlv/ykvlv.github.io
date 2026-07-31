import { Container } from '@/shared'
import { Hero, ProjectCard } from '@/features/home'

export default function Home() {
  return (
    <>
      <Hero />

      <section className="pb-16 sm:pb-24">
        <Container>
          <h2 className="section-heading mb-8">Projects</h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ProjectCard
              title="Watchlog"
              description="Track what I'm watching. Movies, TV shows, and upcoming releases synced from Trakt."
              href="/watchlog"
              icon="i-lucide-film"
            />
            <ProjectCard
              title="Whatsnext"
              description="What's on in Saint Petersburg. Events distilled from Telegram channels by an LLM."
              href="/whatsnext"
              icon="i-lucide-calendar"
            />
          </div>
        </Container>
      </section>
    </>
  )
}
