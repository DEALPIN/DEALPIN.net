(()=>{'use strict';
const C=window.DEALPIN||{},R=document.getElementById('root'),K='dp.console',IDLE=15*60e3,NS='http://www.w3.org/2000/svg';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v||0).toLocaleString();
const ago=t=>{if(!t)return 'never';const s=(Date.now()-new Date(t))/1e3;if(s<90)return 'just now';if(s<3600)return Math.round(s/60)+' min ago';if(s<86400)return Math.round(s/3600)+' h ago';if(s<86400*45)return Math.round(s/86400)+' d ago';return new Date(t).toLocaleDateString()};
const day=t=>t?new Date(t).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'–';
let tok=null,idle=0,auto=0,q='',off=0,page=25,busy=false;
const load=()=>{try{const o=JSON.parse(sessionStorage.getItem(K));return o&&o.exp>Date.now()?o.t:null}catch{return null}};
const out=()=>{tok=null;try{sessionStorage.removeItem(K)}catch{}clearInterval(auto);clearTimeout(idle);login()};
const bump=()=>{clearTimeout(idle);idle=setTimeout(out,IDLE)};
['click','keydown','pointerdown'].forEach(e=>addEventListener(e,()=>tok&&bump()));
const net=async(p,o)=>{let r;try{r=await fetch(C.url+p,o)}catch{throw new Error('No connection.')}const j=await r.json().catch(()=>null);if(!r.ok){const e=new Error('denied');e.s=r.status;throw e}return j};
const rpc=(f,b)=>net('/rest/v1/rpc/'+f,{method:'POST',headers:{apikey:C.anonKey,Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify(b||{})});

function login(msg){
  R.innerHTML=`<div class="login"><form class="box" id="lf" novalidate><h1>Console</h1><div><label for="e">Email</label><input id="e" type="email" autocomplete="username" required></div><div><label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required></div><p class="err" id="er" role="alert">${esc(msg||'')}</p><button class="b pr" id="go">Sign in</button></form></div>`;
  document.getElementById('lf').onsubmit=async ev=>{ev.preventDefault();const b=document.getElementById('go'),er=document.getElementById('er');b.disabled=true;er.textContent='';
    try{const j=await net('/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:C.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('e').value.trim(),password:document.getElementById('p').value})});
      tok=j.access_token;sessionStorage.setItem(K,JSON.stringify({t:tok,exp:Date.now()+Math.min((j.expires_in||3600),3000)*1000}));
      const ok=await rpc('is_admin').catch(()=>false);if(ok!==true)throw new Error('x');bump();dash()}
    catch{tok=null;try{sessionStorage.removeItem(K)}catch{}er.textContent='Sign-in failed.';b.disabled=false}}}

const bars=(d,cls)=>{const m=Math.max(1,...d.map(x=>x.n)),w=300/Math.max(1,d.length);let s=`<svg viewBox="0 0 300 96" role="img" aria-label="Chart of the last ${d.length} days">`;
  d.forEach((x,i)=>{const h=Math.max(x.n?2:0,Math.round(x.n/m*70));s+=`<rect class="${cls}" x="${(i*w+1).toFixed(1)}" y="${80-h}" width="${Math.max(1,w-2).toFixed(1)}" height="${h}" rx="1.5"><title>${esc(x.d)}: ${x.n}</title></rect>`});
  return s+`<text class="ax" x="0" y="94">${esc((d[0]||{}).d||'')}</text><text class="ax" x="300" y="94" text-anchor="end">${esc((d[d.length-1]||{}).d||'')}</text></svg>`};
const tile=(v,l,c)=>`<div class="k ${c||''}"><b>${n(v)}</b><span>${l}</span></div>`;

async function dash(){
  R.innerHTML='<div class="wrap"><p class="mu">Loading…</p></div>';
  let o,u;
  try{[o,u]=await Promise.all([rpc('admin_overview'),rpc('admin_users',{p_q:q,p_limit:page,p_offset:off})])}catch(e){return out()}
  const U=o.users,D=o.deals,S=o.storage||{},st=D.by_status||{},mx=Math.max(1,...Object.values(st));
  R.innerHTML=`<div class="wrap"><div class="top"><div><h1>Console</h1><span class="mu">Updated ${esc(day(o.generated))}</span></div><div class="r"><label class="mu"><input type="checkbox" id="au" ${auto?'checked':''}> auto-refresh</label><button class="b" id="rf">Refresh</button><button class="b" id="cv">Export users CSV</button><button class="b" id="so">Sign out</button></div></div>
  <div class="grid">${tile(U.total,'Accounts ever created','hi')}${tile(U.active_1h,'Active in last hour')}${tile(U.active_24h,'Active in 24 hours')}${tile(U.active_7d,'Active in 7 days')}${tile(U.active_30d,'Active in 30 days')}${tile(U.new_24h,'New in 24 hours')}${tile(U.new_7d,'New in 7 days')}${tile(U.new_30d,'New in 30 days')}${tile(U.never_signed_in,'Never signed in')}${tile(U.confirmed,'Confirmed accounts')}${tile(o.sellers,'Seller profiles set up')}</div>
  <div class="grid">${tile(D.total,'Deals in total','hi')}${tile(D.last_24h,'Deals in 24 hours')}${tile(D.last_7d,'Deals in 7 days')}${tile(o.products.published,'Published products')}${tile(o.products.total,'All products')}${tile(o.requests,'Purchase requests')}${tile(o.tools_records,'Tools records')}${tile(S.files,'Uploaded files')}<div class="k"><b>${(Number(S.bytes||0)/1048576).toFixed(1)} MB</b><span>File storage used</span></div></div>
  <div class="two"><div class="card"><h2>New accounts per day</h2>${bars(o.signups_by_day||[],'bar')}</div><div class="card"><h2>Active people per day</h2>${(o.active_by_day||[]).length?bars(o.active_by_day,'bar2'):'<p class="mu">Not available on this project.</p>'}</div></div>
  <div class="two"><div class="card"><h2>Deals created per day</h2>${bars(o.deals_by_day||[],'bar')}</div><div class="card"><h2>Deals by status</h2><div class="st">${Object.keys(st).length?Object.entries(st).map(([k,v])=>`<div><span>${esc(k)}</span><i data-w="${Math.round(v/mx*100)}"></i><b>${n(v)}</b></div>`).join(''):'<p class="mu">No deals yet.</p>'}</div><h2 class="sp">Sign-in methods</h2><div class="st">${Object.entries(o.methods||{}).map(([k,v])=>`<div><span>${esc(k)}</span><i data-w="${Math.round(v/Math.max(1,U.total)*100)}"></i><b>${n(v)}</b></div>`).join('')}</div></div></div>
  <div class="card"><div class="top"><h2>All accounts (${n(u.total)})</h2><input id="qs" type="search" placeholder="Search email, name, shop, handle" value="${esc(q)}" aria-label="Search accounts"></div><div class="tw"><table><thead><tr><th>Person</th><th>Method</th><th>Shop</th><th>Deals</th><th>Products</th><th>Joined</th><th>Last active</th><th></th></tr></thead><tbody>${u.rows.map(r=>{const a=r.seen&&Date.now()-new Date(r.seen)<36e5;const nw=Date.now()-new Date(r.created)<864e5;return`<tr><td>${esc(r.name||'')}${r.name?'<br>':''}<span class="mu">${esc(r.email||r.phone||r.id)}</span></td><td>${esc(r.method||'')}</td><td>${esc(r.shop||'–')}${r.handle?` <span class="mu">@${esc(r.handle)}</span>`:''}</td><td>${n(r.deals)}</td><td>${n(r.products)}</td><td>${esc(day(r.created))}</td><td>${esc(ago(r.seen))}</td><td>${a?'<span class="tg on">active</span>':nw?'<span class="tg new">new</span>':''}</td></tr>`}).join('')||'<tr><td colspan="8" class="mu">No accounts match.</td></tr>'}</tbody></table></div>
  <div class="pg"><button class="b" id="pv" ${off?'':'disabled'}>Previous</button><span class="mu">${u.total?off+1:0}–${Math.min(off+page,u.total)} of ${n(u.total)}</span><button class="b" id="nx" ${off+page<u.total?'':'disabled'}>Next</button></div></div></div>`;
  document.querySelectorAll('[data-w]').forEach(e=>{e.style.width=e.dataset.w+'%'});
  const $=id=>document.getElementById(id);
  $('rf').onclick=dash;$('so').onclick=out;$('pv').onclick=()=>{off=Math.max(0,off-page);dash()};$('nx').onclick=()=>{off+=page;dash()};
  let t;$('qs').oninput=e=>{clearTimeout(t);t=setTimeout(()=>{q=e.target.value.trim();off=0;dash().then(()=>{const i=$('qs');i.focus();i.setSelectionRange(i.value.length,i.value.length)})},450)};
  $('au').onchange=e=>{clearInterval(auto);auto=0;if(e.target.checked)auto=setInterval(dash,30000)};
  $('cv').onclick=async e=>{const b=e.target;b.disabled=true;try{const rows=[['email','phone','name','method','shop','handle','deals','products','joined','last_sign_in','last_active']];
    for(let o2=0;;o2+=200){const p=await rpc('admin_users',{p_q:'',p_limit:200,p_offset:o2});p.rows.forEach(r=>rows.push([r.email,r.phone,r.name,r.method,r.shop,r.handle,r.deals,r.products,r.created,r.last_sign_in,r.seen]));if(o2+200>=p.total)break}
    const csv=rows.map(r=>r.map(v=>{v=String(v==null?'':v);if(/^[=+\-@]/.test(v))v="'"+v;return'"'+v.replace(/"/g,'""')+'"'}).join(',')).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='accounts.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4e3)}catch{}b.disabled=false};
}
document.head.insertAdjacentHTML('beforeend','');
tok=load();if(tok){bump();dash()}else login();
})();
