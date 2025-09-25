// ===== service-worker.js (bump cache) =====
const CACHE = 'mediclear-v9'; // ← 버전 올림
const ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/docter.html',
  '/mypage.html',
  '/style.css',
  '/app.js'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  const { request } = e;
  if (request.url.includes('/api/')) return; // API는 네트워크 우선
  e.respondWith(
    caches.match(request).then(cached=> cached || fetch(request).then(resp=>{
      const copy = resp.clone();
      caches.open(CACHE).then(c=>c.put(request, copy));
      return resp;
    }))
  );
});
