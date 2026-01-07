import { Outlet } from 'react-router-dom'
import { Header, Footer } from '@/shared'

export function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
