/* Tools: shared screens (hub, list, form, record page) and form helpers. The six tools are defined in js/mods.js.
   Screens only talk to ModStore (js/mods-core.js), never to storage directly. */
class FieldErr extends Error{constructor(sel,msg){super(msg);this.sel=sel}}
const TOOLS={};   // filled by js/mods.js: id -> definition
const pill=(x,k)=>`<span class="chip ${esc(k)}">${esc(x)}</span>`;
const wa=(txt,p)=>'https://wa.me/'+(p?tel(p):'')+'?text='+encodeURIComponent(txt);
const waBtn=(txt,p,l)=>`<a class="btn ghost" target="_blank" rel="noopener" href="${esc(wa(txt,p))}">${esc(l)}</a>`;
const mid=x=>encodeURIComponent(x);

/* ---- form fields: every field has a visible label; no sample text */
const fText=(id,l,v,o={})=>`<div class="field"><label for="${id}">${l}</label><input id="${id}" type="${o.type||'text'}" value="${esc(v)}"${o.max?` maxlength="${o.max}"`:''}${o.mode?` inputmode="${o.mode}"`:''}${o.auto?` autocomplete="${o.auto}"`:' autocomplete="off"'}${o.type==='number'?' step="any" min="0"':''}>${o.help?`<p class="help">${o.help}</p>`:''}</div>`;
const fMoney=(id,l,v,o={})=>fText(id,l,v||v===0&&o.zero?v:'',{type:'number',mode:'decimal',...o});
const fPhone=(id,l,v,o={})=>fText(id,l,v,{type:'tel',mode:'tel',auto:'off',max:20,...o});
const fDate=(id,l,v,o={})=>fText(id,l,v,{type:'date',...o}).replace(' step="any" min="0"','');
const fSelect=(id,l,v,opts)=>`<div class="field"><label for="${id}">${l}</label><select id="${id}">${opts.map(([k,n])=>`<option value="${esc(k)}"${k===v?' selected':''}>${esc(n)}</option>`).join('')}</select></div>`;
const fArea=(id,l,v,o={})=>`<div class="field"><label for="${id}">${l}</label><textarea id="${id}" rows="${o.rows||3}"${o.max?` maxlength="${o.max}"`:''}>${esc(v)}</textarea></div>`;
const fCur=(id,v)=>`<div class="field"><label for="${id}">Currency</label><select id="${id}">${currencyOptions(v||REGION.currency)}</select></div>`;
/* ---- form values */
const val=id=>$('#'+id).value.trim();
const need=(id,msg)=>{const v=val(id);if(!v)throw new FieldErr('#'+id,msg);return v};
const amount=(id,msg,zero)=>{const r=val(id),v=Number(r);if(r===''||!Number.isFinite(v)||v<0||(!zero&&v<=0))throw new FieldErr('#'+id,msg);return v};
const optional=(id,msg='Enter a number, 0 or more.')=>{const r=val(id);if(r==='')return 0;const v=Number(r);if(!Number.isFinite(v)||v<0)throw new FieldErr('#'+id,msg);return v};
const payForm=l=>`<form id="pf" class="card noprint" data-lock novalidate><h2>${l}</h2>${fMoney('pa','Amount','')}${fText('pn','Note (optional)','',{max:60})}<button class="btn block">Record</button></form>`;
const payList=(l,cur)=>l.length?`<ul class="tl">${l.map(p=>`<li>${fmM(mn(p.amt,cur),cur)}${p.note?' · '+esc(p.note):''}<small>${when(p.at)}</small></li>`).join('')}</ul>`:'<p class="help">Nothing recorded yet.</p>';
/* Records a payment on a ledger entry or invoice. Over-payments are refused, so a balance can never go negative by mistake. */
const bindPayment=(x,col,balance,again)=>submit('#pf',async()=>{
  let amt;try{amt=amount('pa','Enter an amount above 0.')}catch(e){return bad(e.sel,e.message)}
  if(mn(amt,x.cur)>balance)return bad('#pa',`That is more than the balance of ${fmM(balance,x.cur)}.`);
  await ModStore.save(col,{...x,pay:[...x.pay,{amt,at:Date.now(),note:val('pn')}]});note('Payment recorded');again()});
const download=(name,text,type='text/csv;charset=utf-8')=>{const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)};
/* Records still on this phone while Tools is online (made before online sync, or while signed out): offered once for upload. */
async function deviceRecords(){if(ModStore.where!=='online')return{n:0,data:null};const d=await LocalModStore.export();return{n:MOD_COLLECTIONS.reduce((u,c)=>u+(Array.isArray(d[c])?d[c].length:0),0),data:d}}
const adoptCard=n=>`<section class="card"><h2>Move this phone's records online</h2><p>${n} ${n===1?'record is':'records are'} saved only on this phone. Upload ${n===1?'it':'them'} to your account so ${n===1?'it is':'they are'} safe and available on every device.</p><div class="actions"><button class="btn" id="adopt">Upload to my account</button><button class="btn ghost" id="dropdev">Delete from this phone</button></div></section>`;
const devNote=()=>ModStore.where==='device'?`<p class="help">Saved on this device only. Download a copy in Settings to keep it safe.</p>`:'';
const getQuery=()=>{const q=(location.hash.split('?')[1]||'');return Object.fromEntries(new URLSearchParams(q))};

/* What needs a look today, across every tool. Each item links to its record. */
async function attention(){
  const [led,inv,jobs,stk,grp]=await Promise.all(['ledger','invoices','jobs','stock','groups'].map(c=>ModStore.list(c)));const td=today(),out=[];
  led.filter(x=>Calc.ledger(x).bal>0&&x.due&&x.due<td).forEach(x=>out.push(['ledger',x.id,`${x.dir==='owed'?'Overdue from':'Overdue to'} ${x.who}`,fmM(Calc.ledger(x).bal,x.cur)]));
  inv.filter(x=>Calc.invoice(x).bal>0&&x.due&&x.due<td).forEach(x=>out.push(['invoices',x.id,`Invoice ${x.no} is overdue`,fmM(Calc.invoice(x).bal,x.cur)]));
  jobs.filter(x=>TOOLS.jobs.review(x)).forEach(x=>out.push(['jobs',x.id,`${x.st==='failed'?'Failed':'Delivered without code'}: ${x.dname}`,'Needs a note']));
  jobs.filter(x=>x.st==='picked'&&x.tries>=5).forEach(x=>out.push(['jobs',x.id,`Code locked for ${x.dname}`,'Reset the code']));
  stk.filter(x=>x.qty<=x.low&&(x.low>0||x.qty<=0)).forEach(x=>out.push(['stock',x.id,x.qty<=0?`${x.name} is out`:`${x.name} is low`,`${x.qty} ${x.unit}`]));
  grp.filter(x=>x.st==='open'&&x.deadline&&x.deadline<td).forEach(x=>out.push(['groups',x.id,`${x.title}: join date has passed`,'Place the order']));
  return out}

async function Tools(){
  const me=await Store.getSeller();if(!me.name)return go('/welcome');
  const L=c=>ModStore.list(c),[led,inv,jobs,stk,grp,rid,att,dev]=await Promise.all([L('ledger'),L('invoices'),L('jobs'),L('stock'),L('groups'),L('riders'),attention(),deviceRecords()]);
  const open=jobs.filter(x=>x.st==='new'||x.st==='picked').length,low=stk.filter(x=>x.qty<=x.low&&(x.low>0||x.qty<=0)).length;
  const tile=(c,sub)=>`<a class="tile" href="#/m/${c}">${ic(TOOLS[c].icon)}<b>${TOOLS[c].title}</b><small>${sub}</small></a>`;
  view(`<section class="dashboard-head"><div><p class="eyebrow">Business tools</p><h1>Tools</h1><p class="sub">Deliveries, money owed, invoices, stock and group orders in one place.</p></div></section>
  <div class="hub">${tile('jobs',open+' open')}${tile('riders',rid.length+(rid.length===1?' rider':' riders'))}${tile('ledger',led.filter(x=>Calc.ledger(x).bal>0).length+' open')}${tile('invoices',inv.filter(x=>Calc.invoice(x).bal>0).length+' unpaid')}${tile('stock',low?low+' low or out':stk.length+' items')}${tile('groups',grp.filter(x=>x.st!=='closed').length+' active')}</div>
  <section class="card"><h2>Needs attention</h2>${att.length?`<ul class="list">${att.slice(0,12).map(a=>`<li><a class="row" href="#/m/${a[0]}/${mid(a[1])}"><div><b>${esc(a[2])}</b><small>${esc(a[3])}</small></div><span class="row-arrow" aria-hidden="true">›</span></a></li>`).join('')}</ul>${att.length>12?`<p class="help">And ${att.length-12} more.</p>`:''}`:'<p class="help">Nothing needs attention right now.</p>'}</section>
  <div class="grid-2"><section class="card"><h2>Money owed</h2>${TOOLS.ledger.kpi(led)}</section><section class="card"><h2>Invoices</h2>${TOOLS.invoices.kpi(inv)}</section></div>${dev.n?adoptCard(dev.n):''}${devNote()}`);
  tap('#adopt',async()=>{try{const k=await ModStore.adopt(dev.data);await LocalModStore.clear();note(k?`${k} ${k===1?'record':'records'} uploaded`:'Those records were already online');Tools()}catch(z){fail(z)}});
  tap('#dropdev',async()=>{if(!await ask({title:'Delete these records from this phone?',body:'They are not online. This cannot be undone. Download a copy in Settings first if you want to keep them.',ok:'Delete',danger:true}))return;await LocalModStore.clear();note('Deleted from this phone');Tools()});
}

async function ModRoute(col,id,edit){
  const t=TOOLS[col];if(!t)return missing('That tool does not exist.');
  if(!id)return ModList(col);if(id==='new')return ModForm(col);
  const o=await ModStore.get(col,id);if(!o)return missing('That record was not found.');
  return edit?ModForm(col,o):ModView(col,o);
}

async function ModList(col){
  const t=TOOLS[col],all=await ModStore.list(col),ctx=await toolCtx();let tab=0,q='',extra='',shown=100;
  const filters=t.filters?t.filters(ctx):'';
  view(`<a class="back" href="#/tools">Tools</a><h1>${t.title}</h1><p class="sub">${t.intro}</p>${t.kpi(all,ctx)}
  <div class="actions"><a class="btn" href="#/m/${col}/new">${ic('plus')} New ${t.sing}</a>${t.listActions?t.listActions(all,ctx):''}${t.csv&&all.length?'<button class="btn ghost" id="csv">Download as spreadsheet</button>':''}</div>
  ${all.length>1?`<div class="toolbar"><div class="search-wrap"><label class="sr-only" for="q">Search ${esc(t.title)}</label><input id="q" type="search" placeholder="${esc(t.search||'Search')}" autocomplete="off"></div>${filters}</div>`:''}
  <div class="tabs" role="group" aria-label="Filter">${t.tabs.map((x,i)=>`<button type="button" class="tab" data-i="${i}" aria-pressed="${i===0}">${x[0]}</button>`).join('')}</div><ul class="list" id="ls" aria-live="polite"></ul><div id="more"></div>`);
  const draw=()=>{
    const r=all.filter(x=>t.tabs[tab][1](x)&&(!q||t.text(x,ctx).toLowerCase().includes(q))&&(!t.match||t.match(x,extra)));
    $('#ls').innerHTML=r.length?r.slice(0,shown).map(x=>`<li><a class="row" href="#/m/${col}/${mid(x.id)}">${t.row(x,ctx)}<span class="row-arrow" aria-hidden="true">›</span></a></li>`).join(''):`<li class="empty">${all.length?'Nothing matches.':'Nothing here yet.'}</li>`;
    $('#more').innerHTML=r.length>shown?`<button class="btn ghost block" id="mb" type="button">Show more (${r.length-shown})</button>`:'';on('#mb',()=>{shown+=100;draw()})};
  draw();
  const s=$('#q');if(s)s.oninput=()=>{q=s.value.trim().toLowerCase();shown=100;draw()};
  const f=$('#xf');if(f)f.onchange=()=>{extra=f.value;shown=100;draw()};
  $$('.tab').forEach(b=>b.onclick=()=>{tab=+b.dataset.i;shown=100;$$('.tab').forEach(x=>x.setAttribute('aria-pressed',x===b));draw()});
  on('#csv',()=>{download(`dealpin-${col}-${today()}.csv`,toCsv(t.csv.head,all.flatMap(x=>t.csv.rows?t.csv.rows(x,ctx):[t.csv.row(x,ctx)])));note('Spreadsheet downloaded')});
  if(t.bindList)t.bindList(all,ctx);
}

/* Shared context for screens: the seller and the rider list (jobs show rider names). */
async function toolCtx(){const [me,riders]=await Promise.all([Store.getSeller(),ModStore.list('riders')]);return{me,riders,rider:id=>riders.find(r=>r.id===id)||null}}

async function ModForm(col,o){
  const t=TOOLS[col],ctx=await toolCtx();ctx.all=await ModStore.list(col);let pre={};
  if(!o&&t.prefill){try{pre=await t.prefill(getQuery(),ctx)||{}}catch{}}
  const x=o||pre;
  if(o&&t.canEdit&&!t.canEdit(o))return missing('This record can no longer be edited.');
  view(`<div class="narrow"><a class="back" href="#/m/${col}${o?'/'+mid(o.id):''}">${o?'Cancel':t.title}</a><h1>${o?'Edit':'New'} ${t.sing}</h1><form id="mf" class="card" novalidate>${t.form(x,ctx,!!o)}<button class="btn block">Save</button></form></div>`);
  if(t.bindForm)t.bindForm(x,ctx);
  submit('#mf',async()=>{
    let r;try{r=t.read(x,ctx)}catch(e){if(e instanceof FieldErr)return bad(e.sel,e.message);throw e}
    let s=await ModStore.save(col,{...(o||{}),...(o?{}:{deal:pre.deal||''}),...r});if(t.prep)s=await t.prep(s);
    note('Saved');go('/m/'+col+'/'+s.id)});
}

async function ModView(col,o){
  const t=TOOLS[col],ctx=await toolCtx(),again=async()=>{const n=await ModStore.get(col,o.id);if(n)ModView(col,n);else go('/m/'+col)};
  const canEdit=!t.canEdit||t.canEdit(o),body=await t.view(o,ctx);
  view(`<a class="back noprint" href="#/m/${col}">${t.title}</a>${body}<div class="actions noprint">${canEdit?`<a class="btn ghost" href="#/m/${col}/${mid(o.id)}/edit">Edit</a>`:''}${t.dup?'<button class="btn ghost" id="dup">Duplicate</button>':''}<button class="btn bad" id="dl">Delete</button></div>${devNote()}`);
  tap('#dl',async()=>{if(!await ask({title:`Delete this ${t.sing}?`,body:ModStore.where==='device'?'It is removed from this device and cannot be brought back.':'This cannot be undone.',ok:'Delete',danger:true}))return;await ModStore.del(col,o.id);note('Deleted');go('/m/'+col)});
  tap('#dup',async()=>{const c=await t.dup(o,ctx);const s=await ModStore.save(col,c);note('Duplicated');go('/m/'+col+'/'+s.id)});
  await t.bind(o,ctx,again);
}
