/* Tools data layer and money maths. No screens here.
   ModStore is the ONLY thing the Tools screens use to read and write records. It is asynchronous on purpose:
   the backend round replaces LocalModStore with an online adapter that has the same methods (see docs/BACKEND.md).
   Every record carries id, at (created), up (updated) and rev (counts saves, for conflict checks).
   Nothing in Tools holds or moves money: it records what people report. */
const MOD_COLLECTIONS=['ledger','invoices','riders','jobs','setl','stock','groups'];
const MOD_LIMIT=5000;
/* The life of a delivery. Status, handover code and wrong-code count are changed ONLY here (a plain save cannot touch them),
   so the code is checked and counted the same way on the device and on the server (mod_act in supabase/phase-five-tools-sync.sql).
   Returns {patch, ev, ok}; throws a plain sentence when the action is not allowed. */
const JOB_TRIES=5;
const jobCode=()=>{const a=new Uint32Array(1);crypto.getRandomValues(a);return String(a[0]%10000).padStart(4,'0')};
const jobAct=(x,action,p)=>{p=p||{};const need=(...st)=>{if(!st.includes(x.st))throw new Error('That is not possible at this stage of the delivery.')};
  const why=()=>{const w=String(p.why==null?'':p.why).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,140);if(!w)throw new Error('Say why first.');return w};
  switch(action){
    case'pickup':need('new');return{patch:{st:'picked',code:jobCode(),tries:0},ev:'Picked up',ok:true};
    case'cancel':need('new','picked');return{patch:{st:'cancelled',why:why()},ev:'Cancelled',ok:true};
    case'confirm':{need('picked');if(x.tries>=JOB_TRIES)throw new Error('Too many wrong codes. Reset the code, or use the other options.');
      return String(p.code)===x.code?{patch:{st:'delivered'},ev:'Delivered',ok:true}:{patch:{tries:x.tries+1},ev:'Wrong code entered',ok:false}}
    case'reset':need('picked');return{patch:{code:jobCode(),tries:0},ev:'Code reset',ok:true};
    case'viewed':need('picked');return{patch:{},ev:'Code viewed',ok:true};
    case'fail':need('picked');return{patch:{st:'failed',why:why()},ev:'Failed',ok:true};
    case'nocode':{need('picked');return{patch:{st:'delivered',why:'No code: '+why()},ev:'Delivered without code',ok:true}}
    case'retry':need('failed');return{patch:{st:'new',code:'',tries:0,why:'',res:''},ev:'New attempt',ok:true};
    default:throw new Error('That action is not available.')}};
const LocalModStore=(()=>{
  const K='dealpin.mods.v1',ID=/^[a-z0-9]{10}$/,VER=1;
  const rd=()=>{try{const d=JSON.parse(localStorage.getItem(K));return d&&typeof d==='object'&&!Array.isArray(d)?d:{}}catch{return{}}};
  const wr=d=>{try{localStorage.setItem(K,JSON.stringify({...d,v:VER}))}catch{throw new Error('Storage is full. Download your data and delete old records.')}};
  const mkid=()=>{let s='';while(s.length<10){const a=new Uint8Array(16);crypto.getRandomValues(a);for(const b of a)if(b<252&&s.length<10)s+=(b%36).toString(36)}return s};
  const cl=(t,n)=>(typeof t==='string'||typeof t==='number'?String(t):'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n);
  /* field kinds: s string, n number, m money (rounded to the record's currency), q quantity, c currency, d date, t time, e choice, b yes/no, i photo, p map pin, a list */
  const s=(k,n)=>({k,t:'s',n}),n=k=>({k,t:'n'}),m=k=>({k,t:'m'}),q=k=>({k,t:'q'}),c=k=>({k,t:'c'}),d=k=>({k,t:'d'}),t=k=>({k,t:'t'}),e=(k,o)=>({k,t:'e',o}),b=k=>({k,t:'b'}),i=k=>({k,t:'i'}),p=k=>({k,t:'p'}),a=(k,of,max)=>({k,t:'a',of,max});
  const PAY=[m('amt'),t('at'),s('note',60)];
  const SP={
    ledger:[s('who',60),s('phone',20),e('dir',['owed','owe']),m('amt'),c('cur'),s('note',140),d('due'),a('pay',PAY,200)],
    invoices:[s('no',20),s('client',60),s('phone',20),d('issue'),d('due'),c('cur'),n('tax'),m('disc'),s('notes',300),s('code',16),s('deal',10),a('items',[s('d',100),q('q'),m('p')],100),a('pay',PAY,200)],
    riders:[s('name',60),s('phone',20),e('kind',['flat','pct']),c('cur'),n('rate')],
    jobs:[s('client',60),s('cphone',20),s('pickup',120),s('drop',120),s('dname',60),s('dphone',20),m('fee'),m('cod'),c('cur'),s('rider',10),s('deal',10),s('note',140),e('st',['new','picked','delivered','failed','cancelled']),s('code',4),n('tries'),s('why',140),s('res',140),i('proof'),p('pin'),b('settled'),a('ev',[s('s',60),t('at')],80)],
    setl:[s('rider',10),t('at'),c('cur'),n('count'),m('earn'),m('cod'),m('net')],
    stock:[s('name',60),s('sku',30),s('cat',30),q('qty'),s('unit',12),m('price'),c('cur'),q('low'),a('mv',[q('d'),s('r',40),t('at')],200)],
    groups:[s('title',80),s('note',140),c('cur'),d('deadline'),m('total'),m('fee'),e('split',['qty','equal']),e('st',['open','ordered','delivered','closed']),a('mem',[s('n',60),s('ph',20),q('q'),m('paid')],200)]
  };
  const num=v=>{v=typeof v==='number'||typeof v==='string'?+v:NaN;return Number.isFinite(v)?Math.min(1e12,Math.max(-1e12,v)):0};
  const norm=(sp,o,cur)=>{o=o||{};const r={};let cc=cur;
    for(const f of sp)if(f.t==='c'){const v=o[f.k];r[f.k]=/^[A-Z]{3}$/.test(v)?v:REGION.currency;cc=r[f.k]}
    for(const f of sp){if(f.t==='c')continue;const v=o[f.k];
      r[f.k]=f.t==='n'?Math.round(num(v)*1000)/1000:f.t==='q'?Math.round(num(v)*1000)/1000:f.t==='m'?roundMoney(num(v),cc||REGION.currency):f.t==='e'?(f.o.includes(v)?v:f.o[0]):f.t==='d'?(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(new Date(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:''):f.t==='t'?(Number.isFinite(+v)?Math.max(0,Math.min(4e12,Math.floor(+v))):0):f.t==='b'?v===true:
      f.t==='i'?(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]{0,700000}=*$/.test(v||'')?v:''):
      f.t==='p'?(v&&Math.abs(+v.lat)<=90&&Math.abs(+v.lng)<=180&&v.lat!==''&&v.lng!==''&&v.lat!=null&&v.lng!=null?{lat:+(+v.lat).toFixed(6),lng:+(+v.lng).toFixed(6)}:null):
      f.t==='a'?(Array.isArray(v)?v.slice(-f.max).map(x=>norm(f.of,x,cc)):[]):cl(v,f.n)}
    return r};
  const stamp=(col,o,old)=>{const now=Date.now();return{...norm(SP[col],o),id:old?old.id:ID.test(o&&o.id)?o.id:mkid(),at:old?old.at:Number.isFinite(+(o&&o.at))&&+o.at>0?+o.at:now,up:now,rev:old?old.rev+1:1}};
  const apply=(db,op)=>{
    const col=op.col;if(!SP[col])throw new Error('Unknown record type.');
    const arr=db[col]||(db[col]=[]);
    if(op.op==='del'){db[col]=arr.filter(x=>x.id!==op.id);return null}
    const o=op.obj||{},old=ID.test(o.id)?arr.find(x=>x.id===o.id):null;
    if(old&&o.rev!=null&&+o.rev!==old.rev)throw new Error('This record was changed in another tab or device. Reload it and try again.');
    if(!old&&arr.length>=MOD_LIMIT)throw new Error('You have reached the limit of '+MOD_LIMIT+' records here. Download your data and delete old ones.');
    const x=stamp(col,o,old);
    if(col==='jobs'){x.st=old?old.st:'new';x.code=old?old.code:'';x.tries=old?old.tries:0}   // only act() changes these
    if(old)Object.assign(old,x);else arr.push(x);return x};
  return{
    where:'device',   // 'device' now; the online adapter says 'online'
    SP,
    async list(col){return (rd()[col]||[]).slice().sort((x,y)=>y.at-x.at)},
    async get(col,id){return (rd()[col]||[]).find(x=>x.id===id)||null},
    async save(col,o){const db=rd(),x=apply(db,{op:'save',col,obj:o});wr(db);return{...x}},
    async del(col,id){const db=rd();apply(db,{op:'del',col,id});wr(db)},
    /* Several writes that succeed or fail together: [{op:'save',col,obj}|{op:'del',col,id}] */
    async batch(ops){const db=rd(),out=[];for(const op of ops)out.push(apply(db,op));wr(db);return out.map(x=>x&&{...x})},
    /* One step in a delivery's life (see jobAct). Returns {record, ok}: ok is false for a wrong code, which is counted. */
    async act(col,id,action,p){if(col!=='jobs')throw new Error('That action is not available.');
      const db=rd(),x=(db.jobs||[]).find(y=>y.id===id);if(!x)throw new Error('That record was not found.');
      const r=jobAct(x,action,p),now=Date.now();Object.assign(x,r.patch,{up:now,rev:x.rev+1,ev:[...x.ev,{s:r.ev,at:now}].slice(-80)});wr(db);return{record:{...x},ok:r.ok}},
    async export(){return{v:VER,...rd()}},
    /* Replaces everything. dry=true only checks the file. Unknown record types and fields are dropped. */
    async import(o,dry){
      if(o==null)return;if(typeof o!=='object'||Array.isArray(o))throw new Error('That file is not a Dealpin backup.');
      const db={};for(const col of MOD_COLLECTIONS){const v=o[col];if(v==null)continue;if(!Array.isArray(v))throw new Error('That file is not a Dealpin backup.');
        db[col]=v.slice(0,MOD_LIMIT).map(x=>({...norm(SP[col],x||{}),id:ID.test(x&&x.id)?x.id:mkid(),at:Number.isFinite(+(x&&x.at))&&+x.at>0?+x.at:Date.now(),up:Number.isFinite(+(x&&x.up))&&+x.up>0?+x.up:Date.now(),rev:Math.max(1,Math.floor(+(x&&x.rev))||1)}))}
      if(!dry)wr(db)},
    async clear(){try{localStorage.removeItem(K)}catch{}},
    async purgeFiles(){}
  };
})();
/* In supabase mode Tools data lives online (js/supabase-mods.js); otherwise it stays on the device. */
const ModStore=(typeof RemoteModStore!=='undefined'&&DEALPIN.mode==='supabase')?RemoteModStore:LocalModStore;

/* Money maths in the smallest unit of each currency (cents, pence, yen…), so totals never drift. */
const mn=(x,cur)=>Math.round(Number(x)*10**minorDigits(cur)),mj=(v,cur)=>v/10**minorDigits(cur);
const fmM=(v,cur)=>money(mj(v,cur),cur);
const sumP=(arr,cur)=>arr.reduce((u,p)=>u+mn(p.amt,cur),0);
const Calc={
  line:(it,cur)=>Math.round(mn(it.p,cur)*it.q),
  invoice(i){const sub=i.items.reduce((u,x)=>u+Calc.line(x,i.cur),0),dc=Math.min(sub,Math.max(0,mn(i.disc,i.cur))),tx=Math.round((sub-dc)*Math.max(0,i.tax)/100),tot=sub-dc+tx,paid=sumP(i.pay,i.cur);return{sub,dc,tx,tot,paid,bal:tot-paid}},
  ledger(x){const tot=mn(x.amt,x.cur),paid=sumP(x.pay,x.cur);return{tot,paid,bal:tot-paid}},
  /* Splits bill + delivery fee between members so the shares add up to the exact smallest coin.
     Bill by quantity (or equally); delivery always equally; leftover coins go to the largest remainders. */
  split(g){const mem=g.mem,k=mem.length;if(!k)return[];
    const T=mn(g.total,g.cur),F=mn(g.fee,g.cur),byQty=g.split==='qty'&&mem.some(x=>x.q>0),w=mem.map(x=>byQty?x.q:1),W=w.reduce((u,x)=>u+x,0);
    const exact=w.map(x=>T*x/W+F/k),base=exact.map(Math.floor);let left=T+F-base.reduce((u,x)=>u+x,0);
    const order=exact.map((x,j)=>[x-base[j],j]).sort((u,v)=>v[0]-u[0]||u[1]-v[1]);
    for(let j=0;left>0;j++,left--)base[order[j%k][1]]++;return base},
  /* What a rider earns for one delivered job. null = cannot be worked out (flat rate set in another currency). */
  earn(j,r){if(!r||j.st!=='delivered')return 0;const f=mn(j.fee,j.cur);
    if(r.kind==='pct')return Math.round(f*r.rate/100);
    return r.cur===j.cur?mn(r.rate,j.cur):null}
};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dt=x=>x?new Date(x+'T00:00').toLocaleDateString(REGION.locale,{day:'numeric',month:'short',year:'numeric'}):'';

/* Spreadsheet export. Cells that start with = + - @ are prefixed so a spreadsheet never runs them as formulas. */
const csvCell=v=>{let t=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(t))t="'"+t;return /[",\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t};
const toCsv=(head,rows)=>'﻿'+[head,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
