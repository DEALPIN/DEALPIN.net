// Online Tools on a real Postgres engine (PGlite): the same contract suite LocalModStore passes, plus attacks, isolation, proof files and parity with the on-device rules.
// Run from this folder: npm i --no-save @electric-sql/pglite && node tests/mods-online.test.mjs
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';import vm from 'vm';import {createRequire} from 'module';
const require=createRequire(import.meta.url),root=new URL('../',import.meta.url),dir=new URL('supabase/',root),db=new PGlite({extensions:{pgcrypto}});
let bad=0;const ck=(n,c)=>{console.log(c?'ok  ':'FAIL',n);if(!c){bad=1;process.exitCode=1}};
await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant usage on schema public to anon,authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated; grant select,insert,delete on storage.objects to anon,authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;`);
for(const f of ['schema.sql','storage.sql','phase-two-products.sql','phase-three-requests.sql','phase-four-requests-online.sql','phase-five-tools-sync.sql'])await db.exec(fs.readFileSync(new URL(f,dir),'utf8'));
const U1=(await db.query(`insert into auth.users default values returning id`)).rows[0].id,U2=(await db.query(`insert into auth.users default values returning id`)).rows[0].id;
const q=async(role,uid,sql,params=[])=>{try{await db.exec('set role '+role);await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[uid||'']);const r=await db.query(sql,params);return{ok:true,rows:r.rows}}catch(e){return{ok:false,err:e.message}}finally{await db.exec('reset role')}};

// ---- the app's own code, talking to the database through a pretend network
const files=new Map();   // storage: path -> bytes
const ls={};const sb={TextEncoder,URL,AbortController,crypto,atob,btoa,Blob,console,Intl,Date,JSON,Math,Number,String,Array,Object,navigator:{language:'en-US'},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>ls[k]=v,removeItem:k=>delete ls[k]},setTimeout,clearTimeout};sb.window=sb;
sb.DEALPIN={mode:'supabase',url:'https://x.supabase.co',anonKey:'anon'};
const ARGS={p_ops:'jsonb',p_data:'jsonb',p_dry:'boolean',p_merge:'boolean'};
const reply=(status,body)=>{const t=body===undefined?'':JSON.stringify(body);return{ok:status<400,status,text:async()=>t,json:async()=>JSON.parse(t||'null')}};
sb.fetch=async(u,o={})=>{const p=u.replace('https://x.supabase.co',''),m=o.method||'GET',auth=(o.headers||{}).Authorization||'',uid=/^Bearer tok-(.+)$/.exec(auth)?.[1]||'';
  let mt;
  if((mt=/^\/rest\/v1\/rpc\/(\w+)$/.exec(p))){const a=JSON.parse(o.body||'{}'),ks=Object.keys(a);
    const r=await q(uid?'authenticated':'anon',uid,`select ${mt[1]}(${ks.map((k,i)=>`${k}=>$${i+1}${ARGS[k]?'::'+ARGS[k]:''}`).join(',')}) as r`,ks.map(k=>ARGS[k]==='jsonb'?JSON.stringify(a[k]):a[k]));
    if(!r.ok)return reply(400,{code:'P0001',message:r.err});return reply(200,r.rows[0].r)}
  if((mt=/^\/storage\/v1\/object\/deal-media\/(.+)$/.exec(p))&&m==='POST'){
    if(!new RegExp('^s/'+uid+'/[0-9a-f]{32}\\.jpg$').test(mt[1]))return reply(403,{});files.set(mt[1],o.body.size);return reply(200,{})}   // the storage policy
  if(p==='/storage/v1/object/deal-media'&&m==='DELETE'){for(const x of JSON.parse(o.body).prefixes)if(x.startsWith('s/'+uid+'/'))files.delete(x);return reply(200,[])}
  return reply(404,{})};
vm.createContext(sb);
for(const f of ['constants','store','region','auth','supabase-store','supabase-mods','mods-core'])vm.runInContext(fs.readFileSync(new URL('js/'+f+'.js',root),'utf8'),sb);
vm.runInContext('this.X={RemoteModStore,ModStore,LocalModStore,Session,MOD_COLLECTIONS}',sb);
const {RemoteModStore:R,ModStore,LocalModStore:L,Session}=sb.X;
const as=uid=>Session.set({access_token:'tok-'+uid,refresh_token:'r',expires_at:Date.now()+36e5,user:{id:uid}});
const no=async f=>{try{await f();return null}catch(e){return e}};
const jpg='data:image/jpeg;base64,'+Buffer.from('fakejpeg').toString('base64'),png='data:image/png;base64,'+Buffer.from('fakepng').toString('base64');

ck('supabase mode uses the online adapter',ModStore===R&&R.where==='online');
let e=await no(()=>R.list('ledger'));ck('signed out: Tools data needs sign-in',!!e&&/sign in/i.test(e.message));
as(U1);

// ---- the shared contract: every adapter must pass it unchanged
await (await import('module')).createRequire(import.meta.url)('./contract-suite.js')(R,ck);

// ---- who may touch what
ck('nobody can read or write the table directly',!(await q('authenticated',U1,'select * from mod_records')).ok&&!(await q('anon',null,'select * from mod_records')).ok&&!(await q('authenticated',U1,`insert into mod_records(owner,col,id,at,up,doc) values($1,'ledger','abcdefghij',1,1,'{}')`,[U1])).ok);
ck('the helper functions are not callable by the public',!(await q('authenticated',U1,`select mod_norm('[]'::jsonb,'{}'::jsonb,null,null)`)).ok&&!(await q('anon',null,`select mod_apply('[]'::jsonb)`)).ok&&!(await q('anon',null,`select mod_list('ledger')`)).ok);
const mine=await R.save('ledger',{who:'Mine',amt:10,cur:'USD'});
as(U2);ck('another seller sees nothing of mine',(await R.list('ledger')).length===0&&(await R.get('ledger',mine.id))===null);
const theirs=await R.save('ledger',{...mine,who:'Hijack'});
ck('saving with someone else\'s id never touches their record',theirs.id!==mine.id&&theirs.rev===1);
await R.del('ledger',mine.id);as(U1);ck('deleting someone else\'s id does nothing',(await R.get('ledger',mine.id)).who==='Mine');

// ---- rules enforced by the server itself
const huge=await R.save('ledger',{amt:1e6,who:'x'.repeat(5000),note:'y'.repeat(5000),pay:Array.from({length:500},(_,i)=>({amt:i,at:i,note:'n'}))});
ck('long text and lists are cut to their limits',huge.who.length===60&&huge.note.length===140&&huge.pay.length===200&&huge.pay[199].amt===499);
const money=await R.save('stock',{name:'m',price:'12.345',cur:'USD',qty:'1.23456',low:'abc'});
ck('money follows the currency (cents), quantities keep 3 decimals, rubbish becomes 0',money.price===12.35&&money.qty===1.235&&money.low===0);
ck('yen has no decimals and dinar has three',(await R.save('stock',{name:'y',price:12.7,cur:'JPY'})).price===13&&(await R.save('stock',{name:'k',price:1.2345,cur:'KWD'})).price===1.235);
ck('numbers are limited to a trillion',(await R.save('stock',{name:'b',price:1e30,cur:'USD'})).price===1e12);
ck('dates must be real dates',(await R.save('ledger',{who:'d',due:'2024-02-30'})).due===''&&(await R.save('ledger',{who:'d',due:'2024-02-29'})).due==='2024-02-29');
ck('a map pin must be real',(await R.save('jobs',{pin:{lat:95,lng:0}})).pin===null&&(await R.save('jobs',{pin:{lat:'0.1234567',lng:-45}})).pin.lat===0.123457);
ck('objects and numbers sent as text fields are made safe',(await R.save('ledger',{who:{a:1},phone:42})).who===''&&(await R.save('ledger',{who:'a',phone:42})).phone==='42');
e=await no(()=>R.batch(Array.from({length:201},()=>({op:'save',col:'stock',obj:{name:'z'}}))));ck('a batch is capped at 200 operations',!!e);
e=await no(()=>R.batch('nope'));ck('a batch must be a list',!!e);
const sv=await R.save('stock',{name:'rev'});const sv2=await R.save('stock',{...sv,rev:undefined,name:'rev2'});ck('a save without a rev overwrites (the app always sends it)',sv2.rev===2);
ck('a stale save changes nothing, even inside a batch',await (async()=>{const x=await no(()=>R.batch([{op:'save',col:'stock',obj:{name:'fresh'}},{op:'save',col:'stock',obj:{...sv,name:'late'}}]));const l=await R.list('stock');return!!x&&/changed/.test(x.message)&&!l.some(y=>y.name==='fresh'||y.name==='late')})());

// ---- proof photos
const j1=await R.save('jobs',{client:'C',dname:'D',proof:jpg});
const pth=j1.proof;ck('a proof photo is uploaded to my folder and the record keeps only the path',new RegExp('^s/'+U1+'/[0-9a-f]{32}\\.jpg$').test(pth)&&files.has(pth)&&!JSON.stringify(j1).includes('base64'));
const j2=await R.save('jobs',{...j1,note:'edited'});ck('saving again keeps the same photo',j2.proof===pth&&files.has(pth));
const j3=await R.save('jobs',{...j2,proof:jpg});await new Promise(r=>setTimeout(r,20));ck('replacing the photo removes the old file',j3.proof!==pth&&!files.has(pth)&&files.has(j3.proof));
const forged=await R.save('jobs',{client:'F',proof:'s/'+U2+'/'+'a'.repeat(32)+'.jpg'});ck('a path into another seller\'s folder is dropped',forged.proof==='');
ck('a path outside the photo folder or a non-jpeg is dropped',(await R.save('jobs',{proof:'https://evil.example/x.jpg'})).proof===''&&(await R.save('jobs',{proof:png})).proof===''&&(await R.save('jobs',{proof:'../../etc/passwd'})).proof==='');
const before=files.size;e=await no(()=>R.batch([{op:'save',col:'jobs',obj:{client:'up',proof:jpg}},{op:'save',col:'nope',obj:{}}]));await new Promise(r=>setTimeout(r,20));
ck('a failed save cleans up the photo it uploaded',!!e&&files.size===before);
await R.del('jobs',j3.id);await new Promise(r=>setTimeout(r,20));ck('deleting a delivery removes its photo',!files.has(j3.proof));

// ---- move a phone's records online (merge) and backups
await L.clear();const dv=await L.save('stock',{name:'From phone',qty:4});await L.save('jobs',{client:'Phone',proof:jpg});
const mine1=(await R.list('stock')).length;
const exp=await L.export();ck('adopt uploads this phone\'s records and keeps what is online',await (async()=>{const n=await R.adopt(exp);const st=await R.list('stock'),jb=await R.list('jobs');return n===2&&st.length===mine1+1&&st.some(x=>x.name==='From phone')&&jb.some(x=>x.client==='Phone'&&/^s\//.test(x.proof)&&files.has(x.proof))})());
ck('adopting the same records twice adds nothing',(await R.adopt(exp))===0&&(await R.list('stock')).length===mine1+1);
ck('adopt ignores rubbish',(await R.adopt(null))===0&&(await R.adopt([1]))===0);
const fx=await R.export();ck('export carries every type and the stored paths',['ledger','invoices','riders','jobs','setl','stock','groups'].every(c=>Array.isArray(fx[c]))&&fx.jobs.some(x=>/^s\//.test(x.proof)));
await R.import({jobs:[{client:'only',proof:jpg}]});await new Promise(r=>setTimeout(r,20));
ck('a restore replaces everything and removes the photos it no longer uses',(await R.list('stock')).length===0&&(await R.list('jobs')).length===1&&files.size===1);
ck('a restore keeps ids and dates when they are valid',await (async()=>{await R.import({ledger:[{id:'abcdefghij',at:1700000000000,up:1700000001000,rev:7,who:'Old'}]});const x=await R.get('ledger','abcdefghij');return x.at===1700000000000&&x.up===1700000001000&&x.rev===7})());
ck('a restore with two records using the same id keeps both',(await (async()=>{await R.import({ledger:[{id:'abcdefghij',who:'A'},{id:'abcdefghij',who:'B'}]});return (await R.list('ledger')).length})())===2);
e=await no(()=>R.import({ledger:'x'}));ck('a bad backup is refused before anything changes',!!e&&(await R.list('ledger')).length===2);

// ---- limits
await db.query(`insert into mod_records(owner,col,id,at,up,doc) select $1,'stock',substr(md5(g::text),1,10),g,g,'{}' from generate_series(1,4999) g`,[U1]);
await R.import({stock:[{name:'one'}]},true);
ck('the 5000 record limit is enforced',(await R.save('stock',{name:'last'})).rev===1&&!!(await no(()=>R.save('stock',{name:'too many'}))));
ck('a restore cannot go beyond the limit either',await (async()=>{await R.import({stock:Array.from({length:5200},(_,i)=>({name:'s'+i}))});return (await R.list('stock')).length===5000})());
ck('the same account can still save over its limit when it edits',await (async()=>{const l=await R.list('stock');return(await R.save('stock',{...l[0],name:'edit'})).rev===l[0].rev+1})());
await R.clear();


// ---- money and stock rules the server enforces itself
as(U2);
const lg=await R.save('ledger',{who:'L',amt:50,cur:'USD'});
ck('a ledger payment up to the total is accepted',(await R.save('ledger',{...lg,pay:[{amt:30,at:1},{amt:20,at:2}]})).pay.length===2);
e=await no(()=>R.save('ledger',{...lg,rev:undefined,pay:[{amt:30},{amt:20.01}]}));ck('a ledger cannot be overpaid by one cent',!!e&&/more than the total/.test(e.message));
e=await no(()=>R.save('ledger',{...lg,rev:undefined,pay:[{amt:-5}]}));ck('a negative payment is refused',!!e&&/negative/.test(e.message));
const iv=await R.save('invoices',{no:'1',cur:'USD',tax:7.5,disc:5,items:[{d:'a',q:3,p:19.99},{d:'b',q:1,p:0.1}]});   // 6007-500=5507 +413 tax = 5920
ck('an invoice can be paid exactly to its total',(await R.save('invoices',{...iv,pay:[{amt:59.2}]})).pay[0].amt===59.2);
e=await no(()=>R.save('invoices',{...iv,rev:undefined,pay:[{amt:59.21}]}));ck('an invoice cannot be overpaid',!!e&&/more than the total/.test(e.message));
ck('yen invoices have no cents',!(await no(()=>R.save('invoices',{no:'2',cur:'JPY',tax:10,items:[{d:'a',q:3,p:1200}],pay:[{amt:3960}]})))&&!!(await no(()=>R.save('invoices',{no:'3',cur:'JPY',tax:10,items:[{d:'a',q:3,p:1200}],pay:[{amt:3961}]}))));
e=await no(()=>R.save('stock',{name:'neg',qty:-1}));ck('stock cannot go below 0',!!e&&/below 0/.test(e.message));
ck('stock of exactly 0 is fine',(await R.save('stock',{name:'zero',qty:0})).qty===0);
e=await no(()=>R.batch([{op:'save',col:'stock',obj:{name:'ok1'}},{op:'save',col:'stock',obj:{name:'bad',qty:-3}}]));ck('a rule broken inside a batch undoes the whole batch',!!e&&!(await R.list('stock')).some(x=>x.name==='ok1'));
ck('a backup is never refused for what it already holds',await (async()=>{await R.import({stock:[{name:'old',qty:-2}],ledger:[{who:'o',amt:1,pay:[{amt:5}]}]});return (await R.list('stock')).length===1})());
await R.clear();

// ---- the server and the phone agree on every rule (fuzz against the on-device adapter)
let seed=7;const rnd=()=>(seed=(seed*1664525+1013904223)%4294967296)/4294967296,pick=a=>a[Math.floor(rnd()*a.length)];
const junk=()=>pick(['',' ','abc','  padded  ',0,1,-1,12.3456,'12.3456','1e3','1e999',-1e15,1e15,null,undefined,true,false,[],{},[1,2],{lat:1,lng:2},{lat:'x',lng:2},'2024-05-06','2024-13-01','2024-02-30','USD','usd','JPY','KWD','EUR','owed','owe','evil','flat','pct','delivered','nope','qty','equal','open','<b>x</b>','tab\there','é'.repeat(30),'x'.repeat(400),1.0005,2.675,0.5,1.5,-0.001,'  7 ']);
const rec=col=>{const o={};for(const f of L.SP[col]){o[f.k]=f.t==='a'?(rnd()<.2?junk():Array.from({length:Math.floor(rnd()*4)},()=>{const it={};for(const g of f.of)it[g.k]=junk();return it})):f.t==='i'?'':junk()}return o};
let diff=0,shown=0,skipped=0;
for(let i=0;i<400;i++){const col=pick(MODCOLS());const o=rec(col);await L.clear();const a=await L.save(col,o);let b;try{b=await R.save(col,o)}catch(x){if(/more than the total|negative|below 0/.test(x.message)){skipped++;continue}throw x}
  const strip=x=>{const y={...x};delete y.id;delete y.at;delete y.up;delete y.rev;return JSON.stringify(y,Object.keys(y).sort())};
  const norm=x=>JSON.stringify(JSON.parse(strip(x)),(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort()):v);
  if(norm(a)!==norm(b)){diff++;if(shown++<4)console.log('  differs',col,JSON.stringify(o).slice(0,200),'\n   device',norm(a).slice(0,300),'\n   server',norm(b).slice(0,300))}}
ck('server and device normalise random records identically ('+(400-skipped)+' compared, '+skipped+' refused by the money rules)',diff===0&&skipped<300);
function MODCOLS(){return['ledger','invoices','riders','jobs','setl','stock','groups']}
await R.clear();await L.clear();

// ---- account deletion removes everything with it
await R.save('jobs',{client:'gone',proof:jpg});await R.save('ledger',{who:'gone'});
await R.purgeFiles();ck('purgeFiles removes my proof photos',![...files.keys()].some(k=>k.startsWith('s/'+U1)));
await db.query('delete from auth.users where id=$1',[U1]);ck('deleting the account deletes every Tools record',(await db.query('select count(*)::int n from mod_records where owner=$1',[U1])).rows[0].n===0);

// ---- rate limit (per account, not per address)
as(U2);let limited=0;for(let i=0;i<1300;i++){try{await R.list('stock')}catch(x){if(/Too many/.test(x.message)){limited++;break}}}
ck('one account is rate limited',limited===1);
const U3=(await db.query(`insert into auth.users default values returning id`)).rows[0].id;as(U3);ck('another account is not slowed down by it',(await R.list('stock')).length===0);
process.exit(bad);
