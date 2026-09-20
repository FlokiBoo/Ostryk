const CACHE = 'ostryk-v5'

// Installation : cache les pages essentielles
self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(['/']))
  )
})

// Activation : supprime les anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // On ne touche jamais aux écritures (POST/PATCH/DELETE...)
  if (event.request.method !== 'GET') return

  // Appels Supabase (données) — jamais interceptés, toujours en direct
  if (url.hostname.includes('supabase.co')) return

  // Requêtes internes de routage Next.js (prefetch + navigation client-side d'un <Link>) —
  // jamais interceptées : ce sont des payloads RSC (pas du HTML ni un asset), mis en cache par URL
  // ici ils cassaient la navigation — un clic sur un lien juste préfetché (ex: résultat de
  // recherche) resservait le prefetch en cache au lieu d'aller chercher la vraie page, faisant
  // échouer le chargement (fixé par un reload, qui passe par la branche "navigate" ci-dessous).
  if (url.searchParams.has('_rsc') || event.request.headers.has('rsc') || event.request.headers.has('next-router-prefetch')) return

  // Pages HTML (navigation) — Network first, cache en fallback (permet l'ouverture hors ligne)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put(event.request, copy))
          return response
        })
        .catch(() => caches.match(event.request).then(cached =>
          // Repli sur "/" uniquement pour "/" lui-même : le resservir à la place de n'importe
          // quelle autre page affichait le dashboard sous l'URL demandée (ex: /programs/...),
          // ce qui ressemblait à une redirection intempestive. Sinon, vraie erreur réseau.
          cached || (url.pathname === '/' ? caches.match('/') : Response.error())
        ))
    )
    return
  }

  // Données API (ex: /api/athlete-view) — toujours fraîches en priorité,
  // le cache ne sert que de secours si le réseau tombe en cours de session
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then(cache => cache.put(event.request, copy))
          }
          return response
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Assets statiques (JS, CSS, images) — Cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put(event.request, copy))
        }
        return response
      })
    })
  )
})
