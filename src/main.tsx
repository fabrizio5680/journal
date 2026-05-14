import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import '@/styles/globals.css'
import App from './App'

// Stale chunk: after a new deploy, old hashed JS files are gone. The SPA
// rewrite returns index.html for missing assets → wrong MIME → module error.
// Force reload once to pick up the fresh index.html and new chunk hashes.
window.addEventListener(
  'error',
  (e) => {
    const src = (e.target as HTMLElement | null)?.getAttribute?.('src') ?? ''
    if (src.endsWith('.js') || src.endsWith('.css')) {
      const reloaded = sessionStorage.getItem('chunk-reload')
      if (!reloaded) {
        sessionStorage.setItem('chunk-reload', '1')
        window.location.reload()
      }
    }
  },
  true,
)

const canonicalAuthHost = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
if (
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  window.location.hostname !== canonicalAuthHost
) {
  const targetUrl = `${window.location.protocol}//${canonicalAuthHost}${window.location.pathname}${window.location.search}${window.location.hash}`
  if (targetUrl !== window.location.href) {
    window.location.replace(targetUrl)
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
