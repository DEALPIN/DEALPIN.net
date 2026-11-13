/* Push notifications for sellers. Setup: see app/supabase/PUSH-SETUP.md.
   Paste the PUBLIC key from `npx web-push generate-vapid-keys` below. The private key never goes in the app. */
const VAPID_PUBLIC_KEY='BMtvVhFJY9ifiG28g8cCq2XT0qRUYVLFVGlAHpO4G3w595sE45WHh0uHv-tX5MZnQbTSjzwmEddvJ235uV-Jhpw';
const pushSupported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const b64ToU8=s=>{const p='='.repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))};
async function pushState(){
  if(!pushSupported())return 'unsupported';
  if(!VAPID_PUBLIC_KEY)return 'notset';
  if(Notification.permission==='denied')return 'denied';
  const reg=await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription())?'on':'off';
}
async function enablePush(){
  if(!VAPID_PUBLIC_KEY)throw new Error('Notifications are not set up on this server yet.');
  const perm=await Notification.requestPermission();
  if(perm!=='granted')throw new Error('Notifications are blocked. Allow them in your browser or phone settings.');
  const reg=await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToU8(VAPID_PUBLIC_KEY)});
  const j=sub.toJSON();
  await Store.savePushSubscription({endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth});
}
async function disablePush(){
  const reg=await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.getSubscription();
  if(sub){await Store.deletePushSubscription(sub.endpoint);await sub.unsubscribe()}
}
async function pushCard(){
  const st=await pushState().catch(()=>'unsupported');
  const msg={unsupported:'This browser cannot show notifications. On iPhone, add Dealpin to your Home Screen first.',notset:'Notifications are not set up on this server yet.',denied:'Notifications are blocked. Allow them in your browser or phone settings.',on:'Notifications are on for this device.',off:'Get a message when a buyer agrees, ships, confirms or raises a dispute on a deal.'}[st]||'';
  return `<section class="card" id="push-card"><h2>Notifications</h2><p class="help">${esc(msg)}</p>${st==='off'?'<button class="btn" id="push-on" type="button">Turn on notifications</button>':st==='on'?'<button class="btn ghost" id="push-off" type="button">Turn off on this device</button>':''}</section>`;
}
async function fillPushSlot(){
  const slot=$('#push-slot');if(!slot)return;
  slot.outerHTML=await pushCard();
  on('#push-on',async()=>{try{await enablePush();note('Notifications are on');Settings()}catch(e){note(e.message)}});
  on('#push-off',async()=>{try{await disablePush();note('Notifications are off on this device');Settings()}catch(e){note(e.message)}});
}
