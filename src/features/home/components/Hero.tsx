import { Container } from '@/shared'

export function Hero() {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl sm:text-5xl font-semibold tracking-tight text-foreground">
            Grigory Yakovlev
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Software engineer passionate about building elegant solutions. I
            mass produce bugs that the infrastructure team has to deal with
            later. I don't always test my code, but when I do, I do it in
            production.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <SocialLink
              href="https://github.com/ykvlv"
              icon="i-lucide-github"
              label="GitHub"
            />
            <SocialLink
              href="mailto:me@ykvlv.dev"
              icon="i-lucide-mail"
              label="Email"
            />
          </div>
        </div>
      </Container>
    </section>
  )
}

function SocialLink({
  href,
  icon,
  label,
  external = true,
}: {
  href: string
  icon: string
  label: string
  external?: boolean
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={label}
    >
      <span className={`${icon} size-5`} />
    </a>
  )
}
