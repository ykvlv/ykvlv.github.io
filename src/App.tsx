import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'

// Eager load Home (always needed)
import Home from '@/pages/Home'

// Lazy load other pages (separate chunks)
const Watchlog = lazy(() => import('@/pages/Watchlog'))

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-muted">Loading...</div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter basename="/">
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route
            path="/watchlog"
            element={
              <Suspense fallback={<Loading />}>
                <Watchlog />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
