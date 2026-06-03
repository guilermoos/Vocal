const CACHE_NAME = 'vocal-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './style.css',
  './css/variables.css',
  './css/base.css',
  './css/card.css',
  './css/buttons.css',
  './css/inputs.css',
  './css/call.css',
  './js/main.js',
  './js/state.js',
  './js/dom.js',
  './js/audio.js',
  './js/utils.js',
  './js/peer-manager.js'
];

// Instalação do Service Worker e cacheamento dos recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Cacheando recursos estáticos locais...');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação do Service Worker e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Limpando cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia Cache First apenas para arquivos locais do mesmo domínio
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // Ignorar requisições que não sejam GET ou sejam de origens externas (ex: PeerJS CDN, Google Fonts)
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cacheia novas respostas válidas do mesmo domínio dinamicamente
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
