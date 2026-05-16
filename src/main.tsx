import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import '@/styles/globals.css'
import App from './App'

// Stale chunk: after a new deploy, old hashed JS files are gone. The SPA
// rewrite returns index.html for missing assets → wrong MIME → module error.
// Force reload once to pick up the fresh index.html and new chunk hashes.
function reloadOnceForStaleChunk() {
  if (sessionStorage.getItem('chunk-reload')) return
  sessionStorage.setItem('chunk-reload', '1')
  window.location.reload()
}

window.addEventListener(
  'error',
  (e) => {
    const el = e.target as HTMLElement | null
    const src = el?.getAttribute?.('src') ?? el?.getAttribute?.('href') ?? ''
    if (src.endsWith('.js') || src.endsWith('.css')) {
      reloadOnceForStaleChunk()
    }
  },
  true,
)

// Lazy route imports fail as Promise rejections, not script error events.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String((e.reason as { message?: string } | undefined)?.message ?? e.reason ?? '')
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Expected a JavaScript-or-Wasm module')
  ) {
    reloadOnceForStaleChunk()
  }
})

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

// Boot reached: clear gate so a later stale-chunk event can reload again.
window.addEventListener('load', () => {
  sessionStorage.removeItem('chunk-reload')
})
