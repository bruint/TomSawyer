/* App-shell caching only. Authenticated API responses and photos never enter CacheStorage. */
const CACHE = 'tomsawyer-shell-v1';
const PRECACHE = /* PRECACHE */ ['/', '/offline.html', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k.startsWith('tomsawyer-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put('/',copy));}return response;}).catch(async()=>await caches.match('/')||await caches.match('/offline.html')));
  } else if(url.pathname.startsWith('/assets/')||url.pathname.startsWith('/icons/')||url.pathname==='/icon.svg') {
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return response;})));
  }
});
self.addEventListener('push',event=>{
  let data={title:'TomSawyer',body:'A little reminder for your family.',url:'/'};
  try{if(event.data)data={...data,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:data.tag||'tomsawyer',data:{url:data.url||'/'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  let url=new URL(event.notification.data?.url||'/',self.location.origin);
  if(url.origin!==self.location.origin)url=new URL('/',self.location.origin);
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{for(const client of clients){if('focus' in client){await client.navigate(url.href);return client.focus();}}return self.clients.openWindow(url.href);}));
});
