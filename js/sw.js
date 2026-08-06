// Smart Attendance — Service Worker
// Bump this on every deploy that changes cached files, so old caches get cleared.
const CACHE_VERSION = 'v8';
const STATIC_CACHE = `smart-attendance-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `smart-attendance-runtime-${CACHE_VERSION}`;

// App shell: the actual pages, styles, scripts and images that make the app usable offline.
const APP_SHELL = [
    './',
    'index.html',
    'login.html',
    'register.html',
    'dashboard.html',
    'admin.html',
    'admin-register.html',
    'forgot-password.html',
    'manifest.json',
    'css/style.css',
    'js/firebase.js',
    'js/auth.js',
    'js/leave-holiday.js',
    'js/attendance.js',
    'js/admin.js',
    'images/icon-192.png',
    'images/icon-512.png',
    'images/icon-maskable-512.png',
    'offline.html'
];

// Requests to these hosts are live data (auth/Firestore) and must never be served from cache.
const NEVER_CACHE_HOSTS = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'www.googleapis.com'
];

// ===================================
// Install: precache the app shell
// ===================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
            .catch((err) => console.error('Service worker precache failed:', err))
    );
});

// ===================================
// Activate: clean up old cache versions
// ===================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys
                .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
                .map((key) => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

// ===================================
// Fetch: routing strategy
// ===================================
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle GET requests — never intercept POST/PUT (Firebase writes, etc.)
    if (request.method !== 'GET') return;

    // Live Firebase auth/data traffic always goes straight to the network, untouched.
    if (NEVER_CACHE_HOSTS.includes(url.hostname)) {
        return;
    }

    // HTML navigations: try the network first (so users get the latest page while
    // online), fall back to cache, then to the offline page if nothing is cached.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() =>
                    caches.match(request).then((cached) => cached || caches.match('offline.html'))
                )
        );
        return;
    }

    // Same-origin CSS/JS: stale-while-revalidate — serve instantly from cache if we
    // have it, and refresh the cache in the background so updates aren't stuck forever.
    if (url.origin === self.location.origin && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))) {
        event.respondWith(
            caches.open(STATIC_CACHE).then((cache) =>
                cache.match(request).then((cached) => {
                    const networkFetch = fetch(request)
                        .then((response) => {
                            cache.put(request, response.clone());
                            return response;
                        })
                        .catch(() => cached);
                    return cached || networkFetch;
                })
            )
        );
        return;
    }

    // Images, fonts, and other static assets (including cross-origin ones like
    // Font Awesome's CSS + webfont files from cdnjs): cache-first, since these
    // rarely change and are the most useful to have available offline.
    if (
        request.destination === 'image' ||
        request.destination === 'font' ||
        request.destination === 'style' ||
        url.hostname === 'cdnjs.cloudflare.com'
    ) {
        event.respondWith(
            caches.open(RUNTIME_CACHE).then((cache) =>
                cache.match(request).then((cached) => {
                    if (cached) return cached;
                    return fetch(request).then((response) => {
                        // Cache successful responses (including opaque cross-origin ones)
                        if (response.ok || response.type === 'opaque') {
                            cache.put(request, response.clone());
                        }
                        return response;
                    });
                })
            )
        );
        return;
    }

    // Everything else (e.g. the Firebase SDK modules from gstatic.com): network
    // first, falling back to cache if offline.
    event.respondWith(
        fetch(request)
            .then((response) => {
                const copy = response.clone();
                caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
                return response;
            })
            .catch(() => caches.match(request))
    );
});
