/* Cache only this app's public shell. Never clear IndexedDB, localStorage, or other apps' caches. */
const SCOPE=new URL(self.registration.scope);
const PREFIX='makhraj-shell-'+encodeURIComponent(SCOPE.pathname)+'-';
const CACHE=PREFIX+'20260920-safety2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname))return;
 const relative=url.pathname.slice(SCOPE.pathname.length);
 if(!/^(app\.html|seller\.html|manifest\.webmanifest|assets\/[A-Za-z0-9._/-]+\.(js|css|png|jpg|webp|svg))$/.test(relative))return;
 const key=new Request(new URL(relative,SCOPE).href);
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   const response=await fetch(request,{cache:'no-store'});
   if(response.ok&&response.type!=='opaque')await cache.put(key,response.clone());
   return response;
  }catch{
   const saved=await cache.match(key);
   if(saved)return saved;
   return new Response('Offline. Reconnect to load this page.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
 })());
});
