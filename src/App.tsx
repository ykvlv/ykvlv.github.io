import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Skeleton } from '@/components/ui/skeleton'
import Home from '@/pages/Home'

const Watchlog = lazy(() => import('@/pages/Watchlog'))

function PageLoader() {
  return (
    <div className="py-12 sm:py-16 px-4">
      <div className="container-main">
        <Skeleton className="h-10 w-48 mb-4" />
        <Skeleton className="h-6 w-96 mb-8" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route
              path="/watchlog"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Watchlog />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
