const CACHE_NAME = 'planr-v6'

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pin.html',
  '/app.html',
  '/css/style.css',
  '/js/app.js',
  '/js/supabase.js',
  '/js/pin.js',
  '/js/panel.js',
  '/js/workspaces.js',
  '/js/folders.js',
  '/js/tasks.js',
  '/js/notes.js',
  '/js/calendar.js',
  '/js/habits.js',
  '/js/events.js',
  '/js/settings.js',
  '/manifest.json'
]

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('Some assets failed to cache:', err)
      })
    })
  )
  self.skipWaiting()
})

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch — network first, fall back to cache
self.addEventListener('fetch', event => {
  // Skip non-GET and Supabase API requests (always need live data)
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('supabase.co')) return
  if (event.request.url.includes('functions/v1')) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(event.request)
      })
  )
})
self.addEventListener('push', event => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      tag: data.tag,
      vibrate: [200, 100, 200]
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) return clientList[0].focus()
      return clients.openWindow('/app.html')
    })
  )
})