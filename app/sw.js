// Network first, cache fallback: the app opens offline and always prefers the newest files.
// A new version waits until the person taps Update (see offerUpdate in js/core.js), so nobody loses a half-filled form.
// Change V whenever any file below changes, so phones fetch the new set.
const V='dealpin-v69';
const FILES=['./','index.html','css/styles.css','css/app-shell.css','js/maintenance.js','js/push.js','js/app-shell.js','js/config.js','js/constants.js','js/monitor.js','js/store.js','js/input-validation.js','js/qr.js','js/i18n.js','js/trust.js','js/region.js','js/auth.js','js/supabase-store.js','js/supabase-mods.js','js/api.js','js/autopilot.js','js/core.js','js/seller.js','js/daily-command.js','js/public.js','js/mods-core.js','js/mods-ui.js','js/mods.js','js/router.js','manifest.webmanifest','icons/icon.svg','icons/icon-192.png','icons/icon-512.png'];
const SHELL=new Set(FILES.map(x=>new URL(x,self.location.href).href));   // only these files are ever cached: never API answers or user data
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(FILES))));
self.addEventListener('message',e=>{if(e.data==='skip')self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin||!SHELL.has(r.url))return;
  e.respondWith(fetch(r).then(res=>{if(res.ok&&res.type==='basic'){const c=res.clone();e.waitUntil(caches.open(V).then(x=>x.put(r,c)))}return res})
    .catch(()=>caches.match(r).then(m=>m||(r.mode==='navigate'?caches.match('index.html'):Response.error()))));
});
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch{d={title:'Dealpin',body:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(d.title||'Dealpin',{body:d.body||'',icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:d.tag||'dealpin',data:{url:d.url||'./#/activity'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus' in c){if(c.navigate)c.navigate(url);return c.focus()}}return clients.openWindow(url)}))});
