/*
  ════════════════════════════════════════════════════════
  OurToolkit — Calculadora de Interés Compuesto
  Service Worker v1.0
  Estrategia: Cache First para assets, Network First para páginas
  ════════════════════════════════════════════════════════
*/

const CACHE_NAME = 'calculadora-interes-v2';
const CACHE_STATIC = 'calculadora-static-v2';

/* Archivos a cachear en la instalación */
const PRECACHE_URLS = [
  '/calculadora-interes/',
  '/calculadora-interes/es/',
  '/calculadora-interes/en/',
  '/calculadora-interes/pt/',
  '/calculadora-interes/fr/',
  '/calculadora-interes/manifest.json',
];

/* ── INSTALL — precachear recursos esenciales ──────────────────────────── */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS).catch(function (err) {
        /* Si algún recurso falla, no bloqueamos la instalación */
        console.warn('[SW] Precache parcial:', err);
      });
    }).then(function () {
      /* Activar inmediatamente sin esperar a que cierren otras pestañas */
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE — limpiar caches viejas ─────────────────────────────────── */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) {
            /* Borrar cualquier cache que no sea la versión actual */
            return name !== CACHE_NAME && name !== CACHE_STATIC;
          })
          .map(function (name) {
            return caches.delete(name);
          })
      );
    }).then(function () {
      /* Tomar control de todas las pestañas abiertas */
      return self.clients.claim();
    })
  );
});

/* ── FETCH — estrategia según tipo de recurso ─────────────────────────── */
self.addEventListener('fetch', function (event) {
  var request = event.request;
  var url = new URL(request.url);

  /* Solo manejar peticiones al mismo origen */
  /* Dejar pasar siempre las redes de anuncios sin interferir */
  var adDomains = ['highperformanceformat.com', 'effectivegatecpm.com',
                   'adsterra.com', 'a-ads.com', 'googlesyndication.com'];
  for (var i = 0; i < adDomains.length; i++) {
    if (url.hostname.indexOf(adDomains[i]) !== -1) return;
  }
  if (url.origin !== location.origin) return;

  /* Solo GET */
  if (request.method !== 'GET') return;

  /* Fuentes de Google — cache first, no caducan */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  /* Páginas HTML — Network First (siempre la versión más reciente) */
  /* con fallback a cache si no hay red */
  if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  /* Assets (CSS, JS, imágenes, iconos) — Cache First */
  if (
    url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|webp|ico|woff|woff2)$/)
  ) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  /* El resto — Network con fallback a cache */
  event.respondWith(networkFirstWithFallback(request));
});

/* ── Helpers ───────────────────────────────────────────────────────────── */

/* Cache First: busca en cache, si no hay va a la red y cachea */
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      });
    });
  });
}

/* Network First: intenta red, si falla usa cache */
function networkFirstWithFallback(request) {
  return fetch(request)
    .then(function (response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, clone);
        });
      }
      return response;
    })
    .catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) return cached;
        /* Fallback final: página raíz en español */
        return caches.match('/calculadora-interes/es/');
      });
    });
}

/* ── MENSAJE desde la app para forzar actualización ───────────────────── */
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
