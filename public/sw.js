// Pulse service worker. Deliberately small: it never caches pages or health data (private, per user), only what
// is the same for everyone: the build's static files and the offline page. Also receives Web Push.
const CACHE = "pulse-static-v1"
const OFFLINE = "/offline.html"

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])))
})

// A new worker waits until the page says so (the "New version" toast), so a reload never swaps code mid-use.
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting()
})

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== "GET" || url.origin !== location.origin) return
  // Pages: always the network (signed-in, per user); only when it is unreachable, the offline page.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)))
    return
  }
  // Hashed build files never change: serve from cache, fill it on first use (fonts live here too).
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})

self.addEventListener("push", (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {}
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(d.title || "Pulse", {
        body: d.body || "",
        tag: d.tag,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: d.url || "/" },
      }),
      self.navigator.setAppBadge ? self.navigator.setAppBadge(1).catch(() => {}) : null,
    ]),
  )
})

self.addEventListener("notificationclick", (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || "/", location.origin).href
  e.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const open = all.find((c) => new URL(c.url).origin === location.origin)
      if (open) {
        await open.focus()
        if ("navigate" in open) await open.navigate(url)
      } else await self.clients.openWindow(url)
    })(),
  )
})
