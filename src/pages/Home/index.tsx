import { Container } from '@/components/layout/Container'
import { Hero } from '@/components/home/Hero'
import { ProjectCard } from '@/components/home/ProjectCard'

export default function Home() {
  return (
    <>
      <Hero />

      <section className="pb-16 sm:pb-24">
        <Container>
          <h2 className="font-serif text-2xl font-medium text-foreground mb-8">
            Projects
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ProjectCard
              title="Watchlog"
              description="Track what I'm watching. Movies, TV shows, and upcoming releases synced from Trakt."
              href="/watchlog"
              icon="i-lucide-film"
            />
          </div>
        </Container>
      </section>
    </>
  )
}
