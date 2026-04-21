import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { ErrorBoundary } from '@/shared'
import Home from '@/pages/Home'
import Watchlog from '@/pages/Watchlog'
import Playlists from '@/pages/Playlists'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/watchlog" element={<Watchlog />} />
            <Route path="/playlists" element={<Playlists />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
