/* Shared helpers: DOM, theme, dialogs, notices, media, payment and rating boxes, offline outbox, install and update prompts. */
const app=document.getElementById('app');
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const on=(s,fn)=>{const e=$(s);if(e)e.onclick=fn};
/* Click handler for actions that wait on the network: the button is disabled until it finishes, so a double tap cannot act twice. */
const tap=(s,fn)=>{const e=$(s);if(!e)return;e.onclick=async ev=>{if(e.disabled)return;e.disabled=true;try{await fn(ev)}catch(x){fail(x)}finally{if(e.isConnected)e.disabled=false}}};
/* Same for a form: its buttons are locked while the submit runs. */
const submit=(s,fn)=>{const f=$(s);if(!f)return;f.onsubmit=async ev=>{ev.preventDefault();if(f.dataset.busy)return;f.dataset.busy='1';
  const els=$$('button',f).filter(x=>!x.disabled);els.forEach(x=>x.disabled=true);
  try{await fn(ev)}catch(x){fail(x)}finally{delete f.dataset.busy;els.forEach(x=>{if(x.isConnected)x.disabled=false})}}};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const VERSION='1.2.1';
const THEME_KEY='dealpin.theme';
function currentTheme(){try{return localStorage.getItem(THEME_KEY)||'system'}catch{return'system'}}
function applyTheme(value=currentTheme()){const t=['system','light','dark'].includes(value)?value:'system';document.documentElement.dataset.theme=t;try{localStorage.setItem(THEME_KEY,t)}catch{}
  const b=$('#theme-toggle');if(b){b.setAttribute('aria-label',`Colour theme: ${t}. Activate to change.`);b.title=`Colour theme: ${t}`;b.dataset.mode=t}
  const m=$('meta[name=theme-color]');if(m)m.content=t==='dark'||(t==='system'&&matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'#000000':'#F7F8F7';return t}
function cycleTheme(){const a=['system','light','dark'],n=a[(a.indexOf(currentTheme())+1)%a.length];applyTheme(n);note(`Theme: ${n}`)}
applyTheme();
const ic=n=>`<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const STATUS={created:'Waiting for buyer',agreed:'Ready to ship',shipped:'On the way',received:'Verified',disputed:'Disputed',cancelled:'Cancelled',resolved:'Resolved'};
const STEP={created:'Deal created',agreed:'Buyer agreed and shared a location',shipped:'Seller shipped the item',received:'Buyer confirmed receipt',disputed:'Buyer reported a problem',cancelled:'Deal cancelled',paid:'Buyer recorded a payment',payok:'Seller confirmed payment',arrived:'Rider arrived at the pin',rated:'Buyer left a rating',handover:'Rider confirmed the handover code',replied:'Seller replied to the problem',resolved:'Problem marked as resolved'};
const chip=s=>`<span class="chip ${esc(s)}">${esc(STATUS[s]||s)}</span>`;
const steps=d=>`<ol class="tl">${(d.events||[]).map(e=>`<li>${esc(STEP[e.s]||e.s)}<small>${when(e.at)}</small></li>`).join('')}</ol>`;
const stars=n=>{n=Math.min(5,Math.max(0,Math.round(+n)||0));return '★'.repeat(n)+'☆'.repeat(5-n)};
/* The currency a deal was priced in. Deals saved before currencies were stored use the device currency. */
const cur=d=>(d&&d.currency)||REGION.currency;
const price=d=>money(d.price,cur(d));
/* Files: a data address (this device) or a storage path (online). Anything else is dropped, so a stored value can never point somewhere else. */
const mediaUrl=x=>{x=String(x||'');if(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(x)||/^data:audio\/(?:webm|ogg|mp4);base64,[A-Za-z0-9+/]+=*$/.test(x))return x;
  if(DEALPIN.url&&/^[sb]\/[0-9a-f-]{32,64}\/[0-9a-f]{32}\.(jpg|png|webp|webm|ogg|m4a)$/.test(x))return DEALPIN.url+'/storage/v1/object/public/deal-media/'+x;return''};
const link=(p,id)=>`${location.origin}${location.pathname}#/${p}/${id}`;
const slug=s=>String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,24).replace(/-+$/,'')||'seller';
const mode=d=>d.delivery===DELIVERY[1]?'pickup':d.delivery===DELIVERY[2]?'courier':'rider';
const storeWarn=()=>{if(DEALPIN.mode==='supabase')return'';let n=0;try{n=(localStorage.getItem('dealpin.v1')||'').length}catch{}return n>3.5e6?'<div class="card warn"><p><b>Storage is nearly full.</b> Download your data in Settings and delete old deals before adding more photos.</p></div>':''};
const go=p=>{location.hash='#'+p};

/* Draws a screen. A refresh from watch() keeps the scroll position and does nothing when the screen would not change
   (so a playing voice note is not cut off). A new screen starts at the top. */
let lastHtml='',lastRoute='';
const view=h=>{
  const route=location.hash;
  if(softRender&&h===lastHtml&&route===lastRoute)return;
  const y=window.scrollY,keep=softRender&&route===lastRoute;
  app.innerHTML=h;lastHtml=h;lastRoute=route;
  if(typeof translateUi==='function')translateUi(document.body);
  window.scrollTo(0,keep?y:0);
  const l=$('#lg');if(l)l.onchange=()=>setLang(l.value)};
const missing=(m,back=true)=>view(`<div class="empty"><h1>Not found</h1><p>${m}</p>${back&&!document.body.classList.contains('bare')?'<a class="btn" href="#/">Go to my deals</a>':''}</div>`);
function note(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(note.t);note.t=setTimeout(()=>t.classList.remove('show'),3600)}
const fail=e=>note(e&&e.message?e.message:'Something went wrong. Try again.');
/* Marks a field as wrong, says why next to it and moves focus there. Always returns false. */
function bad(sel,msg){
  const e=typeof sel==='string'?$(sel):sel;if(!e){note(msg);return false}
  $$('.err',e.closest('.field')||document).forEach(x=>x.remove());
  const p=document.createElement('p');p.className='err';p.setAttribute('role','alert');p.textContent=msg;
  (e.closest('.field')||e.parentNode).appendChild(p);e.setAttribute('aria-invalid','true');e.focus();
  e.addEventListener('input',()=>{e.removeAttribute('aria-invalid');p.remove()},{once:true});return false}

/* Confirmation and one-line input as an accessible dialog (replaces the browser's confirm and prompt boxes).
   ask({title,body,ok,cancel,danger}) resolves true or false. With input:{label,max,value,readonly} it resolves the text, or null. */
function ask(o){return new Promise(res=>{
  if(!window.HTMLDialogElement||typeof HTMLDialogElement.prototype.showModal!=='function'){res(o.input?(o.input.readonly?(prompt(o.title,o.input.value||''),null):prompt(o.title)):confirm(o.title+(o.body?'\n'+o.body:'')));return}
  const d=document.createElement('dialog');d.className='modal';d.setAttribute('aria-labelledby','mt');
  d.innerHTML=`<form novalidate><h2 id="mt">${esc(o.title)}</h2>${o.body?`<p>${esc(o.body)}</p>`:''}${o.input?`<div class="field"><label for="mi">${esc(o.input.label)}</label><input id="mi" autocomplete="off" maxlength="${+o.input.max||200}" value="${esc(o.input.value||'')}"${o.input.readonly?' readonly':''}></div>`:''}<div class="actions"><button class="btn${o.danger?' danger':''}" id="mok">${esc(o.ok||'OK')}</button>${o.cancel===false?'':`<button type="button" class="btn ghost" id="mno">${esc(o.cancel||'Cancel')}</button>`}</div></form>`;
  document.body.appendChild(d);
  const done=v=>{d.close();d.remove();res(v)};
  $('form',d).onsubmit=e=>{e.preventDefault();done(o.input?$('#mi',d).value.trim():true)};
  const no=$('#mno',d);if(no)no.onclick=()=>done(o.input?null:false);
  d.addEventListener('cancel',e=>{e.preventDefault();done(o.input?null:false)});
  d.showModal();
  const inp=$('#mi',d);if(inp){inp.focus();if(o.input.readonly)inp.select()}else(o.danger&&no?no:$('#mok',d)).focus()})}
/* Copies text. If the browser blocks the clipboard the link is shown in a dialog so it can be copied by hand. */
async function copy(t,what='Link'){
  try{await navigator.clipboard.writeText(t);note(what+' copied')}
  catch{try{const a=document.createElement('textarea');a.value=t;a.setAttribute('readonly','');a.className='sr-only';document.body.appendChild(a);a.select();const ok=document.execCommand('copy');a.remove();if(!ok)throw 0;note(what+' copied')}
    catch{await ask({title:'Copy this '+what.toLowerCase(),input:{label:what,value:t,readonly:true,max:600},ok:'Done',cancel:false})}}}

const gal=p=>p&&p.length?`<div class="gal">${p.map(mediaUrl).filter(Boolean).map(x=>`<img src="${esc(x)}" alt="Product photo" loading="lazy">`).join('')}</div>`:'';
const shrink=(f,max)=>new Promise((ok,no)=>{
  if(!f||!/^image\//.test(f.type))return no(new Error('That file is not an image.'));
  if(f.size>25e6)return no(new Error('That photo is too large. Pick one under 25 MB.'));
  const i=new Image(),u=URL.createObjectURL(f);
  i.onload=()=>{const k=Math.min(1,(max||1000)/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(i.width*k));c.height=Math.max(1,Math.round(i.height*k));c.getContext('2d').drawImage(i,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',.72))};
  i.onerror=()=>{URL.revokeObjectURL(u);no(new Error('That file is not a readable image.'))};i.src=u});
const payBox=d=>{const p=d.payment;
  if(p)return `<div class="card"><h2>Payment</h2><p>${esc(p.method)}${p.ref?', ref '+esc(p.ref):''}</p><p class="help">${p.ok?'The seller confirmed your payment.':'Recorded. The seller will confirm it.'}</p></div>`;
  return `<form id="pf" class="card" novalidate><h2>${T('payTitle')}</h2>${d.seller&&d.seller.pay?`<p>Pay ${price(d)} to <b>${esc(d.seller.pay)}</b> (${esc(d.seller.name)}), then record it here.</p>`:''}<div class="field"><label for="pm">How did you pay?</label><select id="pm">${PAYMENTS.map(m=>`<option>${esc(m)}</option>`).join('')}</select></div><div class="field"><label for="pr">Transaction ID (optional)</label><input id="pr" maxlength="40" autocomplete="off"></div><button class="btn block">${T('payBtn')}</button></form>`};
const bindPay=t=>submit('#pf',async()=>{await Store.buyerAct(t,'paid',{payment:{method:$('#pm').value,ref:$('#pr').value.trim()}});note('Payment recorded');BuyerDeal(t)});

const rateBox=d=>d.rating?`<div class="card"><h2>Your rating</h2><p class="stars" aria-label="${+d.rating.stars} out of 5">${stars(d.rating.stars)}</p>${d.rating.text?`<p>${esc(d.rating.text)}</p>`:''}</div>`:`<form id="rf" class="card" novalidate><h2>${T('rateTitle')}</h2><div class="tabs" role="group" aria-label="Stars">${[1,2,3,4,5].map(n=>`<button type="button" class="tab" data-n="${n}" aria-pressed="false">${n} ★</button>`).join('')}</div><div class="field"><label for="rt">Comment (optional)</label><textarea id="rt" rows="2" maxlength="200"></textarea></div><button class="btn block">${T('rateBtn')}</button></form>`;
const bindRate=t=>{const f=$('#rf');if(!f)return;let n=0;$$('.tab',f).forEach(b=>b.onclick=()=>{n=+b.dataset.n;$$('.tab',f).forEach(x=>x.setAttribute('aria-pressed',x===b))});
  submit('#rf',async()=>{if(!n)return note('Pick 1 to 5 stars.');await Store.buyerAct(t,'rated',{rating:{stars:n,text:$('#rt').value.trim()}});note('Thank you for rating');BuyerDeal(t)})};

/* Offline outbox: a buyer's answer made without internet is kept on the phone and sent when it is back. */
const OB='dealpin.outbox';
const outbox=()=>{try{return JSON.parse(localStorage.getItem(OB))||[]}catch{return[]}};
let flushing=false;
async function flush(){
  if(flushing)return;const q=outbox();if(!q.length)return;flushing=true;
  const rest=[];let sent=0,refused='';
  for(const j of q){
    try{await Store.buyerAct(j.token||j.id,'agree',{buyer:j.buyer});sent++}
    catch(e){if(!navigator.onLine||/No connection|Too many|Something went wrong/.test(e&&e.message||''))rest.push(j);else refused=e.message}}
  try{localStorage.setItem(OB,JSON.stringify(rest))}catch{}
  flushing=false;
  if(sent)note('Your saved answer was sent');else if(refused)note('Your saved answer could not be sent: '+refused);
  if(sent||refused)render()}
addEventListener('online',flush);
addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement&&document.activeElement.tagName)){const q=$('#q');if(q){e.preventDefault();q.focus()}}});
on('#theme-toggle',cycleTheme);
const qrBox=(u,t)=>{let s;try{s=QR.svg(u)}catch{return''}return `<div class="card"><h2>${esc(t)}</h2><div class="qr" role="img" aria-label="QR code for ${esc(u)}">${s}</div><p class="help">Scan with a phone camera to open the link.</p></div>`};

let ip=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();ip=e;if(/^#\/(welcome|settings)/.test(location.hash))render()});
addEventListener('appinstalled',()=>{ip=null;note('Dealpin installed')});
const installBox=()=>{
  if((window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone)return '';
  if(ip)return '<button class="btn block" id="inst">Install Dealpin</button>';
  if(/iphone|ipad|ipod/i.test(navigator.userAgent))return '<p class="help">On iPhone: tap the Share button in Safari, then Add to Home Screen.</p>';
  return '';
};
const bindInstall=()=>on('#inst',async()=>{if(!ip)return;ip.prompt();await ip.userChoice;ip=null;render()});

/* New version ready: the buyer or seller decides when to reload, so nobody loses a half-filled form. */
function offerUpdate(reg){
  if($('#upd'))return;const b=document.createElement('div');b.id='upd';b.setAttribute('role','status');
  b.innerHTML='<span>A new version of Dealpin is ready.</span><button class="btn" type="button">Update</button>';
  b.querySelector('button').onclick=()=>{const w=reg.waiting;if(w)w.postMessage('skip');else location.reload()};
  document.body.appendChild(b)}
function watchUpdates(){
  if(!('serviceWorker' in navigator)||!/^https?:/.test(location.protocol))return;
  navigator.serviceWorker.register('sw.js').then(reg=>{
    if(reg.waiting&&navigator.serviceWorker.controller)offerUpdate(reg);
    reg.addEventListener('updatefound',()=>{const w=reg.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)offerUpdate(reg)})});
    setInterval(()=>reg.update().catch(()=>{}),6*3600*1000);
  }).catch(e=>Monitor.report('sw',e&&e.message));
  const had=!!navigator.serviceWorker.controller;let rl=false;   // the first install also changes the controller: no reload then
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(rl||!had)return;rl=true;location.reload()})}
