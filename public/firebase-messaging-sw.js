/* eslint-disable no-undef */
// Firebase Messaging Service Worker
// Full implementation will be completed in Phase 12 alongside the rest of the PWA setup.
// This stub is required for FCM token registration to succeed in the browser.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

// Firebase config is injected at build time via Phase 12 PWA setup.
// Until then, the SW is registered but will not handle background messages.
