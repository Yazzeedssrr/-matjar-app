const CACHE='makhraj-prod-v1';
const SHELL=['./app.html','./manifest.webmanifest','./assets/makhraj-theme.css','./assets/makhraj-app.css','./assets/makhraj-config.js','./assets/makhraj-app.js'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)))});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const r=event.request;
  if(r.mode==='navigate'){
    event.respondWith(fetch(r,{cache:'no-store'}).catch(()=>caches.match('./app.html')));
    return;
  }
  event.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(resp=>{
    if(resp&&resp.ok&&new URL(r.url).origin===location.origin){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(r,copy));}
    return resp;
  })));
});