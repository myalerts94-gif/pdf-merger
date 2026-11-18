const CACHE_NAME = 'pdf-merger-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function openShareDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pdf-merger-share-db', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('shared-files')) {
        db.createObjectStore('shared-files', { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSharedFiles(files) {
  const db = await openShareDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shared-files', 'readwrite');
    const store = tx.objectStore('shared-files');
    for (const file of files) {
      store.add({
        name: file.name || 'shared_image.jpg',
        type: file.type || 'image/jpeg',
        lastModified: file.lastModified || Date.now(),
        blob: file
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept Android Share Target POST locally (0 bytes leave the phone)
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-receiver')) {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const files = formData.getAll('images').filter((f) => f && f.size > 0);
        if (files.length > 0) {
          await saveSharedFiles(files);
        }
      } catch (err) {
        console.error('Share receiver error:', err);
      }
      const redirectUrl = new URL('./index.html?shared=1', self.registration.scope).href;
      return Response.redirect(redirectUrl, 303);
    })());
    return;
  }

  // Serve app files offline from cache
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).catch(() => caches.match('./index.html'));
      })
    );
  }
});
