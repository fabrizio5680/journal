import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import '@/styles/globals.css'
import App from './App'

const canonicalAuthHost = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
if (
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  window.location.hostname.endsWith('.web.app') &&
  canonicalAuthHost.endsWith('.firebaseapp.com')
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
