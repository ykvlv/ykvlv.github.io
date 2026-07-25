import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/lora/wght.css'

import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
