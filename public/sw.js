// Service Worker untuk SalesFlow PWA
const CACHE_NAME = 'salesflow-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/logo.png',
    '/js/config.js',
    '/js/utils.js',
    '/js/ui.js',
    '/js/auth.js',
    '/js/data.js',
    '/js/admin.js',
    '/css/variables.css',
    '/css/base.css',
    '/css/components.css',
    '/css/table.css',
    '/css/admin.css',
    '/css/responsive.css'
];

// Install event - cache files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache opened');
                return cache.addAll(urlsToCache);
            })
            .catch(err => {
                console.log('Cache failed:', err);
            })
    );
    self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip Firebase and external URLs
    if (event.request.url.includes('firebaseio.com') ||
        event.request.url.includes('googleapis.com') ||
        event.request.url.includes('gstatic.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version or fetch from network
                if (response) {
                    return response;
                }
                return fetch(event.request).then(response => {
                    // Don't cache non-successful responses
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    // Clone and cache the response
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                    return response;
                });
            })
            .catch(() => {
                // Fallback for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            })
    );
});
