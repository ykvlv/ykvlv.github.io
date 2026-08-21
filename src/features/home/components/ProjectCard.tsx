import { Link } from 'react-router-dom'
import { cn } from '@/shared'

interface ProjectCardProps {
  title: string
  description: string
  href: string
  icon: string
}

export function ProjectCard({
  title,
  description,
  href,
  icon,
}: ProjectCardProps) {
  return (
    <Link to={href} className="group block p-6 card-interactive">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>

        <span
          className={cn(
            icon,
            'size-5 text-muted-foreground group-hover:text-primary transition-colors ml-4 flex-shrink-0',
          )}
        />
      </div>
    </Link>
  )
}
