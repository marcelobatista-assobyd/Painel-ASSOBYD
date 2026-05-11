/**
 * ══════════════════════════════════════════════════════════════
 *  Service Worker — Painel Executivo ASSOBYD / BYD
 *  Estratégia: Cache-first para assets, Network-first para dados
 *  v1.0
 * ══════════════════════════════════════════════════════════════
 */

const CACHE_NAME   = 'assobyd-byd-v1';
const OFFLINE_URL  = './index.html';

// Assets essenciais para funcionamento offline
const PRECACHE = [
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
];

// ── INSTALL: pré-cacheia arquivos essenciais ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pré-cacheando assets...');
      // Cacheia cada asset individualmente (ignora erros de CDN offline)
      return Promise.allSettled(
        PRECACHE.map(url => cache.add(url).catch(e => console.warn('[SW] Não cacheou:', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpa caches antigos ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Removendo cache antigo:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: estratégia híbrida ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase/APIs: sempre rede (dados em tempo real)
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('firebaseio')) {
    event.respondWith(fetch(request));
    return;
  }

  // index.html: network-first com fallback para cache
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Atualiza cache com versão mais recente
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // CDN (Chart.js, etc.): cache-first
  if (url.hostname !== location.hostname) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Default: stale-while-revalidate
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        caches.open(CACHE_NAME).then(c => c.put(request, response.clone()));
        return response;
      });
      return cached || network;
    })
  );
});

// ── BACKGROUND SYNC (futuro) ──────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
