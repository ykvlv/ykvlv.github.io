import { cn } from '@/lib/utils'
import { type HTMLAttributes } from 'react'

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
