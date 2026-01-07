import { cn } from '@/shared'
import { type HTMLAttributes } from 'react'

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-muted', className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
