/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyBP-vHBVpmyGQ0bKGpTOT6P1p_OdDpN4w4',
  authDomain: 'journal-manna.firebaseapp.com',
  projectId: 'journal-manna',
  storageBucket: 'journal-manna.firebasestorage.app',
  messagingSenderId: '630795114735',
  appId: '1:630795114735:web:9cd0b235a1fea1dae6631a',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title
  if (!title) return
  self.registration.showNotification(title, {
    body: payload.data?.body ?? '',
    icon: payload.data?.icon ?? '/icons/web-app-manifest-192x192.png',
    badge: '/icons/favicon-96x96.png',
    data: { link: payload.data?.link ?? '/' },
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = event.notification.data?.link ?? '/'
  event.waitUntil(clients.openWindow(link))
})
