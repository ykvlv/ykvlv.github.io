import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface ProjectCardProps {
  title: string
  description: string
  href: string
  icon?: string
  external?: boolean
}

export function ProjectCard({
  title,
  description,
  href,
  icon,
  external = false,
}: ProjectCardProps) {
  const cardClasses = cn(
    'group block p-6 rounded-2xl border border-border bg-card',
    'transition-all duration-200',
    'card-hover',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  )

  const content = (
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
          {title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>

      {icon && (
        <span
          className={cn(
            icon,
            'size-5 text-muted-foreground group-hover:text-primary transition-colors ml-4 flex-shrink-0',
          )}
        />
      )}

      {!icon && (
        <span
          className={cn(
            external ? 'i-lucide-external-link' : 'i-lucide-arrow-right',
            'size-4 text-muted-foreground group-hover:text-primary transition-colors ml-4 flex-shrink-0 opacity-0 group-hover:opacity-100',
          )}
        />
      )}
    </div>
  )

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cardClasses}
      >
        {content}
      </a>
    )
  }

  return (
    <Link to={href} className={cardClasses}>
      {content}
    </Link>
  )
}
