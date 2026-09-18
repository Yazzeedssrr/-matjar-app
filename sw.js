const CACHE='makhraj-prod-v4';
const SHELL=[
  './app.html','./manifest.webmanifest','./assets/makhraj-theme.css','./assets/makhraj-app.css',
  './assets/makhraj-config.js','./assets/makhraj-app.js','./assets/makhraj-need.js','./assets/makhraj-bundles.js'
];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)))});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const r=event.request;
  const same=new URL(r.url).origin===location.origin;
  if(r.mode==='navigate'){
    event.respondWith(fetch(r,{cache:'no-store'}).then(resp=>{if(resp?.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(r,copy))}return resp}).catch(()=>caches.match(r).then(x=>x||caches.match('./app.html'))));
    return;
  }
  if(same){
    event.respondWith(fetch(r,{cache:'no-store'}).then(resp=>{if(resp?.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(r,copy))}return resp}).catch(()=>caches.match(r)));
  }
});