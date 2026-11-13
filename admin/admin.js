/* Dealpin admin console. Every number and list comes from the database functions in supabase/setup/8-admin-console.sql.
   The database enforces who may see and change anything; this file only draws it. */
(()=>{'use strict';
const C=window.DEALPIN||{}, BASE=C.url||'', KEY=C.anonKey||'';
const SK='dp.admin.session', IDLE_MS=15*60e3, POLL_MS=5000, HEALTH_MS=30000;
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v||0).toLocaleString();
const money=(v,c)=>(c?c+' ':'')+Number(v||0).toLocaleString();
const when=t=>{if(!t)return '—';const d=new Date(typeof t==='number'?t:t);return isNaN(d)?'—':d.toLocaleString([],{dateStyle:'medium',timeStyle:'short'})};
const ago=t=>{if(!t)return 'never';const s=(Date.now()-new Date(t))/1e3;if(s<90)return 'just now';if(s<3600)return Math.round(s/60)+' min ago';if(s<86400)return Math.round(s/3600)+' h ago';return Math.round(s/86400)+' d ago'};
const bytes=b=>{b=Number(b||0);if(b>=1e9)return (b/1e9).toFixed(2)+' GB';if(b>=1e6)return (b/1e6).toFixed(1)+' MB';if(b>=1e3)return (b/1e3).toFixed(1)+' KB';return b+' B'};
const STATUS_TONE={created:'info',agreed:'info',shipped:'info',received:'ok',resolved:'ok',disputed:'bad',cancelled:'',published:'ok',paused:'warn',draft:'',pending:'warn',countered:'info',accepted:'ok',declined:'bad',converted:'ok'};
const chip=(t,tone)=>`<span class="chip ${tone??STATUS_TONE[t]??''}">${esc(t)}</span>`;

/* ---------- session ---------- */
let sess=null;
const readSess=()=>{try{return JSON.parse(sessionStorage.getItem(SK))}catch{return null}};
const saveSess=s=>{sess=s;try{sessionStorage.setItem(SK,JSON.stringify(s))}catch{}};
const clearSess=()=>{sess=null;try{sessionStorage.removeItem(SK)}catch{}};
const claims=t=>{try{let p=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');p+='='.repeat((4-p.length%4)%4);return JSON.parse(atob(p))}catch{return {}}};
const setTokens=j=>{const p=claims(j.access_token);saveSess({access:j.access_token,refresh:j.refresh_token,exp:Date.now()+(j.expires_in||3600)*1000,aal:p.aal||'aal1',uid:p.sub||''})};

async function http(path,{method='GET',body,token}={}){
  const h={apikey:KEY};
  if(body!==undefined)h['Content-Type']='application/json';
  if(token)h.Authorization='Bearer '+token;
  let r;
  try{r=await fetch(BASE+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)})}
  catch{throw Object.assign(new Error('No connection to the server. Check the network and try again.'),{network:true})}
  let j=null;try{j=await r.json()}catch{}
  if(!r.ok){const e=new Error((j&&(j.msg||j.message||j.error_description||j.error))||('Request failed ('+r.status+')'));e.status=r.status;e.code=j&&j.code;throw e}
  return j;
}
async function refresh(){
  if(!sess||!sess.refresh)return signOut('Your session ended. Sign in again.');
  try{setTokens(await http('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:sess.refresh}}))}
  catch(e){if(e.network)throw e;signOut('Your session ended. Sign in again.')}
}
async function authed(path,opts={}){
  if(sess&&sess.exp-Date.now()<60e3)await refresh();
  if(!sess)throw new Error('Not signed in.');
  try{return await http(path,{...opts,token:sess.access})}
  catch(e){if(e.status===401&&!e.network){await refresh();if(!sess)throw e;return http(path,{...opts,token:sess.access})}throw e}
}
const rpc=(fn,args={})=>authed('/rest/v1/rpc/'+fn,{method:'POST',body:args}).catch(e=>{if(e.code==='P0002')throw Object.assign(new Error('Access denied.'),{denied:true});throw e});
function signOut(msg){clearSess();stopPolling();if(msg)sessionStorage.setItem('dp.admin.msg',msg);location.hash='';boot(true)}

let lastAct=Date.now();
['pointerdown','keydown','scroll'].forEach(e=>addEventListener(e,()=>{lastAct=Date.now()},{passive:true}));
setInterval(()=>{if(sess&&Date.now()-lastAct>IDLE_MS)signOut('Signed out after 15 minutes without activity.')},30e3);

/* ---------- UI helpers ---------- */
const app=$('#app'), modalRoot=$('#modal');
function toast(msg,tone=''){const t=document.createElement('div');t.className='toast '+tone;t.textContent=msg;$('#toasts').appendChild(t);setTimeout(()=>t.remove(),5200)}
function resolveDeal(id,st,title){
  const res=st==='resolved';
  openModal((res?'Resolve ':'Cancel ')+'disputed deal',`<p class="help"><b>${esc(title)}</b>. ${res?'The deal is marked resolved for the seller and the buyer.':'The deal is cancelled for the seller and the buyer. Dealpin does not move money, so nothing is refunded here.'}</p>`,
    {ok:res?'Resolve':'Cancel deal',danger:!res,onSubmit:async d=>{
      await rpc('admin_resolve_deal',{p_id:id,p_status:st,p_reason:d.reason});
      toast((res?'Resolved: ':'Cancelled: ')+title+'.');route()}});
}
function oneSuspend(id,name,on){
  openModal((on?'Reinstate ':'Suspend ')+name,`<p class="help">${on?'This seller can sign in again.':'This seller cannot sign in, and their current sessions end at once.'}</p>`,
    {ok:on?'Reinstate':'Suspend',danger:!on,onSubmit:async d=>{
      await rpc('admin_set_suspended',{p_id:id,p_on:on,p_reason:d.reason});
      toast((on?'Reinstated ':'Suspended ')+name+'.');route()}});
}
function bulkRun(on){
  const ids=[...document.querySelectorAll('#view .pick:checked')].map(c=>c.dataset.id);
  if(!ids.length)return;
  openModal((on?'Reinstate ':'Suspend ')+ids.length+(ids.length===1?' seller':' sellers'),
    `<p class="help">${on?'These sellers can sign in again.':'These sellers cannot sign in, and their current sessions end at once. Admin accounts are skipped.'}</p>`,
    {ok:on?'Reinstate':'Suspend',danger:!on,onSubmit:async d=>{
      const r=await rpc('admin_bulk_set_suspended',{p_ids:ids,p_on:on,p_reason:d.reason});
      toast(`${on?'Reinstated':'Suspended'} ${r.done}${r.skipped?`, skipped ${r.skipped}`:''}.`);route()}});
}
function openModal(title,bodyHTML,{ok='Confirm',danger=false,onSubmit,needReason=true,reasonLabel='Reason (kept in the audit trail)'}){
  modalRoot.hidden=false;
  modalRoot.innerHTML=`<form class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">${esc(title)}</h2>${bodyHTML}
    ${needReason?`<div class="field"><label for="mr">${esc(reasonLabel)}</label><textarea id="mr" maxlength="300" required minlength="3"></textarea></div>`:''}
    <p class="err" id="me" role="alert"></p>
    <div class="row"><button class="btn ghost" type="button" id="mc">Cancel</button><button class="btn ${danger?'danger':''}" type="submit" id="mo">${esc(ok)}</button></div></form>`;
  const close=()=>{modalRoot.hidden=true;modalRoot.innerHTML=''};
  $('#mc').onclick=close;
  modalRoot.onkeydown=e=>{if(e.key==='Escape')close()};
  const f=modalRoot.querySelector('form');
  f.onsubmit=async e=>{e.preventDefault();const b=$('#mo');b.disabled=true;
    try{const reason=needReason?$('#mr').value.trim():'';if(needReason&&reason.length<3)throw new Error('Give a reason (at least 3 characters).');
      const fd=Object.fromEntries(new FormData(f).entries());
      await onSubmit({...fd,reason});close()}
    catch(err){$('#me').textContent=err.message;b.disabled=false}};
  const first=f.querySelector('input,select,textarea');first&&first.focus();
}
function table(cols,rows,{rowLink,empty='Nothing to show yet.'}={}){
  if(!rows.length)return `<div class="empty">${esc(empty)}</div>`;
  const head=cols.map(c=>`<th class="${c.num?'num':''} ${c.hide?'hide-sm':''}">${esc(c.label)}</th>`).join('');
  const body=rows.map(r=>{const href=rowLink?rowLink(r):null;
    return `<tr class="${href?'click':''}"${href?` data-href="${esc(href)}" tabindex="0"`:''}>`+cols.map(c=>`<td class="${c.num?'num':''} ${c.hide?'hide-sm':''}" data-label="${esc(c.label)}">${c.html?c.html(r):esc(c.get?c.get(r):r[c.key])}</td>`).join('')+'</tr>'}).join('');
  return `<div class="tablewrap stack"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function wireRows(root=app){root.querySelectorAll('tr[data-href]').forEach(tr=>{const go=()=>{location.hash=tr.dataset.href};tr.onclick=e=>{if(!e.target.closest('button,a,input,label'))go()};tr.onkeydown=e=>{if(e.key==='Enter')go()}})}
function pager(total,off,lim,base){const from=total?off+1:0,to=Math.min(off+lim,total);
  return `<div class="pager"><span>${num(from)}–${num(to)} of ${num(total)}</span><span class="actions"><button class="btn ghost sm" data-off="${Math.max(0,off-lim)}" ${off<=0?'disabled':''}>Previous</button><button class="btn ghost sm" data-off="${off+lim}" ${off+lim>=total?'disabled':''}>Next</button></span></div>`}
function wirePager(root,fn){root.querySelectorAll('[data-off]').forEach(b=>b.onclick=()=>fn(Number(b.dataset.off)))}
function kpi(label,value,sub,href,tone=''){const inner=`<div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${sub}</div>`;
  return `<div class="card kpi ${tone}">${href?`<a href="${esc(href)}">${inner}</a>`:inner}</div>`}
function csv(name,cols,rows){const esc2=v=>{const s=v==null?'':String(v);return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  const text=[cols.map(c=>c.label).join(',')].concat(rows.map(r=>cols.map(c=>esc2(c.get?c.get(r):r[c.key])).join(','))).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'}));a.download=name+'-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800)}
function bars(labels,series,{h=180}={}){const W=640,H=h,pad=28,max=Math.max(1,...series.flatMap(s=>s.values));const n=labels.length,gw=(W-pad*2)/Math.max(n,1);
  const colors=['var(--brand)','var(--pin)','var(--info)','var(--bad)'];
  let g='';labels.forEach((l,i)=>{const x=pad+i*gw;series.forEach((s,k)=>{const v=s.values[i]||0;const bh=(v/max)*(H-pad*2);const bw=Math.max(2,(gw-4)/series.length);
    g+=`<rect x="${(x+2+k*bw).toFixed(1)}" y="${(H-pad-bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${colors[k%4]}" rx="2"><title>${esc(l)} · ${esc(s.name)}: ${num(v)}</title></rect>`});
    if(i%Math.ceil(n/8)===0)g+=`<text x="${(x+gw/2).toFixed(1)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`});
  g+=`<line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="var(--line)"/><text x="4" y="${pad}">${num(max)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart">${g}</svg><div class="legend">${series.map((s,k)=>`<span><i class="c${k%4}"></i>${esc(s.name)}</span>`).join('')}</div>`}
function loading(){app.querySelector('#view').innerHTML='<div class="card"><div class="skel"></div><div class="skel" class="skel w70"></div><div class="skel" class="skel w85"></div></div>'}
function errorCard(e){return `<div class="card"><h2>Could not load this page</h2><p class="err">${esc(e.message)}</p><button class="btn ghost" id="retry">Try again</button></div>`}

/* ---------- auth screens ---------- */
function loginScreen(msg){
  document.body.dataset.screen='login';
  app.hidden=false;app.innerHTML=`<div class="login"><form class="login-card" id="lf">
    <h1>Dealpin Admin</h1><p class="sub">Sign in with your admin account.</p>
    ${msg?`<p class="err" role="alert">${esc(msg)}</p>`:''}
    <div class="field"><label for="le">Email</label><input id="le" type="email" autocomplete="username" required></div>
    <div class="field"><label for="lp">Password</label><input id="lp" type="password" autocomplete="current-password" required></div>
    <p class="err" id="lerr" role="alert"></p>
    <button class="btn block" id="lb" type="submit">Sign in</button></form></div>`;
  $('#lf').onsubmit=async e=>{e.preventDefault();const b=$('#lb');b.disabled=true;$('#lerr').textContent='';
    try{await http('/auth/v1/token?grant_type=password',{method:'POST',body:{email:$('#le').value.trim(),password:$('#lp').value}}).then(setTokens);
      sessionStorage.setItem('dp.admin.email',$('#le').value.trim());boot(false)}
    catch(err){$('#lerr').textContent=err.network?err.message:'Sign-in failed. Check the email and password.';b.disabled=false}};
}

/* ---------- live feed ---------- */
let lastId=0, pollTimer=null, healthTimer=null, unseen=0, liveRows=[];
const seenIds=new Set();
function stopPolling(){clearInterval(pollTimer);clearInterval(healthTimer);pollTimer=healthTimer=null;lastId=0;unseen=0;liveRows=[];seenIds.clear()}
const critical=e=>['suspend','moderate','grant','revoke','edit'].includes(e.action)||/Deal status: .* to disputed|Request: .* to accepted/.test(e.summary||'');
async function pollFeed(){
  try{
    const rows=await rpc('admin_events_feed',{p_after:lastId,p_before:null,p_limit:100,p_action:'',p_entity:''});
    if(!rows||!rows.length)return;
    rows.forEach(e=>{if(!seenIds.has(e.id)){seenIds.add(e.id);liveRows.unshift(e)}lastId=Math.max(lastId,e.id);if(critical(e)&&lastId>0)toast(e.summary+(e.reason?' — '+e.reason:''),e.action==='suspend'?'bad':'warn')});
    liveRows=liveRows.slice(0,200);
    const onLive=(location.hash||'').startsWith('#/live');
    if(onLive){const feed=$('#feed');if(feed)feed.innerHTML=feedHTML(liveRows.slice(0,100),true);$('#lupd')&&($('#lupd').textContent='Updated just now')}
    else{unseen+=rows.length;const b=$('#nav-live');if(b){b.textContent=unseen;b.classList.toggle('zero',unseen===0)}}
  }catch(e){if(e.denied)signOut('Access was removed.')}
}
async function pollHealth(){
  try{const h=await rpc('admin_health');const map={};h.forEach(x=>map[x.key]=x);
    const cr=$('#nav-crash');if(cr){const n=map.crashes1h?map.crashes1h.count:0;cr.textContent=n;cr.classList.toggle('zero',!n)}
    const dp=$('#nav-disp');if(dp){const n=map.disputed?map.disputed.count:0;dp.textContent=n;dp.classList.toggle('zero',!n)}
  }catch{}
}
function startPolling(){stopPolling();pollFeed().then(()=>{}).catch(()=>{});pollTimer=setInterval(pollFeed,POLL_MS);pollHealth();healthTimer=setInterval(pollHealth,HEALTH_MS)}
function feedHTML(rows,fresh){
  if(!rows.length)return '<div class="empty">No activity yet. Every change and every admin action appears here as it happens.</div>';
  return '<ul class="feed">'+rows.map((e,i)=>`<li class="${fresh&&i<3?'fresh':''}"><span class="chip ${e.action==='suspend'||e.action==='revoke'?'bad':e.action==='moderate'||e.action==='edit'?'warn':e.action==='view'||e.action==='search'?'':'info'}">${esc(e.action)}</span><div><div class="sum">${esc(e.summary)}</div>${e.reason?`<div class="meta">Reason: ${esc(e.reason)}</div>`:''}<div class="meta">${esc(e.actor_email||'System')} · ${esc(e.entity)}${e.entity_id?' · <span class="mono">'+esc(e.entity_id)+'</span>':''} · ${esc(when(e.at))}</div></div></li>`).join('')+'</ul>'}

/* ---------- pages ---------- */
const P={};
P.overview=async()=>{
  const [ov,tr,hl,fd]=await Promise.all([rpc('admin_overview'),rpc('admin_trends',{p_days:30}),rpc('admin_health'),rpc('admin_events_feed',{p_after:0,p_before:null,p_limit:8,p_action:'',p_entity:''})]);
  const u=ov.users||{}, d=ov.deals||{}, st=d.by_status||{};
  const crashes=hl.find(x=>x.key==='crashes1h')||{count:0};
  const attn=hl.filter(x=>x.count>0&&x.key!=='admins').map(x=>`<li class="${x.severity==='high'?'hot':x.severity==='medium'?'med':''}"><span>${esc(x.label)}</span><strong>${num(x.count)}</strong></li>`).join('');
  return `<div class="page-head"><div><h1>Overview</h1><p>Live figures for the whole app. Updated when you open this page.</p></div><span class="live"><i></i><span class="t">Live</span></span></div>
  <div class="grid kpis">
    ${kpi('Sellers',num(ov.sellers),`${num(u.new_7d)} joined in 7 days`,'#/users')}
    ${kpi('Active 24 h',num(u.active_24h),`${num(u.active_7d)} in 7 days · ${num(u.active_30d)} in 30`,'#/users')}
    ${kpi('Accounts',num(u.total),`${num(u.confirmed)} confirmed · ${num(u.never_signed_in)} never signed in`,'#/users')}
    ${kpi('Deals',num(d.total),`${num(d.last_24h)} in 24 h · ${num(d.last_7d)} in 7 days`,'#/deals')}
    ${kpi('Disputed',num(st.disputed||0),'deals waiting on a reply','#/deals?status=disputed',(st.disputed||0)?'bad':'')}
    ${kpi('Products',num(ov.products&&ov.products.total),`${num(ov.products&&ov.products.published)} published`,'#/products')}
    ${kpi('Purchase requests',num(ov.requests),'all time','#/requests')}
    ${kpi('Crash reports, 1 h',num(crashes.count),'from the app','#/crashes',crashes.count?'bad':'')}
    ${kpi('Files stored',num(ov.storage&&ov.storage.files),bytes(ov.storage&&ov.storage.bytes),'')}
    ${kpi('Tool records',num(ov.tools_records),'ledger, invoices, stock and more','')}
  </div>
  <h2 class="section">Trends · 30 days</h2>
  <div class="grid two">
    <div class="card"><div class="card-head"><div><h2>Sign-ups and deals</h2><div class="sub">New accounts and new deals each day</div></div></div>
      ${bars(tr.map(x=>x.d.slice(5)),[{name:'Sign-ups',values:tr.map(x=>x.signups)},{name:'Deals',values:tr.map(x=>x.deals)}])}</div>
    <div class="card"><h2>Needs attention</h2><div class="sub">Open items right now</div>
      ${attn?`<ul class="att">${attn}</ul>`:'<div class="empty">Nothing needs attention.</div>'}
      <p class="help mt">Open <a href="#/system">System</a> for the full list and the app settings check.</p></div>
  </div>
  <div class="grid two mt">
    <div class="card"><div class="card-head"><div><h2>Requests and crashes</h2><div class="sub">Per day, last 30 days</div></div></div>
      ${bars(tr.map(x=>x.d.slice(5)),[{name:'Purchase requests',values:tr.map(x=>x.requests)},{name:'Crash reports',values:tr.map(x=>x.crashes)}])}</div>
    <div class="card"><div class="card-head"><div><h2>Latest activity</h2><div class="sub">Every change, action and view is logged</div></div><a class="btn ghost sm" href="#/live">Open live feed</a></div>${feedHTML(fd,false)}</div>
  </div>`};

P.live=async()=>{
  const rows=await rpc('admin_events_feed',{p_after:0,p_before:null,p_limit:100,p_action:'',p_entity:''});
  rows.forEach(e=>{seenIds.add(e.id);lastId=Math.max(lastId,e.id)});
  liveRows=rows.slice();unseen=0;
  const nb=$('#nav-live');if(nb){nb.textContent='0';nb.classList.add('zero')}
  return `<div class="page-head"><div><h1>Live activity</h1><p>New activity appears here within 5 seconds.</p></div><span class="live"><i></i><span class="t" id="lupd">Live</span></span></div>
  <div class="card"><div class="toolbar"><span class="muted">Newest first. Critical actions also pop up as notices.</span></div><div id="feed">${feedHTML(liveRows.slice(0,100),false)}</div></div>`};

P.users=async(_id,q={})=>{
  const search=q.q||'', off=Number(q.off||0), lim=25;
  const d=await rpc('admin_users',{p_q:search,p_limit:lim,p_offset:off});
  return `<div class="page-head"><div><h1>Sellers</h1><p>Every account on the app. Open one for the full record, or tick several to suspend or reinstate them together.</p></div>
    <button class="btn ghost sm" id="exp-users">Export this page (CSV)</button></div>
  <div class="bulkbar" id="bulk" hidden><span id="bulk-n" aria-live="polite">0 selected</span><button class="btn ghost sm" type="button" id="bulk-all">Select all on this page</button><button class="btn ghost sm" type="button" id="bulk-clear">Clear</button><button class="btn danger sm" type="button" id="bulk-off">Suspend selected</button><button class="btn ghost sm" type="button" id="bulk-on">Reinstate selected</button></div>
  <form class="toolbar" id="uq"><input type="search" name="q" value="${esc(search)}" placeholder="Search by name, shop, handle, email or phone" aria-label="Search sellers"><button class="btn" type="submit">Search</button></form>
  ${table([
    {label:'',html:r=>`<input type="checkbox" class="pick" data-id="${esc(r.id)}" aria-label="Select ${esc(r.shop||r.name||'seller')}"${r.admin?' disabled title="Admin accounts cannot be suspended here"':''}>`},
    {label:'Seller',html:r=>`<strong>${esc(r.shop||r.name||'No name yet')}</strong><div class="muted">${esc(r.handle?'@'+r.handle:'')}</div>`},
    {label:'Email',key:'email',hide:true},{label:'Phone',key:'phone',hide:true},
    {label:'Joined',get:r=>when(r.created),hide:true},
    {label:'Last seen',get:r=>ago(r.seen)},
    {label:'Deals',key:'deals',num:true},{label:'Products',key:'products',num:true},
    {label:'Status',html:r=>r.admin?chip('admin','info'):r.suspended?chip('suspended','bad'):chip('active','ok')},
    {label:'Action',html:r=>r.admin?'<span class="muted">Admin</span>':r.suspended?`<button class="btn sm" type="button" data-one-on="${esc(r.id)}" data-name="${esc(r.shop||r.name||r.email||'this seller')}">Reinstate</button>`:`<button class="btn danger sm" type="button" data-one-off="${esc(r.id)}" data-name="${esc(r.shop||r.name||r.email||'this seller')}">Suspend</button>`}
  ],d.rows,{rowLink:r=>'#/users/'+r.id,empty:search?'No sellers match that search.':'No sellers yet.'})}
  ${pager(d.total,off,lim)}`};

P.user=async(id)=>{
  const u=await rpc('admin_user',{p_id:id});
  const p=u.profile||{};
  const recent=(u.recent_deals||[]);
  return `<div class="page-head"><div><h1>${esc(p.name||u.name||u.email||'Seller')}</h1><p>${esc(p.handle?'@'+p.handle:'No handle yet')} · joined ${esc(when(u.created))} · last sign-in ${esc(ago(u.last_sign_in))}</p></div>
    <div class="actions">${u.suspended?'<button class="btn" id="a-react">Reinstate</button>':'<button class="btn danger" id="a-susp">Suspend</button>'}<button class="btn ghost" id="a-prof">Edit name or payment</button><button class="btn ghost" id="a-tools">Tool records</button></div></div>
  ${u.suspended?'<p class="err">This account is suspended. It cannot sign in.</p>':''}
  ${u.admin?'<p class="help">This account is an administrator.</p>':''}
  <div class="grid two">
    <div class="card"><h2>Account</h2><dl class="kv mt">
      <dt>Email</dt><dd>${esc(u.email||'—')}</dd><dt>Phone</dt><dd>${esc(u.phone||p.phone||'—')}</dd>
      <dt>Sign-in method</dt><dd>${esc(u.method||'—')}</dd><dt>Confirmed</dt><dd>${u.confirmed?'Yes':'No'}</dd>
      <dt>Joined</dt><dd>${esc(when(u.created))}</dd><dt>Last sign-in</dt><dd>${esc(when(u.last_sign_in))}</dd>
      <dt>Payment line</dt><dd>${esc(p.pay||'—')}</dd><dt>Products</dt><dd>${num(u.products)}</dd><dt>Purchase requests</dt><dd>${num(u.requests)}</dd>
    </dl></div>
    <div class="card"><h2>Deals by status</h2><div class="sub">Across all of this seller’s deals</div>
      ${Object.keys(u.deals_by_status||{}).length?`<div class="actions">${Object.entries(u.deals_by_status).map(([k,v])=>chip(k)+' <strong>'+num(v)+'</strong>').join('<span class="muted">·</span>')}</div>`:'<div class="empty">No deals yet.</div>'}
      <h2 class="mt2">Tool records</h2><div class="sub">Ledger, invoices, riders, jobs, settlements, stock and groups</div>
      ${Object.keys(u.tool_records||{}).length?`<div class="actions">${Object.entries(u.tool_records).map(([k,v])=>chip(k,'info')+' <strong>'+num(v)+'</strong>').join(' ')}</div>`:'<div class="empty">No tool records.</div>'}
    </div>
  </div>
  <h2 class="section">Recent deals</h2>
  ${table([{label:'Deal',html:r=>`<strong>${esc(r.title||'Untitled')}</strong><div class="mono muted">${esc(r.id)}</div>`},
    {label:'Price',get:r=>money(r.price,r.currency),num:true},{label:'Status',html:r=>chip(r.status)},{label:'Created',get:r=>when(r.created),hide:true}],recent,{rowLink:r=>'#/deals/'+r.id,empty:'No deals yet.'})}`};

P.deals=async(_id,q={})=>{
  const search=q.q||'', status=q.status||'', off=Number(q.off||0), lim=25;
  const d=await rpc('admin_deals',{p_q:search,p_status:status,p_limit:lim,p_offset:off});
  const opts=['','created','agreed','shipped','received','disputed','cancelled','resolved'].map(s=>`<option value="${s}" ${s===status?'selected':''}>${s?esc(s):'All statuses'}</option>`).join('');
  return `<div class="page-head"><div><h1>Deals</h1><p>Every deal across all sellers. Deals are a record: they can be read here but not edited.</p></div><button class="btn ghost sm" id="exp-deals">Export this page (CSV)</button></div>
  <form class="toolbar" id="dq"><input type="search" name="q" value="${esc(search)}" placeholder="Search by deal id, item, seller or buyer" aria-label="Search deals"><select name="status" aria-label="Status">${opts}</select><button class="btn" type="submit">Filter</button></form>
  ${table([{label:'Deal',html:r=>`<strong>${esc(r.title||'Untitled')}</strong><div class="mono muted">${esc(r.id)}</div>`},
    {label:'Seller',key:'seller',hide:true},{label:'Buyer',get:r=>r.buyer||'—'},
    {label:'Price',get:r=>money(r.price,r.currency),num:true},{label:'Status',html:r=>chip(r.status)},{label:'Created',get:r=>when(r.created),hide:true},
    {label:'Action',html:r=>r.status==='disputed'?`<button class="btn sm" type="button" data-res="${esc(r.id)}" data-st="resolved" data-t="${esc(r.title||'deal')}">Resolve</button> <button class="btn danger sm" type="button" data-res="${esc(r.id)}" data-st="cancelled" data-t="${esc(r.title||'deal')}">Cancel deal</button>`:'<span class="muted">Record</span>'}],d.rows,{rowLink:r=>'#/deals/'+r.id,empty:'No deals match.'})}
  ${pager(d.total,off,lim)}`};

P.deal=async(id)=>{
  const d=await rpc('admin_deal',{p_id:id});const doc=d.doc||{};
  const row=(k,v)=>v===undefined||v===null||v===''?'':`<dt>${esc(k)}</dt><dd>${esc(typeof v==='object'?JSON.stringify(v):v)}</dd>`;
  const b=doc.buyer||{}, pay=doc.payment||{}, arr=doc.arrival||{};
  const events=(doc.events||[]).map(e=>`<li><strong>${esc(e.s)}</strong> <span class="muted">${esc(when(e.at))}</span></li>`).join('');
  return `<div class="page-head"><div><h1>${esc(doc.title||'Deal')}</h1><p class="mono">${esc(d.id)}</p></div>${chip(d.status)}</div>
  <div class="grid two">
    <div class="card"><h2>Deal</h2><dl class="kv mt">${row('Price',money(doc.price,doc.currency))}${row('Delivery',doc.delivery)}${row('Created',when(doc.created))}${row('Terms',doc.terms)}${row('Receipt code',doc.receiptCode||doc.rcode||'')}</dl></div>
    <div class="card"><h2>Seller</h2><dl class="kv mt">${row('Name',(doc.seller||{}).name)}${row('Handle',(doc.seller||{}).handle?'@'+doc.seller.handle:'')}${row('Phone',(doc.seller||{}).phone)}${row('Payment line',(doc.seller||{}).pay)}</dl></div>
    <div class="card"><h2>Buyer</h2><dl class="kv mt">${row('Name',b.name)}${row('Phone',b.phone)}${row('Payment',pay.method?pay.method+(pay.ref?' · ref '+pay.ref:''):'')}${row('Landmark',arr.landmark)}${row('Pin',arr.lat!=null?arr.lat+', '+arr.lng:'')}${row('Rating',doc.rating&&doc.rating.stars?doc.rating.stars+' stars':'')}</dl></div>
    <div class="card"><h2>Timeline</h2>${events?`<ol class="steps">${events}</ol>`:'<div class="empty">No steps yet.</div>'}
      ${doc.dispute?`<h2 class="mt">Dispute</h2><p>${esc(doc.dispute.text||doc.dispute.note||'Reported')}</p>`:''}</div>
  </div>
  ${(d.requests||[]).length?`<h2 class="section">From purchase requests</h2>${table([{label:'Request',key:'id'},{label:'Quantity',key:'quantity',num:true},{label:'Offer',get:r=>money(r.offer,r.currency),num:true},{label:'Status',html:r=>chip(r.status)}],d.requests)}`:''}
  <details><summary>Full record (JSON)</summary><pre>${esc(JSON.stringify(doc,null,2))}</pre></details>`};

P.products=async(_id,q={})=>{
  const search=q.q||'', status=q.status||'', off=Number(q.off||0), lim=25;
  const d=await rpc('admin_products',{p_q:search,p_status:status,p_limit:lim,p_offset:off});
  const opts=['','draft','published','paused'].map(s=>`<option value="${s}" ${s===status?'selected':''}>${s?esc(s):'All statuses'}</option>`).join('');
  return `<div class="page-head"><div><h1>Products</h1><p>Pause a product that breaks the rules, or publish it again. Each change needs a reason.</p></div><button class="btn ghost sm" id="exp-products">Export this page (CSV)</button></div>
  <form class="toolbar" id="pq"><input type="search" name="q" value="${esc(search)}" placeholder="Search by title or id" aria-label="Search products"><select name="status" aria-label="Status">${opts}</select><button class="btn" type="submit">Filter</button></form>
  ${table([{label:'Product',html:r=>`<strong>${esc(r.title)}</strong><div class="muted">${esc(r.shop||'')}</div>`},
    {label:'Price',get:r=>money(r.price,r.currency),num:true},{label:'Status',html:r=>chip(r.status)+(r.available?'':' <span class="chip">unavailable</span>')},
    {label:'Requests',key:'requests',num:true},{label:'Updated',get:r=>ago(r.updated),hide:true},
    {label:'Action',html:r=>r.status==='published'?`<button class="btn ghost sm" data-act="paused" data-id="${esc(r.id)}" data-t="${esc(r.title)}">Pause</button>`:r.status==='paused'?`<button class="btn sm" data-act="published" data-id="${esc(r.id)}" data-t="${esc(r.title)}">Publish</button>`:''}],d.rows,{empty:'No products match.'})}
  ${pager(d.total,off,lim)}`};

P.requests=async(_id,q={})=>{
  const status=q.status||'', off=Number(q.off||0), lim=25;
  const d=await rpc('admin_requests',{p_status:status,p_limit:lim,p_offset:off});
  const opts=['','pending','countered','accepted','declined','converted'].map(s=>`<option value="${s}" ${s===status?'selected':''}>${s?esc(s):'All statuses'}</option>`).join('');
  return `<div class="page-head"><div><h1>Purchase requests</h1><p>Buyers asking sellers for products. Accepted requests become deals.</p></div><button class="btn ghost sm" id="exp-requests">Export this page (CSV)</button></div>
  <form class="toolbar" id="rq"><select name="status" aria-label="Status">${opts}</select><button class="btn" type="submit">Filter</button></form>
  ${table([{label:'Product',get:r=>r.product||'—'},{label:'Buyer',html:r=>`${esc(r.buyer_name)}<div class="muted">${esc(r.buyer_phone)}</div>`},
    {label:'Qty',key:'quantity',num:true},{label:'Offer',get:r=>money(r.offer,r.currency),num:true},{label:'Status',html:r=>chip(r.status)},
    {label:'Created',get:r=>when(r.created),hide:true},{label:'Deal',html:r=>r.deal_id?`<a href="#/deals/${esc(r.deal_id)}">Open deal</a>`:'—',hide:true}],d.rows,{empty:'No requests match.'})}
  ${pager(d.total,off,lim)}`};

P.crashes=async(_id,q={})=>{
  const days=Number(q.days||7), off=Number(q.off||0), lim=50;
  const [groups,list]=await Promise.all([rpc('admin_crash_groups',{p_days:days}),rpc('admin_crashes',{p_limit:lim,p_offset:off,p_kind:''})]);
  return `<div class="page-head"><div><h1>Crash reports</h1><p>Errors from the app. Reports hold no names, numbers or deal data.</p></div>
    <form class="actions" id="cq"><select name="days" aria-label="Period">${[1,7,30].map(d=>`<option value="${d}" ${d===days?'selected':''}>Last ${d} day${d>1?'s':''}</option>`).join('')}</select></form></div>
  <h2 class="section">Grouped by message</h2>
  ${table([{label:'Message',html:r=>`<span class="mono">${esc(r.msg)}</span>`},{label:'Kind',key:'kind',hide:true},{label:'Count',key:'count',num:true},
    {label:'Versions',get:r=>(r.versions||[]).join(', ')||'—',hide:true},{label:'Last seen',get:r=>when(r.last)}],groups,{empty:'No crashes in this period.'})}
  <h2 class="section">Latest reports</h2>
  ${table([{label:'When',get:r=>when(r.created_at)},{label:'Message',html:r=>`<span class="mono">${esc(r.msg)}</span>`},{label:'Page',key:'page',hide:true},{label:'Version',key:'v',hide:true},{label:'Browser',html:r=>`<span class="muted">${esc((r.ua||'').slice(0,60))}</span>`,hide:true}],list.rows,{empty:'No reports.'})}
  ${pager(list.total,off,lim)}`};

P.audit=async(_id,q={})=>{
  const action=q.action||'', entity=q.entity||'', before=q.before?Number(q.before):null, lim=100;
  const rows=await rpc('admin_events_feed',{p_after:0,p_before:before,p_limit:lim,p_action:action,p_entity:entity});
  const last=rows.length?rows[rows.length-1].id:null;
  return `<div class="page-head"><div><h1>Audit trail</h1><p>Every admin action, every change to sellers, deals, products and requests, and every view of personal data.</p></div>
    <button class="btn ghost sm" id="exp-audit">Export loaded rows (CSV)</button></div>
  <form class="toolbar" id="aq"><select name="action" aria-label="Action">${['','suspend','reinstate','moderate','edit','grant','revoke','view','search','insert','update','delete'].map(a=>`<option value="${a}" ${a===action?'selected':''}>${a?esc(a):'All actions'}</option>`).join('')}</select>
    <select name="entity" aria-label="Record type">${['','user','seller','deal','product','request','tools','admin'].map(a=>`<option value="${a}" ${a===entity?'selected':''}>${a?esc(a):'All records'}</option>`).join('')}</select><button class="btn" type="submit">Filter</button></form>
  <div class="card">${feedHTML(rows,false)}</div>
  <div class="pager"><span class="muted">${num(rows.length)} shown</span><span class="actions">${rows.length===lim?`<button class="btn ghost sm" data-before="${last}">Older</button>`:''}</span></div>`};

P.admins=async()=>{
  const rows=await rpc('admin_admins');
  return `<div class="page-head"><div><h1>Admins</h1><p>People who can use this console. Every change needs a reason.</p></div>
    <button class="btn" id="add-admin">Add admin</button></div>
  ${table([{label:'Email',html:r=>`${esc(r.email||'—')}${r.is_me?' <span class="chip info">you</span>':''}`},{label:'Added',get:r=>when(r.added)},
    {label:'Action',html:r=>r.is_me?'<span class="muted">—</span>':`<button class="btn danger sm" data-remove="${esc(r.id)}" data-email="${esc(r.email||'')}">Remove</button>`}],rows,{empty:'No admins.'})}`};

P.system=async()=>{
  const h=await rpc('admin_health');
  const checks=[
    ['Live mode (not local)',C.mode==='supabase'],
    ['Sign-in bypass is off',C.testingBypassAuth===false],
    ['Crash reporting endpoint set',typeof C.errorEndpoint==='string'&&/^https:\/\//.test(C.errorEndpoint)],
    ['Backend address is https',/^https:\/\//.test(C.url||'')]];
  return `<div class="page-head"><div><h1>System</h1><p>Settings check and the current health of the app.</p></div></div>
  <div class="grid two">
    <div class="card"><h2>Settings</h2><div class="sub">From the app configuration this console uses</div>
      <ul class="att">${checks.map(([l,ok])=>`<li class="${ok?'':'hot'}"><span>${esc(l)}</span>${chip(ok?'ok':'check',ok?'ok':'bad')}</li>`).join('')}</ul></div>
    <div class="card"><h2>Health</h2><div class="sub">What needs attention now</div>
      <ul class="att">${h.map(x=>`<li class="${x.count&&x.severity==='high'?'hot':x.count&&x.severity==='medium'?'med':''}"><span>${esc(x.label)}</span><strong>${num(x.count)}</strong></li>`).join('')}</ul></div>
  </div>`};

let annRows=[];
P.maintenance=async()=>{
  const rows=await authed('/rest/v1/app_settings?select=maintenance,message,updated_at&id=eq.1');
  const r=(Array.isArray(rows)&&rows[0])||{maintenance:false,message:''};
  const on=!!r.maintenance;
  return `<div class="page-head"><div><h1>Maintenance</h1><p>Take the whole app down for an update. Sellers, buyers and riders see your message, and the database refuses saves until you bring it back. This console stays open.</p></div></div>
  <div class="card"><p><b>Status:</b> ${on?chip('down','bad'):chip('online','ok')} <span class="muted">Changed ${when(r.updated_at)}</span></p>
  <form id="mt-form" class="stack">
    <div class="field"><label for="mt-msg">Message users will see (up to 200 characters)</label><textarea id="mt-msg" name="message" maxlength="200" rows="3" required>${esc(r.message||'')}</textarea></div>
    <p class="help">Nobody is signed out and no data is lost. The app only pauses until you bring it back.</p>
    <button class="btn ${on?'':'danger'}" type="submit">${on?'Save message':'Take the app down'}</button>
    ${on?'<button class="btn" type="button" id="mt-up">Bring the app back online</button>':''}
  </form></div>`};
function openMaint(on){
  const msg=(document.getElementById('mt-msg')||{value:''}).value.trim();
  if(msg.length<1)return;
  openModal(on?'Take the app down':'Bring the app back online',`<p class="help">${on?'Sellers, buyers and riders see your message at once. Saves are refused until you bring the app back.':'Sellers, buyers and riders can use the app again at once.'}</p>`,
    {ok:on?'Take down':'Bring online',danger:on,onSubmit:async d=>{
      await rpc('admin_set_maintenance',{p_on:on,p_message:msg,p_reason:d.reason});
      toast(on?'App is down for everyone except admins.':'App is back online.');route()}});
}
P.announcements=async()=>{
  const rows=await rpc('admin_announcements'); annRows=rows;
  return `<div class="page-head"><div><h1>Announcements</h1><p>Shown to every signed-in seller in their Activity inbox the moment you publish. Buyers and riders are not accounts, so copy a message and share it on WhatsApp.</p></div>
    <button class="btn" id="new-ann">New announcement</button></div>
  ${table([
    {label:'Title',html:r=>`${esc(r.title)}${r.pinned?' <span class="chip info">pinned</span>':''}`},
    {label:'Message',html:r=>`<span class="muted">${esc(r.body)}</span>`},
    {label:'Status',html:r=>r.live?'<span class="chip info">live</span>':r.active?'<span class="chip">ended</span>':'<span class="chip">off</span>'},
    {label:'Ends',get:r=>r.expires_at?when(r.expires_at):'No end date'},
    {label:'Published',get:r=>when(r.created_at)},
    {label:'Actions',html:r=>`<button class="btn ghost sm" data-edit="${esc(r.id)}">Edit</button> <button class="btn ghost sm" data-copy="${esc(r.id)}">Copy for WhatsApp</button> <button class="btn ghost sm" data-toggle="${esc(r.id)}" data-on="${r.active?'0':'1'}">${r.active?'Switch off':'Switch on'}</button>`}
  ],rows,{empty:'No announcements yet. Publish the first one.'})}`};
function annForm(row){
  openModal(row?'Edit announcement':'New announcement',`
    <div class="field"><label for="at">Title</label><input id="at" name="title" maxlength="80" required value="${esc(row?row.title:'')}"></div>
    <div class="field"><label for="ab">Message (shown in the seller's Activity inbox)</label><textarea id="ab" name="body" maxlength="280" required rows="4">${esc(row?row.body:'')}</textarea></div>
    ${row?'':`<div class="field"><label for="ad">Stays up for</label><select id="ad" name="days"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="">No end date</option></select></div>`}
    <label class="check"><input type="checkbox" name="pinned" value="1" ${row&&row.pinned?'checked':''}> Pin to the top</label>
    <div class="card mt"><b id="apvt"></b><p id="apvb" class="help"></p></div>`,
  {ok:row?'Save':'Publish',onSubmit:async d=>{
    const exp=row?row.expires_at:(d.days?new Date(Date.now()+Number(d.days)*864e5).toISOString():null);
    await rpc('admin_save_announcement',{p_id:row?row.id:null,p_title:d.title,p_body:d.body,p_pinned:!!d.pinned,p_active:row?row.active:true,p_expires_at:exp,p_reason:d.reason});
    toast(row?'Saved. Sellers see the change now.':'Published. Sellers see it now.');route()}});
  const prev=()=>{modalRoot.querySelector('#apvt').textContent=modalRoot.querySelector('#at').value;modalRoot.querySelector('#apvb').textContent=modalRoot.querySelector('#ab').value};
  modalRoot.querySelector('#at').oninput=prev;modalRoot.querySelector('#ab').oninput=prev;prev();
}
async function copyAnn(id){const r=annRows.find(x=>x.id===id);if(!r)return;
  const txt=`${r.title}\n\n${r.body}\n\n— Dealpin`;
  try{await navigator.clipboard.writeText(txt);toast('Copied. Paste it into WhatsApp.')}
  catch{openModal('Copy this message',`<textarea readonly rows="6">${esc(txt)}</textarea>`,{ok:'Close',needReason:false,onSubmit:()=>{}})}}

/* ---------- routing ---------- */
const NAV=[['Monitor',[['overview','Overview'],['live','Live activity','nav-live'],['crashes','Crash reports','nav-crash'],['system','System']]],
  ['Records',[['users','Sellers'],['deals','Deals','nav-disp'],['products','Products'],['requests','Requests']]],
  ['Operations',[['maintenance','Maintenance']]],
  ['Communicate',[['announcements','Announcements']]],
  ['Governance',[['audit','Audit trail'],['admins','Admins']]]];
function shell(){
  app.innerHTML=`<div class="shell"><aside class="side" id="side" aria-label="Admin navigation">
    <div class="brand"><img src="../assets/icon.svg" alt="">Dealpin Admin</div>
    ${NAV.map(([g,items])=>`<div class="grp">${esc(g)}</div>${items.map(([k,l,id])=>`<a href="#/${k}" data-page="${k}">${esc(l)}${id?`<span class="count zero" id="${id}">0</span>`:''}</a>`).join('')}`).join('')}
    <div class="grp">Session</div><a href="#" id="signout">Sign out</a></aside>
    <div class="main"><header class="top"><button class="btn ghost sm menu-btn" id="menu" aria-controls="side" aria-expanded="false">Menu</button>
      <form class="search" id="gs" role="search"><input type="search" name="q" placeholder="Find a seller by name, email or phone" aria-label="Find a seller"><button class="btn sm" type="submit">Find</button></form>
      <div class="grow"></div><span class="live"><i></i><span class="t">Live</span></span><span class="muted hide-sm" id="who"></span></header>
    <main class="content" id="view" tabindex="-1"></main></div></div>`;
  $('#menu').onclick=()=>{const s=$('#side');const o=s.classList.toggle('open');$('#menu').setAttribute('aria-expanded',o)};
  $('#signout').onclick=e=>{e.preventDefault();signOut('')};
  $('#gs').onsubmit=e=>{e.preventDefault();const q=new FormData(e.target).get('q').trim();location.hash='#/users?q='+encodeURIComponent(q)};
  $('#who').textContent=sessionStorage.getItem('dp.admin.email')||'';
}
const parse=()=>{const h=(location.hash||'#/overview').slice(2);const [path,qs]=h.split('?');const parts=path.split('/');const q=Object.fromEntries(new URLSearchParams(qs||''));return {page:parts[0]||'overview',id:parts[1]||null,q}};
async function route(){
  if(!sess||document.body.dataset.screen!=='app')return;
  const {page,id,q}=parse();
  const key=id&&page==='users'?'user':id&&page==='deals'?'deal':page;
  document.querySelectorAll('.side a[data-page]').forEach(a=>{a.toggleAttribute('aria-current',a.dataset.page===page)});
  $('#side').classList.remove('open');
  const view=$('#view');
  loading();
  try{
    let html;
    if(key==='user'){html=await P.user(id)}
    else if(key==='deal'){html=await P.deal(id)}
    else if(P[key]&&key!=='user'&&key!=='deal'){html=await P[key](id,q)}
    else{html='<div class="card"><h2>Not found</h2><p>That page does not exist.</p></div>'}
    if(!sess)return;
    view.innerHTML=html;wire(key,id,q);
  }catch(e){
    if(e.denied)return signOut('Access denied. Your account is not an active administrator.');
    view.innerHTML=errorCard(e);$('#retry').onclick=route;
  }
}
const go=(h)=>{location.hash=h};
function wire(page,id,q){
  const view=$('#view');wireRows(view);
  const fr=(el,fn)=>{el&&(el.onsubmit=e=>{e.preventDefault();fn(new FormData(e.target))})};
  fr($('#uq'),f=>go('#/users?q='+encodeURIComponent(f.get('q').trim())));
  fr($('#dq'),f=>go('#/deals?'+new URLSearchParams({q:f.get('q').trim(),status:f.get('status')})));
  fr($('#pq'),f=>go('#/products?'+new URLSearchParams({q:f.get('q').trim(),status:f.get('status')})));
  fr($('#rq'),f=>go('#/requests?'+new URLSearchParams({status:f.get('status')})));
  fr($('#aq'),f=>go('#/audit?'+new URLSearchParams({action:f.get('action'),entity:f.get('entity')})));
  const cq=$('#cq');if(cq)cq.querySelector('select').onchange=e=>go('#/crashes?days='+e.target.value);
  const fill=(id2,fn)=>{const el=$(id2);if(el)el.onclick=fn};
  if(page==='users'){wirePager(view,off=>go('#/users?'+new URLSearchParams({q:q.q||'',off})));
    const syncBulk=()=>{const n=view.querySelectorAll('.pick:checked').length;$('#bulk').hidden=!n;$('#bulk-n').textContent=n+' selected'};
    view.querySelectorAll('.pick').forEach(c=>{c.onchange=syncBulk;c.onclick=e=>e.stopPropagation()});
    fill('#bulk-all',()=>{view.querySelectorAll('.pick:not(:disabled)').forEach(c=>c.checked=true);syncBulk()});
    fill('#bulk-clear',()=>{view.querySelectorAll('.pick').forEach(c=>c.checked=false);syncBulk()});
    view.querySelectorAll('[data-one-off]').forEach(b=>b.onclick=()=>oneSuspend(b.dataset.oneOff,b.dataset.name,false));
    view.querySelectorAll('[data-one-on]').forEach(b=>b.onclick=()=>oneSuspend(b.dataset.oneOn,b.dataset.name,true));
    fill('#bulk-off',()=>bulkRun(false));
    fill('#bulk-on',()=>bulkRun(true));
    fill('#exp-users',async()=>{const d=await rpc('admin_users',{p_q:q.q||'',p_limit:200,p_offset:0});csv('sellers',[{label:'Name',get:r=>r.shop||r.name},{label:'Email',key:'email'},{label:'Phone',key:'phone'},{label:'Joined',get:r=>r.created},{label:'Deals',key:'deals'},{label:'Products',key:'products'},{label:'Suspended',get:r=>r.suspended?'yes':'no'}],d.rows)})}
  if(page==='deals'){wirePager(view,off=>go('#/deals?'+new URLSearchParams({q:q.q||'',status:q.status||'',off})));
    fill('#exp-deals',async()=>{const d=await rpc('admin_deals',{p_q:q.q||'',p_status:q.status||'',p_limit:200,p_offset:0});csv('deals',[{label:'Id',key:'id'},{label:'Title',key:'title'},{label:'Price',key:'price'},{label:'Currency',key:'currency'},{label:'Status',key:'status'},{label:'Seller',key:'seller'},{label:'Buyer',key:'buyer'},{label:'Created',get:r=>r.created?new Date(r.created).toISOString():''}],d.rows)})}
  if(page==='products'){wirePager(view,off=>go('#/products?'+new URLSearchParams({q:q.q||'',status:q.status||'',off})));
    fill('#exp-products',async()=>{const d=await rpc('admin_products',{p_q:q.q||'',p_status:q.status||'',p_limit:200,p_offset:0});csv('products',[{label:'Id',key:'id'},{label:'Title',key:'title'},{label:'Shop',key:'shop'},{label:'Price',key:'price'},{label:'Currency',key:'currency'},{label:'Status',key:'status'},{label:'Requests',key:'requests'}],d.rows)})}
  if(page==='requests'){wirePager(view,off=>go('#/requests?'+new URLSearchParams({status:q.status||'',off})));
    fill('#exp-requests',async()=>{const d=await rpc('admin_requests',{p_status:q.status||'',p_limit:200,p_offset:0});csv('requests',[{label:'Id',key:'id'},{label:'Product',key:'product'},{label:'Buyer',key:'buyer_name'},{label:'Phone',key:'buyer_phone'},{label:'Quantity',key:'quantity'},{label:'Offer',key:'offer'},{label:'Currency',key:'currency'},{label:'Status',key:'status'}],d.rows)})}
  if(page==='crashes'){wirePager(view,off=>go('#/crashes?'+new URLSearchParams({days:q.days||7,off})))}
  if(page==='audit'){view.querySelectorAll('[data-before]').forEach(b=>b.onclick=()=>go('#/audit?'+new URLSearchParams({action:q.action||'',entity:q.entity||'',before:b.dataset.before})));
    fill('#exp-audit',async()=>{const rows=await rpc('admin_events_feed',{p_after:0,p_before:q.before?Number(q.before):null,p_limit:100,p_action:q.action||'',p_entity:q.entity||''});csv('audit',[{label:'When',get:r=>r.at},{label:'Action',key:'action'},{label:'Record',key:'entity'},{label:'Record id',key:'entity_id'},{label:'Summary',key:'summary'},{label:'Reason',key:'reason'},{label:'Admin',key:'actor_email'}],rows)})}
  if(page==='user'){
    const reload=()=>route();
    fill('#a-susp',()=>openModal('Suspend this seller','<p class="help">They cannot sign in, and their current sessions end now. Nothing is deleted.</p>',{ok:'Suspend',danger:true,onSubmit:async({reason})=>{await rpc('admin_set_suspended',{p_id:id,p_on:true,p_reason:reason});toast('Seller suspended','bad');reload()}}));
    fill('#a-react',()=>openModal('Reinstate this seller','<p class="help">They can sign in again straight away.</p>',{ok:'Reinstate',onSubmit:async({reason})=>{await rpc('admin_set_suspended',{p_id:id,p_on:false,p_reason:reason});toast('Seller reinstated','ok');reload()}}));
    fill('#a-prof',async()=>{const u=await rpc('admin_user',{p_id:id});const p=u.profile||{};
      openModal('Edit name or payment line',`<div class="field"><label for="pn">Name shown to buyers</label><input id="pn" name="name" maxlength="40" required value="${esc(p.name||'')}"></div><div class="field"><label for="pp">Payment line</label><input id="pp" name="pay" maxlength="80" value="${esc(p.pay||'')}"></div>`,{ok:'Save',onSubmit:async({name,pay,reason})=>{await rpc('admin_set_profile',{p_id:id,p_name:name.trim(),p_pay:pay.trim(),p_reason:reason});toast('Saved','ok');reload()}})});
    fill('#a-tools',async()=>{const rows=await rpc('admin_tool_records',{p_owner:id,p_col:'',p_limit:200});
      const groups={};rows.forEach(r=>(groups[r.col]=groups[r.col]||[]).push(r));
      const body=Object.keys(groups).length?Object.entries(groups).map(([k,v])=>`<h2 class="mt">${esc(k)} <span class="muted">${v.length}</span></h2><details><summary>Show records</summary><pre>${esc(JSON.stringify(v.map(x=>x.doc),null,2))}</pre></details>`).join(''):'<div class="empty">No tool records for this seller.</div>';
      modalRoot.hidden=false;modalRoot.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h2>Tool records</h2><p class="help">Viewing is logged.</p>${body}<div class="row"><button class="btn ghost" id="mc">Close</button></div></div>`;
      $('#mc').onclick=()=>{modalRoot.hidden=true;modalRoot.innerHTML=''};modalRoot.onkeydown=e=>{if(e.key==='Escape'){modalRoot.hidden=true;modalRoot.innerHTML=''}}});
  }
  if(page==='deals'){view.querySelectorAll('[data-res]').forEach(b=>b.onclick=()=>resolveDeal(b.dataset.res,b.dataset.st,b.dataset.t));}
  if(page==='products'){view.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{const want=b.dataset.act;openModal((want==='paused'?'Pause ':'Publish ')+b.dataset.t,`<p class="help">${want==='paused'?'Buyers cannot see or request this product while it is paused.':'Buyers can see and request this product again.'}</p>`,{ok:want==='paused'?'Pause product':'Publish product',danger:want==='paused',onSubmit:async({reason})=>{await rpc('admin_set_product_status',{p_id:b.dataset.id,p_status:want,p_reason:reason});toast('Product updated','ok');route()}})})}
  if(page==='admins'){fill('#add-admin',()=>openModal('Add admin','<div class="field"><label for="ae">Email of an existing account</label><input id="ae" name="email" type="email" required></div><p class="help">They can use the console as soon as they sign in.</p>',{ok:'Add admin',onSubmit:async({email,reason})=>{await rpc('admin_add_admin',{p_email:email.trim(),p_reason:reason});toast('Admin added','ok');route()}}));
    view.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>openModal('Remove admin rights','<p class="help">'+esc(b.dataset.email)+' will lose access to this console at once.</p>',{ok:'Remove',danger:true,onSubmit:async({reason})=>{await rpc('admin_remove_admin',{p_id:b.dataset.remove,p_reason:reason});toast('Admin removed','warn');route()}}))}
  if(page==='announcements'){
    fill('#new-ann',()=>annForm(null));
    view.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>annForm(annRows.find(r=>r.id===b.dataset.edit)));
    view.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copyAnn(b.dataset.copy));
    view.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{const on=b.dataset.on==='1';
      openModal(on?'Switch on':'Switch off',`<p class="help">${on?'Sellers see it again at once.':'Sellers stop seeing it at once.'}</p>`,{ok:on?'Switch on':'Switch off',danger:!on,
        onSubmit:async d=>{await rpc('admin_toggle_announcement',{p_id:b.dataset.toggle,p_active:on,p_reason:d.reason});toast('Updated.');route()}})});
  }
  if(page==='maintenance'){
    const f=document.getElementById('mt-form');
    if(f)fr(f,()=>openMaint(true));
    fill('#mt-up',()=>openMaint(false));
  }
}
addEventListener('hashchange',()=>{if(sess&&document.body.dataset.screen==='app')route()});

/* ---------- boot ---------- */
async function boot(fromSignOut){
  sess=readSess();
  const msg=sessionStorage.getItem('dp.admin.msg');sessionStorage.removeItem('dp.admin.msg');
  $('#boot').hidden=true;
  if(!BASE||!KEY){app.hidden=false;app.innerHTML='<div class="login"><div class="login-card"><h1>Not configured</h1><p class="err">The app settings (app/js/config.js) are missing the backend address or key.</p></div></div>';return}
  if(!sess||!sess.access){clearSess();return loginScreen(msg||'')}
  try{
    if(sess.exp-Date.now()<60e3)await refresh();
    if(!sess){return loginScreen(msg||'Your session ended. Sign in again.')}
    const g=await authed('/rest/v1/rpc/admin_gate',{method:'POST',body:{}});
    if(!g.admin){clearSess();return loginScreen('This account is not an administrator.')}
    document.body.dataset.screen='app';app.hidden=false;
    if(!app.querySelector('.shell'))shell();
    startPolling();
    if(!location.hash)location.hash='#/overview';
    await route();
  }catch(e){
    if(e.network){app.hidden=false;app.innerHTML=`<div class="login"><div class="login-card"><h1>Can't reach the server</h1><p class="err">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Reload</button></div></div>`;return}
    if(e.denied){clearSess();return loginScreen('This account is not an administrator.')}
    clearSess();loginScreen(e.message||'Sign-in failed. Try again.');
  }
}
boot();
})();

/* ---------- install as an app ---------- */
if('serviceWorker' in navigator){addEventListener('load',()=>{navigator.serviceWorker.register('sw.js',{scope:'./'}).catch(()=>{})})}
