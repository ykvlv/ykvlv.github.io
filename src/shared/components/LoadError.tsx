/** Shown in place of the page content when its data failed to load. */
export function LoadError({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <span className="i-lucide-alert-circle size-12 text-destructive mx-auto mb-4" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  )
}
