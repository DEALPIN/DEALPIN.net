/* Seller screens: deals list, welcome, new/edit deal, deal page, profile, settings, legal. */
const filterFromHash=()=>{const k=new URLSearchParams(location.hash.split('?')[1]||'').get('f');return Object.prototype.hasOwnProperty.call(DEAL_FILTERS,k)?k:'all'};
const dealRowActions=d=>`<div class="row-actions"><button class="btn ghost sm" type="button" data-copy-deal="${esc(link('d',d.bt))}">Copy buyer link</button>${['agreed','shipped'].includes(d.status)?`<a class="btn ghost sm" target="_blank" rel="noopener" href="${esc('https://wa.me/?text='+encodeURIComponent('Reminder about "'+d.title+'" on Dealpin: '+link('d',d.bt)))}">WhatsApp reminder</a>`:''}</div>`;
const DEAL_FILTERS={all:['All deals',()=>true],active:['Active',d=>['created','agreed','shipped'].includes(d.status)],awaiting:['Awaiting buyer',d=>d.status==='created'],received:['Verified',d=>d.status==='received'],issues:['Needs attention',d=>['disputed','cancelled'].includes(d.status)]};
const valueLine=m=>{const k=Object.keys(m).sort();return k.length?k.map(c=>money(m[c],c)).join(' · '):'None yet'};

async function Home(){
  const s=await Store.getSeller();if(!s.name)return go('/welcome');
  const u=DEALPIN.mode==='supabase'?await Auth.profile().catch(()=>({})):{},who=(u.name||(u.email?u.email.split('@')[0].replace(/[._-]+/g,' '):'')||s.name).trim().split(/\s+/)[0],first=who.charAt(0).toUpperCase()+who.slice(1);
  const ds=await Store.listDeals(),st=Store.stats(ds),rt=Store.rating(ds),val=Store.value(ds),h=new Date().getHours(),g=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  const need=st.disputed+st.awaiting;
  const tr=await Store.myTrust().catch(()=>null),shop=s.handle?link('u',encodeURIComponent(s.handle)):'';if(tr&&shop)queueMicrotask(()=>on('#trust-copy',()=>copy(shop,'Shop link')));
  view(`${storeWarn()}<section class="home-hero"><p class="eyebrow">${g}</p><h1>${esc(first)}</h1><p class="sub">${need?`${+need} deal${need>1?'s need':' needs'} your attention.`:'You are all caught up.'}${rt.n?` ${+rt.avg} ★ from ${+rt.n} rating${rt.n>1?'s':''}.`:''}</p><p class="value-line"><span>Verified value</span> <b>${esc(valueLine(val))}</b></p></section>
  <div class="stats dashboard-stats"><div><a class="stat-link" href="#/deals?f=received"><b>${st.verified}</b>Verified</a></div><div><a class="stat-link" href="#/deals?f=active"><b>${st.active}</b>In progress</a></div><div><a class="stat-link" href="#/deals?f=awaiting"><b>${st.awaiting}</b>Awaiting buyer</a></div><div><a class="stat-link" href="#/deals?f=issues"><b>${st.disputed}</b>Disputed</a></div></div>
  ${tr?Trust.card(tr,shop):''}<h2 class="sec-h">Quick actions</h2><div class="qa"><a href="#/new">${ic('plus')}<span>New deal</span></a><a href="#/product/new">${ic('plus')}<span>Add product</span></a><a href="#/tools">${ic('box')}<span>Tools</span></a><a href="#/autopilot">${ic('grid')}<span>Business Autopilot</span></a><a href="#/verify">${ic('pin')}<span>Verify receipt</span></a></div>
  <section class="card"><div class="panel-title"><h2>Recent activity</h2></div>${ds.length?`<ul class="list">${ds.slice().sort((a,b)=>b.created-a.created).slice(0,5).map(d=>`<li><a class="row deal-row" href="#/deal/${encodeURIComponent(d.id)}"><div class="deal-main"><b>${esc(d.title)}</b><small>${price(d)} <span aria-hidden="true">·</span> ${when(d.created)}</small></div></a></li>`).join('')}</ul><div class="actions"><a class="btn ghost" href="#/deals">See all deals</a></div>`:`<div class="empty"><h2>No deals yet</h2><p>Create a deal link and send it to your buyer in chat.</p><a class="btn" href="#/new">Create your first deal</a></div>`}</section>
  ${s.handle?`<section class="card"><h2>Grow your record</h2><p class="help">Paste your public link in your WhatsApp, Instagram or TikTok bio so buyers can see your verified deals.</p><div class="actions"><button class="btn ghost" id="hcp" type="button">Copy my link</button><a class="btn ghost" href="#/profile">My profile</a></div></section>`:''}`);
  on('#hcp',()=>copy(link('u',s.handle)));
}

async function Deals(){
  const s=await Store.getSeller();if(!s.name)return go('/welcome');
  const ds=await Store.listDeals(),st=Store.stats(ds),rt=Store.rating(ds),val=Store.value(ds);
  let f=filterFromHash(),q='',sort='newest';
  view(`${storeWarn()}<section class="dashboard-head"><div><p class="eyebrow">All deals</p><h1>Deals</h1><p class="sub">${rt.n?`${+rt.avg} ★ average from ${+rt.n} rating${rt.n>1?'s':''}. `:''}Every verified deal builds your public record.</p></div><a class="btn" href="#/new">${ic('plus')} New deal</a></section>
  <section class="card deals-panel"><div class="panel-title"><div><h2>Your deals</h2><p class="help">Search by item, deal ID, buyer name or phone number.</p></div></div>
  ${ds.length?`<div class="toolbar"><div class="search-wrap"><label class="sr-only" for="q">Search deals</label><input id="q" type="search" placeholder="Search deals" autocomplete="off"></div><div class="sort-wrap"><label class="sr-only" for="sort-deals">Sort deals</label><select id="sort-deals"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="price-high">Highest price</option><option value="price-low">Lowest price</option><option value="title">Item name A–Z</option></select></div></div><div class="tabs" role="group" aria-label="Filter deals">${Object.entries(DEAL_FILTERS).map(([k,v])=>`<button type="button" class="tab" data-k="${k}" aria-pressed="${k===f}">${v[0]}</button>`).join('')}</div><ul class="list" id="ls" aria-live="polite"></ul>`
  :`<div class="empty"><h2>No deals yet</h2><p>Create a deal link and send it to your buyer in chat.</p><a class="btn" href="#/new">Create your first deal</a></div>`}</section>`);
  if(!ds.length)return;
  const draw=()=>{
    let r=ds.filter(d=>DEAL_FILTERS[f][1](d)&&(!q||[d.title,d.id,d.buyer&&d.buyer.name,d.buyer&&d.buyer.phone].join(' ').toLowerCase().includes(q)));
    const n=d=>Number(d.price)||0;
    r=r.slice().sort((a,b)=>sort==='oldest'?a.created-b.created:sort==='price-high'?n(b)-n(a):sort==='price-low'?n(a)-n(b):sort==='title'?String(a.title).localeCompare(String(b.title)):b.created-a.created);
    $('#ls').innerHTML=r.length?r.map(d=>`<li><a class="row deal-row" href="#/deal/${encodeURIComponent(d.id)}"><div class="deal-main"><b>${esc(d.title)}</b><small>${price(d)} <span aria-hidden="true">·</span> ${when(d.created)}${d.buyer&&d.buyer.name?` <span aria-hidden="true">·</span> ${esc(d.buyer.name)}`:''}</small></div>${chip(d.status)}<span class="row-arrow" aria-hidden="true">›</span></a>${dealRowActions(d)}</li>`).join(''):`<li class="empty"><p>No deals match.</p><button class="btn ghost" id="clear-deal-search" type="button">Clear search and filters</button></li>`;
    $$('[data-copy-deal]').forEach(b=>b.onclick=e=>{e.preventDefault();copy(b.dataset.copyDeal,'Buyer link')});
    on('#clear-deal-search',()=>{q='';f='all';sort='newest';$('#q').value='';$('#sort-deals').value='newest';$$('.tab').forEach(x=>x.setAttribute('aria-pressed',x.dataset.k==='all'));draw()});
  };
  $('#q').oninput=e=>{q=e.target.value.trim().toLowerCase();draw()};
  $('#sort-deals').onchange=e=>{sort=e.target.value;draw()};
  $$('.tab').forEach(t=>t.onclick=()=>{f=t.dataset.k;$$('.tab').forEach(x=>x.setAttribute('aria-pressed',x===t));draw()});
  draw();
}

async function Welcome(){
  const s=await Store.getSeller().catch(()=>({name:''}));
  view(`<div class="hero"><span class="logo">${ic('pin')}</span><h1>Sell in chat. Prove every deal. Run your business.</h1><p class="sub">Sell on WhatsApp, Instagram or TikTok with a record both sides can trust.</p></div>
  <ol class="how"><li><div><b>Send a deal link</b><p class="help">Your buyer opens it in their browser. No app and no account.</p></div></li>
  <li><div><b>The buyer agrees and shares the spot</b><p class="help">A location pin, a landmark and a short voice note.</p></div></li>
  <li><div><b>Delivery is confirmed</b><p class="help">The rider checks in at the pin and the buyer taps received. You both keep the receipt.</p></div></li></ol>
  <div class="actions"><a class="btn" href="${s.name?'#/':'#/profile'}">${s.name?'Go to my deals':'Set up my seller profile'}</a>${installBox()}<a class="btn ghost" href="#/verify">Verify a receipt</a></div>`);
  bindInstall();
}

async function Settings(){
  const online=DEALPIN.mode==='supabase';
  queueMicrotask(()=>fillPushSlot());
  view(`<h1>Settings</h1><p class="sub">Install the app, set your region and manage your data.</p><section class="card"><h2>Business Autopilot</h2><p>Manage customers, sales opportunities, stock, suppliers, team, workflows and business insights. Every Autopilot and enterprise capability is free.</p><a class="btn" href="#/autopilot">Open Business Autopilot</a></section>
  <div class="grid-2 settings-cols"><div id="push-slot"></div>
  <div class="card"><h2>Interface language</h2>${langBox()}<p class="help">Some seller and Tools wording is translated. Please use English for legal and critical operational instructions until translations are reviewed by native speakers.</p></div>
  <div class="card"><h2>Install Dealpin</h2>${installBox()||'<p class="help">Dealpin is already installed, or your browser does not offer installing.</p>'}</div>
  <div class="card"><h2>Appearance</h2><div class="field"><label for="theme-choice">Colour theme</label><select id="theme-choice"><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select></div><p class="help">System default follows your phone or computer.</p></div>
  <div class="card"><h2>Region and currency</h2><p class="help">Used for prices, dates and phone numbers on this device. New deals start in this currency; each deal keeps its own.</p><div class="field"><label for="region-country">Country or region</label><select id="region-country">${regionOptions()}</select></div><div class="field"><label for="region-currency">Currency for new deals</label><select id="region-currency">${currencyOptions()}</select></div><button class="btn block" id="save-region">Save region</button></div>
  ${online?`<div class="card"><h2>Your data</h2><p>Your deals, photos and voice notes are stored online under your account. Tools records are saved on this device until online sync is switched on.</p><div class="actions"><button class="btn ghost" id="ex">Download my data</button></div></div>
  <div class="card"><h2>Account</h2><div class="actions"><button class="btn ghost" id="so">Sign out</button><button class="btn bad" id="da">Delete my account and data</button></div><p class="help">Deleting removes your profile, deals, photos and voice notes for good. Receipts for those deals stop working, for buyers too.</p></div>`
  :`<div class="card"><h2>Your data</h2><p>Deals, photos, voice notes and Tools records are saved on this device only.</p><div class="actions"><button class="btn ghost" id="ex">Download my data</button><button class="btn ghost" id="im">Restore from backup</button><input id="imf" type="file" accept="application/json" hidden><button class="btn bad" id="rs">Delete all data on this device</button></div></div>`}
  <div class="card"><h2>About</h2><p><a href="#/welcome">How Dealpin works</a></p><p><a href="#/verify">Verify a receipt code</a></p><p><a href="#/legal">Terms and privacy</a></p><p class="help">Version ${VERSION}</p></div>
  </div>`);
  bindInstall();
  $('#theme-choice').value=currentTheme();
  $('#theme-choice').onchange=e=>{applyTheme(e.target.value);note('Appearance saved')};
  $('#region-country').onchange=()=>{const r=REGIONS.find(x=>x[0]===$('#region-country').value);if(r)$('#region-currency').innerHTML=currencyOptions(r[3])};
  on('#save-region',()=>{setRegion($('#region-country').value,$('#region-currency').value);note('Region saved');render()});
  tap('#so',async()=>{await Auth.signOut();location.replace('../#/signin')});
  tap('#da',async()=>{
    if(!await ask({title:'Delete your account?',body:'This removes your profile, all your deals, photos and voice notes. It cannot be undone. Receipts for these deals will stop working for buyers too.',ok:'Continue',danger:true}))return;
    const t=await ask({title:'Type DELETE to confirm',input:{label:'Confirmation',max:10},ok:'Delete everything',danger:true});
    if((t||'').toUpperCase()!=='DELETE')return note('Nothing was deleted.');
    await ModStore.purgeFiles();await Store.deleteAccount();await LocalModStore.clear();note('Your account was deleted');location.replace('../#/signin')});
  on('#im',()=>$('#imf').click());
  const imf=$('#imf');if(imf)imf.onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
    try{let o;try{o=JSON.parse(await f.text())}catch{throw new Error('That file is not a Dealpin backup.')}
      Store.importAll(o,true);await ModStore.import(o.mods,true);   // validates everything before anything is replaced
      if(!await ask({title:'Replace everything on this device with this backup?',body:'Your deals and Tools records on this device are replaced.',ok:'Replace',danger:true}))return;
      Store.importAll(o);await ModStore.import(o.mods||{});note('Backup restored');go('/')}catch(x){fail(x)}};
  tap('#ex',async()=>{const u=URL.createObjectURL(new Blob([JSON.stringify({...await Store.exportAll(),mods:await ModStore.export()},null,1)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='dealpin-data-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);note('Data downloaded')});
  tap('#rs',async()=>{if(await ask({title:'Delete everything on this device?',body:'Your profile, all deals and all Tools records will be removed. This cannot be undone.',ok:'Delete everything',danger:true})){Store.reset();await ModStore.clear();note('Data deleted');go('/welcome')}});
}

async function Legal(){
  const mail=DEALPIN.supportEmail&&/^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/.test(DEALPIN.supportEmail)?DEALPIN.supportEmail:'';
  const online=DEALPIN.mode==='supabase';
  view(`<a class="back" href="#/settings">Back to settings</a><h1>Terms and privacy</h1><p class="sub">How Dealpin works and what it keeps.</p>
  <div class="card"><h2>What Dealpin is</h2><p>Dealpin records a deal between a seller and a buyer: what was agreed, where it goes, who confirmed what and when. Payments go directly between the buyer and the seller, and every confirmed step leaves a record both sides can see.</p></div>
  <div class="card"><h2>What it stores</h2><p>Your sign-in (email, phone number or Google account name and email), names, phone numbers, delivery pins, landmarks, voice notes, photos, payment references and the steps of each deal. Location and microphone are used only when you tap the button that asks for them. ${online?'This data is stored online under the seller’s account.':'In this mode the data stays on this device.'}</p></div>
  <div class="card"><h2>Who can see it</h2><p>The seller, the buyer and the rider each see the parts of a deal they need. A receipt shows the item, price, steps and receipt code. It never shows the buyer’s phone number or location. A seller’s public page lists verified deals, ratings and dispute counts.</p></div>
  <div class="card"><h2>Links are keys</h2><p>Anyone who has a buyer or rider link can open that part of the deal. Send links only to the person they are for.</p></div>
  <div class="card"><h2>Service providers</h2><p>Supabase stores the data and runs sign-in, Cloudflare hosts the app, Google provides “Continue with Google”, and an email or text provider sends sign-in codes. Full text: <a href="privacy.html">privacy policy</a> and <a href="terms.html">terms of service</a>.</p></div>
  <div class="card"><h2>Your choices</h2><p>You can download your data, or delete your account and everything in it, at any time in Settings. A deal that already has a buyer is part of both people’s record and cannot be deleted on its own.</p></div>
  ${mail?`<div class="card"><h2>Contact</h2><p><a href="mailto:${esc(mail)}">${esc(mail)}</a></p></div>`:''}`);
}

async function NewDeal(id){
  const s=await Store.getSeller();if(!s.name)return go('/welcome');
  const d=id?await Store.getDeal(id):null;
  if(id&&(!d||d.status!=='created'))return missing('Only deals still waiting for a buyer can be edited.');
  const v=d||{title:'',price:'',currency:REGION.currency,delivery:DELIVERY[0],terms:''};let photos=d?[...(d.photos||[])]:[];
  const dc=cur(v),digits=minorDigits(dc);
  view(`<div class="narrow"><h1>${d?'Edit deal':'New deal'}</h1><p class="sub">${d?'Changes apply to the same link.':'Fill this in, then send the link to your buyer in chat.'}</p>
  <form id="f" class="card" novalidate>
    <div class="field"><label for="t">What are you selling?</label><input id="t" required maxlength="80" value="${esc(v.title)}"></div>
    <div class="row-2"><div class="field"><label for="p">Price</label><input id="p" type="number" inputmode="decimal" min="0" step="any" required value="${esc(v.price)}"></div>
    <div class="field"><label for="c">Currency</label><select id="c">${currencyOptions(dc)}</select></div></div>
    <div class="field"><label for="m">Delivery</label><select id="m">${DELIVERY.map(o=>`<option${o===v.delivery?' selected':''}>${esc(o)}</option>`).join('')}</select></div>
    <div class="field"><label for="x">Terms (optional)</label><textarea id="x" rows="3" maxlength="300">${esc(v.terms)}</textarea><p class="help">Anything the buyer should agree to, such as returns or timing.</p></div>
    <div class="field"><label for="im">Photos (up to ${MAX_PHOTOS})</label><input id="im" type="file" accept="image/*" multiple><div id="pv"></div></div>
    <button class="btn block">${d?'Save changes':'Create deal link'}</button>
  </form></div>`);
  const draw=()=>{$('#pv').innerHTML=photos.length?`<div class="gal">${photos.map((x,i)=>`<button type="button" class="thumb" data-i="${i}" aria-label="Remove photo ${i+1}"><img src="${esc(mediaUrl(x))}" alt=""><span aria-hidden="true">✕</span></button>`).join('')}</div><p class="help">Tap a photo to remove it.</p>`:'';
    $$('#pv .thumb').forEach(m=>m.onclick=()=>{photos.splice(+m.dataset.i,1);draw()})};
  draw();
  $('#im').onchange=async e=>{try{for(const f of [...e.target.files].slice(0,MAX_PHOTOS-photos.length))photos.push(await shrink(f));draw()}catch(x){fail(x)}e.target.value=''};
  if(!d){const dr=draftLoad('deal');if(dr){Object.entries(dr.v).forEach(([fid,val])=>{const el=$('#'+fid);if(el&&val!=='')el.value=val});note('Draft restored. Nothing is lost if the connection drops.')}draftWire('deal',['t','p','c','m','x'])}
  submit('#f',async()=>{
    const title=$('#t').value.trim(),c=$('#c').value,pr=roundMoney($('#p').value,c);
    if(!title)return bad('#t','Enter what you are selling.');
    if(!($('#p').value!=='')||!(pr>0)||pr>MAX_PRICE)return bad('#p','Enter a price above 0.');
    const f={title,price:pr,currency:c,delivery:$('#m').value,terms:$('#x').value.trim(),photos};
    if(d){await Store.updateDeal(id,f);note('Changes saved');go('/deal/'+id)}else{const n=await Store.createDeal(f);draftClear('deal');note('Deal link created');go('/deal/'+n.id)}});
}

async function SellerDeal(id){
  const d=await Store.getDeal(id);if(!d)return missing(DEALPIN.mode==='supabase'?'This deal was not found in your account.':'This deal does not exist on this device.');
  const l=link('d',d.bt),rl=link('g',d.rt),b=d.buyer,p=d.payment,a=d.arrival,wa=t=>'https://wa.me/?text='+encodeURIComponent(t);
  const eid=encodeURIComponent(d.id);
  view(`<a class="back" href="#/">Back to deals</a><h1>${esc(d.title)}</h1><p class="sub">${price(d)} ${chip(d.status)}</p>
  <div class="split"><div class="col">${gal(d.photos)}
  ${d.status==='created'?`<div class="card"><h2>Send this link to your buyer</h2><input readonly value="${esc(l)}" aria-label="Deal link"><div class="actions"><button class="btn" id="cp">Copy link</button><a class="btn ghost" href="${wa(`Hi, here is your deal for ${d.title} (${price(d)}): ${l}`)}" target="_blank" rel="noopener">Send on WhatsApp</a></div></div>`:''}${['agreed','shipped'].includes(d.status)?`<div class="card"><h2>Remind your buyer</h2><div class="actions"><a class="btn ghost" href="${wa(`Reminder about ${d.title} (${price(d)}): ${l}`)}" target="_blank" rel="noopener">Remind on WhatsApp</a></div></div>`:''}
  ${b?`<div class="card"><h2>Buyer</h2><p>${esc(b.name)}, <a href="tel:${esc(String(b.phone).replace(/[^0-9+]/g,''))}">${esc(b.phone)}</a></p>${b.pin?`<p><a href="https://www.google.com/maps?q=${+b.pin.lat},${+b.pin.lng}" target="_blank" rel="noopener noreferrer">Open pin in Maps</a>, accurate to about ${Math.round(+b.pin.acc)||0} m</p>`:''}${b.landmark?`<p>${esc(b.landmark)}</p>`:''}${mediaUrl(b.voice)?`<audio controls src="${esc(mediaUrl(b.voice))}"></audio>`:''}</div>`:''}
  ${d.dispute?`<div class="card warn"><h2>Buyer’s problem</h2><p>${esc(d.dispute.why)}</p>${gal(d.dispute.photo?[d.dispute.photo]:[])}${d.dispute.reply?`<p><b>Your reply:</b> ${esc(d.dispute.reply)}</p>`:''}${d.status==='disputed'?`<div class="field"><label for="rp">Reply to the buyer</label><textarea id="rp" rows="2" maxlength="300"></textarea></div><div class="actions"><button class="btn ghost" id="rpb">Send reply</button><button class="btn" id="rsv">Mark as resolved</button></div>`:''}</div>`:''}
  ${d.rating?`<div class="card"><h2>Buyer rating</h2><p class="stars" aria-label="${+d.rating.stars} out of 5">${stars(d.rating.stars)}</p>${d.rating.text?`<p>${esc(d.rating.text)}</p>`:''}</div>`:''}
  ${p?`<div class="card"><h2>Payment</h2><p>${esc(p.method)}${p.ref?', ref '+esc(p.ref):''}</p><p class="help">${p.ok?'You confirmed this payment.':'Recorded by the buyer. Check your account before you confirm.'}</p>${p.ok?'':'<div class="actions"><button class="btn" id="po">I received this payment</button></div>'}</div>`:b&&d.status!=='cancelled'?`<div class="card"><h2>Payment</h2><p>The buyer has not recorded a payment yet.</p><div class="actions"><a class="btn ghost" href="${wa('Hi '+b.name+', a reminder to pay for '+d.title+' ('+price(d)+'). Record the payment here: '+l).replace('wa.me/?','wa.me/'+tel(b.phone)+'?')}" target="_blank" rel="noopener">Remind on WhatsApp</a></div></div>`:''}
  ${mode(d)==='rider'&&(d.status==='shipped'||a)?`<div class="card"><h2>Rider</h2>${a?`<p>Arrived at the pin${a.dist!=null?`, ${Math.round(+a.dist)} m from the buyer’s location`:''}.</p>`:`<p>Send this link to your rider. It shows the pin, landmark and voice note.</p><div class="actions"><button class="btn ghost" id="cr">Copy rider link</button><a class="btn ghost" href="${wa(`Delivery for ${d.title}: ${rl}`)}" target="_blank" rel="noopener">Send on WhatsApp</a></div>`}</div>`:''}
  </div><aside class="col"><div class="card"><h2>Progress</h2>${steps(d)}</div>${d.status==='created'?qrBox(l,'Or show this QR code'):''}</aside></div>
  <div class="actions">${d.status==='agreed'?'<button class="btn" id="sh">Mark as shipped</button>':''}${d.status==='created'?`<a class="btn ghost" href="#/edit/${eid}">Edit deal</a>`:''}<a class="btn ghost" href="#/r/${eid}">View receipt</a>${b&&d.status!=='cancelled'?`<a class="btn ghost" href="#/m/invoices/new?deal=${eid}">Make an invoice</a>`:''}${b&&mode(d)==='rider'&&['agreed','shipped'].includes(d.status)?`<a class="btn ghost" href="#/m/jobs/new?deal=${eid}">Add to deliveries</a>`:''}<button class="btn ghost" id="dup">Duplicate</button>${Store.canDelete(d)&&['created','cancelled','received','resolved','disputed'].includes(d.status)?'<button class="btn ghost" id="del">Delete</button>':''}${d.status==='created'||d.status==='agreed'?'<button class="btn bad" id="cx">Cancel deal</button>':''}</div>`);
  const doit=(fn,m)=>async()=>{await fn();note(m);SellerDeal(id)};
  on('#cp',()=>copy(l));on('#cr',()=>copy(rl,'Rider link'));
  tap('#rpb',async()=>{const t=$('#rp').value.trim();if(!t)return bad('#rp','Write your reply first.');await doit(()=>Store.reply(id,t),'Reply sent')()});
  tap('#rsv',async()=>{if(await ask({title:'Mark this problem as resolved?',ok:'Mark resolved'}))await doit(()=>Store.resolve(id),'Marked as resolved')()});
  tap('#dup',async()=>{const n=await Store.createDeal({title:d.title,price:d.price,currency:cur(d),delivery:d.delivery,terms:d.terms,photos:d.photos||[]});note('Copied as a new deal');go('/deal/'+n.id)});
  tap('#del',async()=>{if(await ask({title:'Delete this deal?',body:'This cannot be undone.',ok:'Delete',danger:true})){await Store.removeDeal(id);note('Deal deleted');go('/')}});
  tap('#po',doit(()=>Store.confirmPayment(id),'Payment confirmed'));
  tap('#sh',async()=>{
    if(!(p&&p.ok)&&!(p&&p.method==='Cash on delivery')&&!await ask({title:'Payment is not confirmed yet',body:'Ship anyway?',ok:'Ship anyway'}))return;
    let parcel='';if(mode(d)==='courier'){const v=await ask({title:'Parcel reference',body:'Bus name or courier tracking number. You can leave it empty.',input:{label:'Reference',max:60},ok:'Mark as shipped'});if(v===null)return;parcel=v}
    await doit(()=>Store.ship(id,parcel),'Marked as shipped')()});
  tap('#cx',async()=>{if(await ask({title:'Cancel this deal?',body:'The buyer will see it as cancelled.',ok:'Cancel deal',cancel:'Keep deal',danger:true}))await doit(()=>Store.cancel(id),'Deal cancelled')()});
  watch(()=>SellerDeal(id));
}

const avatarHtml=(s,u,ini)=>{const src=s.avatar?mediaUrl(s.avatar):(u&&u.picture)||'';return /^https:\/\//.test(src)?`<img class="brand-avatar" src="${esc(src)}" alt="" referrerpolicy="no-referrer">`:`<span class="brand-avatar" aria-hidden="true">${ini}</span>`};
async function Profile(){
  const s=await Store.getSeller();if(!s.name)return ProfileEditor();
  const ds=await Store.listDeals(),st=Store.stats(ds),rt=Store.rating(ds),tr=await Store.myTrust().catch(()=>({tier:'new',deals:0,need:5,verified:false})),first=ds.length?Math.min(...ds.map(d=>d.created)):0,ini=esc([...s.name.trim()].slice(0,2).join('').toUpperCase()),u=DEALPIN.mode==='supabase'?await Auth.profile().catch(()=>({})):{};
  view(`<section class="brand-card"><div class="brand-cover" aria-hidden="true"></div><div class="brand-main">${avatarHtml(s,u,ini)}<h1>${esc(s.name)}</h1>${s.handle?`<p class="brand-handle">@${esc(s.handle)}</p>`:''}<div class="brand-badges">${Trust.badge(tr)||'<span class="bb">New seller</span>'}${rt.n?`<span class="bb">★ ${+rt.avg} (${+rt.n})</span>`:''}</div><div class="actions center"><a class="btn" href="#/profile/edit">Edit profile</a>${s.handle?`<a class="btn ghost" href="#/u/${esc(s.handle)}">View public page</a>`:''}</div></div></section>
  ${Trust.card(tr,s.handle?link('u',encodeURIComponent(s.handle)):'')}
  <div class="stats dashboard-stats"><div><b>${st.verified}</b>Verified deals</div><div><b>${rt.n?+rt.avg:'–'}</b>Rating</div><div><b>${st.disputed}</b>Disputes</div></div>
  <section class="card"><h2>Contact and payment</h2><dl class="kv">${u.name||u.email?`<div><dt>Signed in as</dt><dd>${esc(u.name||'')}${u.name&&u.email?' · ':''}${esc(u.email||'')}</dd></div>`:''}<div><dt>WhatsApp</dt><dd>${esc(s.phone||'Not added')}</dd></div><div><dt>Payment details</dt><dd>${esc(s.pay||'Not added')}</dd></div>${first?`<div><dt>On Dealpin since</dt><dd>${esc(when(first))}</dd></div>`:''}</dl></section>
  ${s.handle?`<section class="card"><h2>Share your record</h2><p class="help">Put this link in your bio so buyers can check your verified deals.</p><div class="actions"><button class="btn ghost" id="cp" type="button">Copy link</button></div></section>${qrBox(link('u',s.handle),'Your QR code')}`:''}
  <section class="card"><h2>More</h2><ul class="list"><li><a class="row" href="#/products"><div><b>My products</b><small>Your catalogue and purchase requests</small></div></a></li><li><a class="row" href="#/tools"><div><b>Tools</b><small>Deliveries, ledger, invoices, stock</small></div></a></li><li><a class="row" href="#/settings"><div><b>Settings</b><small>Language, theme, region and your data</small></div></a></li><li><a class="row" href="#/legal"><div><b>Terms and privacy</b></div></a></li></ul><div class="actions"><button class="btn ghost" id="so" type="button">Sign out</button></div></section>`);
  on('#cp',()=>copy(link('u',s.handle)));
  tap('#so',async()=>{await Auth.signOut();location.replace('../#/signin')});
}

async function ProfileEditor(){
  const s=await Store.getSeller(),u=DEALPIN.mode==='supabase'?await Auth.profile().catch(()=>({})):{};let avatar=s.avatar||'';const ini=esc([...(s.name||u.name||'D').trim()].slice(0,2).join('').toUpperCase());
  view(`<div class="narrow"><h1>${s.name?'Your profile':'Set up your seller profile'}</h1><p class="sub">Buyers see this name on every deal and receipt.</p>
  ${DEALPIN.mode==='supabase'?`<div class="card avatar-edit"><div id="av-prev">${avatarHtml({avatar},u,ini)}</div><div><h2>Profile photo</h2><p class="help">Your Google photo is used until you upload your own.</p><div class="actions"><label class="btn ghost" for="av-in">Upload photo</label><input id="av-in" class="sr-only" type="file" accept="image/*"><button class="btn ghost" id="av-rm" type="button">Use Google photo</button></div></div></div>`:''}<form id="f" class="card" novalidate>
    <div class="field"><label for="n">Name or shop name</label><input id="n" value="${esc(s.name||u.name||'')}" required maxlength="40" autocomplete="organization"></div>
    <div class="field"><label for="h">Profile link name</label><input id="h" value="${esc(s.handle)}" maxlength="24" autocapitalize="none" autocomplete="off" spellcheck="false"><p class="help">Lowercase letters, numbers and dashes. Leave empty to use your name.</p></div>
    <div class="field"><label for="p">WhatsApp number</label><input id="p" type="tel" inputmode="tel" autocomplete="tel" value="${esc(s.phone)}" maxlength="30"><p class="help">Include the country code, for example ${esc(REGION.dial)}. Buyers can message you from the deal page.</p></div>
    <div class="field"><label for="pa">Payment details</label><input id="pa" value="${esc(s.pay)}" maxlength="80" autocomplete="off"><p class="help">The mobile money number or bank account buyers should pay. Shown to the buyer on each deal.</p></div>
    <button class="btn block">Save profile</button>
  </form>
  ${s.handle?`<div class="card"><h2>Your public record</h2><p><a href="#/u/${esc(s.handle)}">Open it</a> or copy the link to paste in your bio.</p><div class="actions"><button class="btn ghost" id="cp">Copy link</button></div></div>${qrBox(link('u',s.handle),'Your QR code')}`:''}</div>`);
  submit('#f',async()=>{
    const name=$('#n').value.trim();if(!name)return bad('#n','Enter your name or shop name.');
    const h=slug($('#h').value||name),ph=$('#p').value.trim();
    if(ph&&!/^[0-9+() -]{5,30}$/.test(ph))return bad('#p','Use digits, spaces and + only.');
    await Store.saveSeller({name,handle:h,phone:ph,pay:$('#pa').value.trim(),...(DEALPIN.mode==='supabase'?{avatar}:{})});if(s.avatar&&s.avatar!==avatar&&Store.net)Promise.resolve(Store.net.removeFiles([s.avatar])).catch(()=>{});note('Profile saved');go('/profile')});
  const ai=$('#av-in');if(ai){ai.onchange=async e=>{try{const f=e.target.files[0];if(!f)return;avatar=await Store.uploadAvatar(await shrink(f,320));$('#av-prev').innerHTML=avatarHtml({avatar},u,ini);note('Photo ready. Save your profile to keep it.')}catch(x){fail(x)}};$('#av-rm').onclick=()=>{avatar='';$('#av-prev').innerHTML=avatarHtml({avatar},u,ini)}}
  on('#cp',()=>copy(link('u',s.handle)));
}

/* Public product discovery. Publishing controls whether a listing appears here. */
async function ExploreLanding(){
  const products=await Store.listPublicProducts();let q='',cat='',sort='trust',shown=24;const tmap=await Store.productTrust(products.map(p=>p.id)).catch(()=>({}));const sc=p=>{const x=tmap[p.id];return x&&x.score!=null?x.score:-1};
  const cats=[...new Set(products.map(p=>p.category).filter(Boolean))].sort((x,y)=>x.localeCompare(y));
  view(`<section class="product-workspace"><p class="eyebrow">DISCOVER DEALPIN</p><h1>Explore products</h1><p class="sub">Browse available listings. Contact sellers to agree on details; a verified deal is a separate step.</p>
  <div class="product-toolbar"><input id="explore-search" type="search" placeholder="Search products or categories" aria-label="Search products" autocomplete="off"><label class="sr-only" for="explore-sort">Sort products</label><select id="explore-sort"><option value="trust">Most trusted first</option><option value="newest">Newest first</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="title">Name A–Z</option></select></div>
  ${cats.length?`<div class="tabs" role="group" aria-label="Filter by category"><button type="button" class="tab" data-cat="" aria-pressed="true">All</button>${cats.map(c=>`<button type="button" class="tab" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div>`:''}
  <p class="help" id="explore-count" role="status" aria-live="polite"></p><div class="product-grid" id="explore-grid"></div><div class="actions"><button class="btn ghost" id="explore-more" type="button" hidden>Show more</button></div></section>`);
  const draw=()=>{
    let rows=products.filter(p=>(!cat||p.category===cat)&&(!q||[p.title,p.description,p.category].join(' ').toLowerCase().includes(q)));
    const n=p=>Number(p.price)||0;
    rows=rows.slice().sort((x,y)=>sort==='trust'?(sc(y)-sc(x))||((y.updated||0)-(x.updated||0)):sort==='price-low'?n(x)-n(y):sort==='price-high'?n(y)-n(x):sort==='title'?String(x.title).localeCompare(String(y.title)):(y.updated||0)-(x.updated||0));
    const list=rows.slice(0,shown);
    $('#explore-count').textContent=products.length?`${rows.length} of ${products.length} product${products.length===1?'':'s'}`:'';
    $('#explore-more').hidden=rows.length<=shown;
    $('#explore-grid').innerHTML=list.length?list.map(p=>`<article class="product-card"><a class="product-card-media" href="#/p/${esc(p.id)}">${p.photos&&p.photos[0]?`<img src="${esc(mediaUrl(p.photos[0]))}" alt="${esc(p.title)}" loading="lazy">`:`<span>${ic('box')}</span>`}</a><div class="product-card-body"><div class="product-card-meta">${esc(p.category||'Product')}</div>${Trust.badge(tmap[p.id])}<h2><a href="#/p/${esc(p.id)}">${esc(p.title)}</a></h2><b class="product-price">${esc(productPrice(p))}</b><div class="product-card-actions"><a class="btn" href="#/p/${esc(p.id)}">View product</a></div></div></article>`).join(''):products.length?'<div class="product-empty"><h2>No products match</h2><p>Try a different search or category.</p></div>':'<div class="product-empty"><h2>No published products yet</h2><p>When sellers publish available listings, they will appear here.</p></div>'};
  $('#explore-search').oninput=e=>{q=e.target.value.trim().toLowerCase();shown=24;draw()};
  $('#explore-sort').onchange=e=>{sort=e.target.value;shown=24;draw()};
  $$('[data-cat]').forEach(b=>b.onclick=()=>{cat=b.dataset.cat;shown=24;$$('[data-cat]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw()});
  $('#explore-more').onclick=()=>{shown+=24;draw()};draw();
}

/* Phase Two: seller product catalogue. Products are listings, never deal records. */
const PRODUCT_STATUS={draft:'Draft',published:'Published',paused:'Paused'};
const productPrice=p=>money(p.price,p.currency||REGION.currency);
async function ProductsLanding(){
  const products=await Store.listProducts(),requests=await Store.listProductRequests();let filter='all',query='';
  const counts={all:products.length,draft:products.filter(p=>p.status==='draft').length,published:products.filter(p=>p.status==='published').length,paused:products.filter(p=>p.status==='paused').length};
  view(`<section class="product-workspace"><div class="dashboard-head"><div><p class="eyebrow">SELLER CATALOGUE</p><h1>Products</h1><p class="sub">Manage the items you offer. A listing is separate from a verified deal.</p></div><a class="btn" href="#/product/new">${ic('plus')} Add product</a></div>
  <div class="product-counts">${Object.entries({all:'All',published:'Published',draft:'Drafts',paused:'Paused'}).map(([k,v])=>`<button class="product-count" data-filter="${k}" aria-pressed="${k==='all'}"><b>${counts[k]}</b><span>${v}</span></button>`).join('')}</div>
  <section class="card request-inbox"><div class="panel-title"><div><p class="eyebrow">BUYER INTEREST</p><h2>Purchase requests <span class="request-count">${requests.filter(r=>['pending','countered','accepted'].includes(r.status)).length}</span></h2><p class="help">Review offers before converting accepted requests into deals.</p></div></div><div class="request-list">${requests.length?requests.map(r=>`<article class="request-item"><div class="request-item-head"><div><b>${esc(r.productTitle)}</b><p class="help">${esc(r.buyerName)} · ${esc(r.phone)} · ${new Date(r.created).toLocaleString()}</p></div><span class="product-status ${r.status==='accepted'?'published':r.status==='declined'?'paused':'draft'}">${esc(r.status)}</span></div><p><b>${r.quantity} × ${esc(money(r.offer,r.currency))}</b>${r.message?` · ${esc(r.message)}`:''}</p>${r.counter?`<p class="help">Counter-offer: <b>${esc(money(r.counter.price,r.currency))}</b> ${esc(r.counter.message||'')}</p>`:''}${r.dealId?`<a class="btn ghost" href="#/deal/${r.dealId}">Open deal</a>`:r.status==='pending'?`<div class="actions"><button class="btn" type="button" data-req-accept="${r.id}">Accept</button><button class="btn ghost" type="button" data-req-counter="${r.id}">Counter-offer</button><button class="btn bad" type="button" data-req-decline="${r.id}">Decline</button></div>`:r.status==='accepted'?`<button class="btn" type="button" data-req-convert="${r.id}">Create Dealpin deal</button>`:r.status==='countered'?`<p class="help">Waiting for buyer to respond to your counter-offer.</p>`:''}</article>`).join(''):'<p class="help">No purchase requests yet. Requests from published product pages will appear here.</p>'}</div></section>
  ${products.length?`<div class="product-toolbar"><input id="product-search" type="search" placeholder="Search your products" aria-label="Search your products"><a class="btn ghost" href="#/product/new">New product</a></div><div class="product-grid" id="product-grid"></div>`:`<div class="product-empty"><div class="shell-feature-icon">${ic('box')}</div><h2>Your catalogue starts here</h2><p>Add your first product, prepare its photos and description, then publish a page you can share with customers.</p><a class="btn" href="#/product/new">Create your first product</a></div>`}</section>`);
  const draw=()=>{const rows=products.filter(p=>(filter==='all'||p.status===filter)&&(!query||[p.title,p.description,p.category].join(' ').toLowerCase().includes(query)));$('#product-grid').innerHTML=rows.length?rows.map(p=>`<article class="product-card"><a class="product-card-media" href="#/product/${p.id}/edit">${p.photos&&p.photos[0]?`<img src="${esc(mediaUrl(p.photos[0]))}" alt="${esc(p.title)}" loading="lazy">`:`<span>${ic('box')}</span>`}</a><div class="product-card-body"><div class="product-card-meta"><span class="product-status ${p.status}">${PRODUCT_STATUS[p.status]}</span>${p.category?`<span>${esc(p.category)}</span>`:''}</div><h2><a href="#/product/${p.id}/edit">${esc(p.title)}</a></h2><b class="product-price">${esc(productPrice(p))}</b><div class="product-card-actions"><a class="btn ghost" href="#/product/${p.id}/edit">Manage</a>${p.status==='published'?`<a class="btn ghost" href="#/p/${p.id}">View page</a>`:''}</div></div></article>`).join(''):'<div class="empty"><p>No products match this filter.</p></div>'};
  if($('#product-search')){$$('.product-count').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('.product-count').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw()});$('#product-search').oninput=e=>{query=e.target.value.trim().toLowerCase();draw()};draw()}
  $$('[data-req-accept]').forEach(b=>b.onclick=async()=>{try{await Store.sellerRequestAction(b.dataset.reqAccept,'accept');note('Request accepted');ProductsLanding()}catch(e){fail(e)}});
  $$('[data-req-decline]').forEach(b=>b.onclick=async()=>{try{await Store.sellerRequestAction(b.dataset.reqDecline,'decline');note('Request declined');ProductsLanding()}catch(e){fail(e)}});
  $$('[data-req-counter]').forEach(b=>b.onclick=async()=>{try{const v=await ask({title:'Make a counter-offer',body:'Enter your price per item.',input:{label:'Counter-offer',max:20},ok:'Send offer'});if(v===null)return;await Store.sellerRequestAction(b.dataset.reqCounter,'counter',{price:v});note('Counter-offer sent');ProductsLanding()}catch(e){fail(e)}});
  $$('[data-req-convert]').forEach(b=>b.onclick=async()=>{try{if(!await ask({title:'Create a Dealpin deal?',body:'This creates a separate deal using the accepted request terms.',ok:'Create deal'}))return;const d=await Store.createDealFromRequest(b.dataset.reqConvert);note('Deal created');go('/deal/'+d.id)}catch(e){fail(e)}});
  watch(()=>ProductsLanding());
}

async function ProductEditor(id){
  const existing=id?await Store.getProduct(id):null;if(id&&!existing)return missing('This product could not be found in your catalogue.');
  const p=existing||{title:'',description:'',category:'',price:'',currency:REGION.currency,photos:[],status:'draft',available:true};let photos=(p.photos||[]).slice();
  view(`<div class="product-editor"><a class="back" href="#/products">Back to products</a><div class="dashboard-head"><div><p class="eyebrow">${id?'EDIT LISTING':'NEW LISTING'}</p><h1>${id?'Edit product':'Add a product'}</h1><p class="sub">Create a clear listing customers can view and share.</p></div>${id?`<span class="product-status ${p.status}">${PRODUCT_STATUS[p.status]}</span>`:''}</div>
  <form id="product-form" class="card product-form" novalidate>
    <div class="field"><label for="pt">Product name</label><input id="pt" value="${esc(p.title)}" maxlength="100" required></div>
    <div class="field"><label for="pd">Description</label><textarea id="pd" rows="5" maxlength="2000">${esc(p.description)}</textarea><p class="help">Up to 2,000 characters. Describe the condition, size, features and what is included. Avoid private customer information.</p></div>
    <div class="product-form-row"><div class="field"><label for="pc">Category</label><input id="pc" value="${esc(p.category)}" maxlength="40"></div><div class="field"><label for="pp">Price</label><input id="pp" type="number" min="0.001" step="0.001" value="${esc(p.price)}" inputmode="decimal" required></div><div class="field"><label for="pcur">Currency</label><select id="pcur">${currencyOptions()}</select></div></div>
    <div class="field"><label for="pim">Product photos (up to 5)</label><input id="pim" type="file" accept="image/*" multiple><div id="product-photo-preview" class="product-photo-preview"></div><p class="help">Use bright, clear photos. Images are resized before upload.</p></div>
    <div class="field"><label for="pstatus">Listing status</label><select id="pstatus"><option value="draft">Save as draft</option><option value="published">Publish listing</option><option value="paused">Pause listing</option></select></div>
    <label class="product-availability"><input id="pavailable" type="checkbox" ${p.available?'checked':''}> Product is currently available</label>
    <div class="actions"><button class="btn" type="submit">${id?'Save changes':'Save product'}</button><a class="btn ghost" href="#/products">Cancel</a></div>
  </form>${id?`<div class="actions product-danger"><button class="btn bad" id="delete-product" type="button">Delete product</button></div>`:''}</div>`);
  $('#pcur').value=p.currency||REGION.currency;$('#pstatus').value=p.status||'draft';
  const draw=()=>{$('#product-photo-preview').innerHTML=photos.map((x,i)=>`<button class="product-photo-thumb" type="button" data-photo="${i}" aria-label="Remove photo ${i+1}"><img src="${esc(mediaUrl(x))}" alt=""><span>×</span></button>`).join('')||'<span class="help">No photos added yet.</span>';$$('[data-photo]').forEach(b=>b.onclick=()=>{photos.splice(+b.dataset.photo,1);draw()})};draw();
  $('#pim').onchange=async e=>{try{for(const f of [...e.target.files].slice(0,5-photos.length))photos.push(await shrink(f));draw()}catch(x){fail(x)}e.target.value=''};
  if(!id){const dr=draftLoad('product');if(dr){Object.entries(dr.v).forEach(([fid,val])=>{const el=$('#'+fid);if(el&&val!=='')el.value=val});note('Draft restored. Nothing is lost if the connection drops.')}draftWire('product',['pt','pd','pc','pp','pcur'])}
  submit('#product-form',async()=>{const f={title:$('#pt').value.trim(),description:$('#pd').value.trim(),category:$('#pc').value.trim(),price:roundMoney($('#pp').value,$('#pcur').value),currency:$('#pcur').value,photos,status:$('#pstatus').value,available:$('#pavailable').checked};if(!f.title)return bad('#pt','Enter a product name.');if(!(f.price>0)||f.price>MAX_PRICE)return bad('#pp','Enter a valid price above 0.');const saved=await Store.saveProduct(f,id);if(!id)draftClear('product');note(f.status==='published'?'Product published':id?'Product updated':'Product saved');go('/product/'+saved.id+'/edit')});
  tap('#delete-product',async()=>{if(await ask({title:'Delete this product?',body:'This removes the listing from your catalogue. It does not delete any deals already created separately.',ok:'Delete product',danger:true})){await Store.deleteProduct(id);note('Product deleted');go('/products')}});
}

async function BuyerProductRequest(id){
  const r=await Store.getProductRequest(id);if(!r)return missing(DEALPIN.mode==='supabase'?'This request link is not valid.':'This request could not be found on this device.');
  view(`<div class="narrow"><a class="back" href="#/explore">Back to Explore</a><div class="card"><p class="eyebrow">PURCHASE REQUEST</p><h1>${esc(r.productTitle)}</h1><p class="sub">Request ${esc(r.id)}</p><div class="request-summary"><p><b>${r.quantity} × ${esc(money(r.offer,r.currency))}</b></p><p>Buyer: ${esc(r.buyerName)}</p><p>Contact: ${esc(r.phone)}</p><p>Status: <span class="product-status ${r.status==='accepted'?'published':r.status==='declined'?'paused':'draft'}">${esc(r.status)}</span></p></div>${r.counter?`<div class="card"><p class="eyebrow">SELLER COUNTER-OFFER</p><h2>${esc(money(r.counter.price,r.currency))} per item</h2><p>${esc(r.counter.message||'The seller suggested a different price.')}</p><div class="actions"><button class="btn" id="buyer-accept-counter" type="button">Accept counter-offer</button><button class="btn bad" id="buyer-decline-counter" type="button">Decline</button></div></div>`:''}${r.dealId?`<a class="btn" href="#/deal/${r.dealId}">Open created deal</a>`:''}${['pending','countered'].includes(r.status)?'<div class="actions"><button class="btn ghost" id="buyer-withdraw" type="button">Withdraw request</button></div>':''}<h2>Request history</h2><ol class="request-history">${r.history.map(h=>`<li><b>${esc(h.status)}</b><span>${new Date(h.at).toLocaleString()}</span><p>${esc(h.message||'')}</p></li>`).join('')}</ol></div></div>`);
  tap('#buyer-accept-counter',async()=>{try{await Store.sellerRequestAction(id,'buyerAccept');note('Counter-offer accepted');BuyerProductRequest(id)}catch(e){fail(e)}});
  tap('#buyer-withdraw',async()=>{if(!await ask({title:'Withdraw this request?',body:'The seller will see that you withdrew it.',ok:'Withdraw',danger:true}))return;await Store.sellerRequestAction(id,'buyerWithdraw');note('Request withdrawn');BuyerProductRequest(id)});
  tap('#buyer-decline-counter',async()=>{try{await Store.sellerRequestAction(id,'buyerDecline');note('Counter-offer declined');BuyerProductRequest(id)}catch(e){fail(e)}});
  watch(()=>BuyerProductRequest(id));
}

async function PublicProduct(id){
  const p=await Store.publicProduct(id);if(!p)return missing('This product is unavailable or is no longer published.',false);
  const seller=p.seller&&p.seller.name?`<p class="product-seller">Listed by <b>${esc(p.seller.name)}</b>${p.seller.handle?` · <a href="#/u/${esc(p.seller.handle)}">View seller record</a>`:''}</p>${Trust.line(p.trust)}`:'';
  const photosHtml=p.photos&&p.photos.length?p.photos.map(x=>`<img src="${esc(mediaUrl(x))}" alt="${esc(p.title)}" loading="lazy">`).join(''):`<div class="product-image-placeholder">${ic('box')}</div>`;
  const description=esc(p.description||'No description provided.').replace(/\n/g,'<br>');
  view(`<article class="public-product"><a class="back" href="#/explore">Back to Explore</a><div class="public-product-layout"><div class="public-product-gallery">${photosHtml}</div><div class="public-product-info"><p class="eyebrow">${esc(p.category||'DEALPIN PRODUCT')}</p><h1>${esc(p.title)}</h1><p class="public-product-price">${esc(productPrice(p))}</p>${seller}<p class="public-product-description">${description}</p><span class="product-status published">Available</span><div class="card product-note"><b>Interested in this product?</b><p>Send a purchase request. The seller can accept, decline or suggest a different price. No deal is created until the request is accepted.</p>
  <form id="product-request-form" class="product-request-form" novalidate>
    <div class="field"><label for="buyer-name">Your name</label><input id="buyer-name" maxlength="60" required ></div>
    <div class="field"><label for="buyer-phone">Phone / WhatsApp</label><input id="buyer-phone" type="tel" maxlength="24" required></div>
    <div class="product-form-row"><div class="field"><label for="request-qty">Quantity</label><input id="request-qty" type="number" min="1" max="999" value="1" required></div><div class="field"><label for="request-offer">Offer per item (${esc(p.currency)})</label><input id="request-offer" type="number" min="0.001" step="0.001" value="${esc(p.price)}" required></div></div>
    <div class="field"><label for="request-message">Message (optional)</label><textarea id="request-message" rows="3" maxlength="600"></textarea></div>
    <button class="btn block" type="submit">Send purchase request</button>
  </form></div><div class="actions product-share"><button class="btn ghost" id="share-product" type="button">Copy product link</button><a class="btn ghost" id="share-product-wa" target="_blank" rel="noopener" href="${'https://wa.me/?text='+encodeURIComponent(`${p.title} · ${productPrice(p)}\n${link('p',p.id)}`)}">Share on WhatsApp</a></div></div></div></article>`);
  submit('#product-request-form',async()=>{const r=await Store.createProductRequest(p.id,{buyerName:$('#buyer-name').value,phone:$('#buyer-phone').value,quantity:$('#request-qty').value,offer:$('#request-offer').value,message:$('#request-message').value});note('Purchase request sent');const ref=r.ref||r.id,online=DEALPIN.mode==='supabase';view(`<div class="narrow"><div class="card"><p class="eyebrow">REQUEST SENT</p><h1>Request submitted</h1><p>Your request for ${esc(p.title)} ${online?'was sent to the seller.':'is saved on this device. The seller can now review it.'}</p><p><b>Request reference:</b> ${esc(r.id)}</p>${online?'<p class="help">Save the status link below. It is the only way to check your request, answer a counter-offer or withdraw. Anyone with the link can see the request.</p>':''}<p>Status: <span class="product-status draft">Pending</span></p><div class="actions"><a class="btn" href="#/request/${esc(ref)}">View request status</a>${online?'<button class="btn ghost" id="copy-request" type="button">Copy status link</button>':''}<a class="btn ghost" href="#/explore">Back to Explore</a></div></div></div>`);on('#copy-request',()=>copy(link('request',ref),'Status link'))});
  on('#share-product',()=>copy(link('p',p.id),'Product link'));
}

/* Activity: every change on your deals, newest first. A change is unread when it is newer than the last time this device opened Activity. */
const EVENT_TEXT={created:'Deal created',agreed:'Buyer agreed',shipped:'Marked as shipped',received:'Buyer confirmed receipt',disputed:'Buyer raised a dispute',cancelled:'Deal cancelled',resolved:'Dispute resolved'};
const seenAt=()=>{try{const v=+localStorage.getItem('dealpin.seenAt');if(v)return v;const now=Date.now();localStorage.setItem('dealpin.seenAt',String(now));return now}catch{return Date.now()}};
const markSeen=()=>{try{localStorage.setItem('dealpin.seenAt',String(Date.now()))}catch{}};
async function paintBell(){
  try{
    const seen=seenAt();
    const deals=await Store.listDeals();
    const ev=deals.reduce((a,d)=>a+(d.events||[]).filter(e=>e.at>seen).length,0);
    const anns=(await Store.announcements().catch(()=>[])).filter(x=>Date.parse(x.created_at)>seen).length;
    const n=ev+anns;
    const b=$('#bell-count');
    if(b){b.textContent=n>99?'99+':String(n);b.hidden=!n;b.parentElement.setAttribute('aria-label',n?`Activity, ${n} new`:'Activity')}
  }catch{}
}
async function Activity(){
  const s=await Store.getSeller();if(!s.name)return go('/welcome');
  const seen=seenAt();
  const rows=(await Store.listDeals()).flatMap(d=>(d.events||[]).map(e=>({d,e}))).sort((a,b)=>b.e.at-a.e.at).slice(0,60);
  const anns=await Store.announcements().catch(()=>[]);
  view(`<h1>Activity</h1><p class="sub">Every change on your deals, newest first.</p>
  ${anns.length?`<section class="anns" aria-label="Announcements">${anns.map(a=>`<article class="card ann${a.pinned?' pinned':''}"><h2>${esc(a.title)}</h2><p>${esc(a.body)}</p><p class="help">${esc(new Date(a.created_at).toLocaleString())}</p></article>`).join('')}</section>`:''}
  ${rows.length?`<ul class="list activity-list">${rows.map(({d,e})=>{const isNew=e.at>seen;return `<li><a class="row activity-row${isNew?' unread':''}" href="#/deal/${encodeURIComponent(d.id)}"><div><b>${isNew?'<span class="sr-only">New: </span>':''}${esc(EVENT_TEXT[e.s]||STATUS[e.s]||e.s)}</b><small>${esc(d.title)} · ${esc(when(e.at))}</small></div></a></li>`}).join('')}</ul>`:'<div class="card"><p>Nothing yet. Changes on your deals appear here.</p></div>'}`);
  markSeen();paintBell();
  watch(()=>Activity());
}

/* Drafts: a new deal being typed is kept on this device, so a dropped connection never loses it. Cleared when the deal is created. */
const draftKey=k=>'dealpin.draft.'+k;
const draftSave=(k,v)=>{try{localStorage.setItem(draftKey(k),JSON.stringify({at:Date.now(),v}))}catch{}};
const draftLoad=k=>{try{const r=JSON.parse(localStorage.getItem(draftKey(k))||'null');return r&&r.v?r:null}catch{return null}};
const draftClear=k=>{try{localStorage.removeItem(draftKey(k))}catch{}};
const draftWire=(k,ids)=>{const save=()=>draftSave(k,Object.fromEntries(ids.map(i=>[i,($('#'+i)||{}).value||''])));ids.forEach(i=>{const el=$('#'+i);if(el){el.addEventListener('input',save);el.addEventListener('change',save)}})};

