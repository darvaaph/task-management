// TaskFlow service worker: makes the app open offline. All data lives in localStorage,
// so caching the app shell is enough for the whole app to work without a connection.
// Bump VERSION when the caching rules change; built assets are hashed, so they don't need it.
const VERSION = 'v3'
const SHELL = `taskflow-shell-${VERSION}`
const ASSETS = `taskflow-assets-${VERSION}`
const PRECACHE = ['/', '/manifest.webmanifest', '/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png']

// The built JS/CSS names are hashed, so read them from the page itself; otherwise the very
// first visit would only become usable offline after a second one.
async function precache() {
  const shell = await caches.open(SHELL)
  await shell.addAll(PRECACHE)
  const html = await (await shell.match('/')).text()
  const built = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1])
  await (await caches.open(ASSETS)).addAll(built)
}

self.addEventListener('install', e => {
  e.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== ASSETS).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const sameOrigin = url.origin === self.location.origin

  // Pages: network first so a new deploy shows up at once; the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put('/', copy)); return res })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Hashed build files, icons and fonts never change under the same URL: cache first.
  if ((sameOrigin && !url.pathname.startsWith('/@')) || FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      // ignoreVary: module scripts are fetched with an Origin header, the precached copies without one.
      caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(ASSETS).then(c => c.put(req, copy)) }
        return res
      })),
    )
  }
})

// Tapping a reminder: hand the task id to an open TaskFlow window, or open one that shows it.
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const taskId = e.notification.data?.taskId
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list[0]
    if (win) { win.postMessage({ taskId }); return win.focus() }
    return self.clients.openWindow(taskId ? '/?task=' + encodeURIComponent(taskId) : '/')
  }))
})
