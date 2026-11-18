process.on('uncaughtException',e=>{console.log('UNCAUGHT',String(e.message||e).slice(0,300));process.exit(1)});
// Runs the admin backend (setup SQL 00, admin.sql, 7 crash reports, 8 admin console) on a real Postgres engine (PGlite, in memory).
// Not Supabase: auth and storage are small stand-ins. Run from the app folder:  npm i --no-save @electric-sql/pglite  &&  node tests/admin-backend.test.mjs
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
import {fileURLToPath} from 'url';
const base=process.argv[2]||fileURLToPath(new URL('../supabase',import.meta.url));
const db=new PGlite({extensions:{pgcrypto}});
let fails=0;const ck=(n,c,extra='')=>{console.log(c?'ok  ':'FAIL',n,c?'':extra);if(!c)fails++};
await db.exec(`create schema if not exists extensions; create role anon nologin; create role authenticated nologin; create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, phone text, created_at timestamptz default now(), last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, phone_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', banned_until timestamptz);
create table auth.identities(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text);
create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, created_at timestamptz default now(), updated_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
grant usage on schema auth to anon,authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated; grant select,insert,delete on storage.objects to anon,authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;`);
for(const f of ['setup/00-ALL-IN-ONE.sql','admin.sql','setup/7-crash-reports.sql','setup/8-admin-console.sql']){
  try{await db.exec(fs.readFileSync(base+'/'+f,'utf8'))}catch(e){console.log('LOAD FAIL',f,e.message);process.exit(1)}
}
const sess=async(role,uid,aal)=>{await db.exec('set role '+role);await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,[uid||'',JSON.stringify({sub:uid||'',aal:aal||'aal1'})])};
const q=async(role,uid,aal,sql,params=[])=>{try{await sess(role,uid,aal);const r=await db.query(sql,params);return{ok:true,rows:r.rows,v:r.rows[0]&&Object.values(r.rows[0])[0]}}catch(e){return{ok:false,err:String(e.message||e).slice(0,200)}}finally{await db.exec('reset role')}};
const rpc=(role,uid,aal,fn,args)=>q(role,uid,aal,`select ${fn}(${args.map((_,i)=>`$${i+1}`).join(',')}) as r`,args.map(a=>typeof a==='object'&&a!==null?JSON.stringify(a):a));
const U=async(email)=>(await db.query(`insert into auth.users(email) values($1) returning id`,[email])).rows[0].id;
const A=await U('admin@x.test'),B=await U('seller@x.test'),C=await U('third@x.test');
await db.exec(`insert into public.admins(id) values('${A}')`);
await q('authenticated',B,'aal1',`insert into profiles(id,name,handle,phone,pay) values($1,'Mama Joan','mama-joan','0772000000','0772000001')`,[B]);
await db.query(`insert into public.products(id,owner,title,price,currency,status) values('prod000001',$1,'Red sneakers',85000,'UGX','published')`,[B]);
const pr=await q('authenticated',B,'aal1',`select count(*)::int c from products where id='prod000001'`);
ck('seller can see own product (setup)',pr.ok&&pr.v===1,JSON.stringify(pr));
await db.exec(`select set_config('dealpin.act','1',false)`);
await db.query(`insert into public.deals(id,owner,buyer_token,rider_token,status,doc) values('dealaaaaaa',$1,repeat('a',32),repeat('b',32),'created',$2)`,[B,JSON.stringify({id:'dealaaaaaa',title:'Red sneakers',price:85000,currency:'UGX',delivery:'Buyer collects',seller:{name:'Mama Joan',handle:'mama-joan'},status:'created',created:Date.now(),events:[{s:'created',at:Date.now()}],buyer:{name:'Asha Buyer',phone:'0700000000'}})]);
await db.exec(`select set_config('dealpin.act','0',false)`);
await db.query(`insert into public.crash_reports(kind,msg,page,v) values('error','Failed to load','deals','1.3.0')`);

// access
ck('anon cannot call admin_gate', !(await rpc('anon',null,null,'public.admin_gate',[])).ok);
ck('seller (aal2) cannot call admin_overview', !(await rpc('authenticated',B,'aal2','public.admin_overview',[])).ok);
const g1=await rpc('authenticated',A,'aal1','public.admin_gate',[]);
ck('admin gate reports admin with aal1', g1.ok&&g1.v&&!!g1.rows[0].r.admin&&g1.rows[0].r.aal==='aal1',JSON.stringify(g1));
ck('admin without second factor is refused (aal1)', !(await rpc('authenticated',A,'aal1','public.admin_users',['',25,0])).ok);
ck('admin with second factor (aal2) can read users', (await rpc('authenticated',A,'aal2','public.admin_users',['',25,0])).ok);
ck('authenticated cannot read admin_events table directly', !(await q('authenticated',A,'aal2',`select count(*) from public.admin_events`)).ok);
{const ov=await rpc('authenticated',A,'aal2','public.admin_overview',[]);ck('overview works for admin aal2', ov.ok, ov.err);}

// reads
const users=await rpc('authenticated',A,'aal2','public.admin_users',['mama',25,0]);
ck('user search finds seller by handle', users.ok&&users.rows[0].r.rows.length===1, JSON.stringify(users).slice(0,200));
const detail=await rpc('authenticated',A,'aal2','public.admin_user',[B]);
ck('seller detail loads', detail.ok&&detail.rows[0].r.profile.name==='Mama Joan');
const deal=await rpc('authenticated',A,'aal2','public.admin_deal',['dealaaaaaa']);
const dstr=JSON.stringify(deal.rows&&deal.rows[0]&&deal.rows[0].r);
ck('deal detail loads', deal.ok);
ck('deal detail never returns link tokens', !!deal.ok && !dstr.includes('aaaaaaaa') && !dstr.includes('bbbbbbbb') && !dstr.includes('buyer_token') && !dstr.includes('rider_token'), dstr.slice(0,120));
const deals=await rpc('authenticated',A,'aal2','public.admin_deals',['asha',"",25,0]);
ck('deal search by buyer name works', deals.ok&&deals.rows[0].r.total===1, JSON.stringify(deals).slice(0,160));
const prods=await rpc('authenticated',A,'aal2','public.admin_products',['','',25,0]);
ck('products list loads with seller shop', prods.ok&&prods.rows[0].r.rows[0].shop==='Mama Joan');
const tools=await rpc('authenticated',A,'aal2','public.admin_tool_records',[B,'',50]);
ck('tool records view works', tools.ok);
ck('trends returns requested days', (await rpc('authenticated',A,'aal2','public.admin_trends',[7])).rows[0].r.length===7);
ck('health returns six checks', (await rpc('authenticated',A,'aal2','public.admin_health',[])).rows[0].r.length===6);
const cr=await rpc('authenticated',A,'aal2','public.admin_crashes',[50,0,'']);
ck('crash list loads', cr.ok&&cr.rows[0].r.total>=1, JSON.stringify(cr).slice(0,160));
const cg=await rpc('authenticated',A,'aal2','public.admin_crash_groups',[7]);
ck('crash groups count repeats', cg.ok&&cg.rows[0].r.length>=1&&cg.rows[0].r[0].count>=1);

// actions
const noReason=await rpc('authenticated',A,'aal2','public.admin_set_product_status',['prod000001','paused','']);
ck('product pause needs a reason', !noReason.ok);
const pause=await rpc('authenticated',A,'aal2','public.admin_set_product_status',['prod000001','paused','Misleading photos']);
ck('product pause with reason works', pause.ok, pause.err);
ck('same status again is refused', !(await rpc('authenticated',A,'aal2','public.admin_set_product_status',['prod000001','paused','again'])).ok);
const badStatus=await rpc('authenticated',A,'aal2','public.admin_set_product_status',['prod000001','deleted','x reason']);
ck('unknown product status refused', !badStatus.ok);
const selfSusp=await rpc('authenticated',A,'aal2','public.admin_set_suspended',[A,true,'testing reason']);
ck('admin cannot suspend self', !selfSusp.ok);
const noSuspReason=await rpc('authenticated',A,'aal2','public.admin_set_suspended',[B,true,'']);
ck('suspension needs a reason', !noSuspReason.ok);
const susp=await rpc('authenticated',A,'aal2','public.admin_set_suspended',[B,true,'Repeated fake receipts']);
ck('suspend seller with reason', susp.ok, susp.err);
const bannedRow=(await db.query(`select banned_until is not null and banned_until>now() as b from auth.users where id=$1`,[B])).rows[0];
ck('suspended account is blocked at auth level', bannedRow&&bannedRow.b===true);
const reinst=await rpc('authenticated',A,'aal2','public.admin_set_suspended',[B,false,'Appeal accepted']);
ck('reinstate seller', reinst.ok&&(await db.query(`select banned_until from auth.users where id=$1`,[B])).rows[0].banned_until===null);
const prof=await rpc('authenticated',A,'aal2','public.admin_set_profile',[B,'Mama Joan Stores','0772000001','Typo fix']);
ck('edit seller name with reason', prof.ok, prof.err);
const addB=await rpc('authenticated',A,'aal2','public.admin_add_admin',['seller@x.test','Second admin for support']);
ck('add admin by email', addB.ok, addB.err);
const addNone=await rpc('authenticated',A,'aal2','public.admin_add_admin',['nobody@x.test','Second admin']);
ck('adding an unknown email is refused', !addNone.ok);
const admins=await rpc('authenticated',A,'aal2','public.admin_admins',[]);
ck('admin list shows two admins', admins.ok&&admins.rows[0].r.length===2);
const rmSelf=await rpc('authenticated',A,'aal2','public.admin_remove_admin',[A,'self removal test']);
ck('cannot remove own admin rights', !rmSelf.ok);
const rmB=await rpc('authenticated',A,'aal2','public.admin_remove_admin',[B,'Support finished']);
ck('remove second admin', rmB.ok, rmB.err);

// activity log
const feed=await rpc('authenticated',A,'aal2','public.admin_events_feed',[0,null,200,'','']);
const rowsF=feed.rows&&feed.rows[0].r||[];
const acts=new Set(rowsF.map(e=>e.action+':'+e.entity));
ck('activity records the deal creation from the trigger', rowsF.some(e=>e.entity==='deal'&&e.summary==='Deal created'), JSON.stringify(rowsF.slice(0,2)));
ck('activity records the admin moderation with reason', rowsF.some(e=>e.action==='moderate'&&e.reason==='Misleading photos'));
ck('activity records suspension and reinstatement', acts.has('suspend:user')&&acts.has('reinstate:user'));
ck('activity records viewing personal data', acts.has('view:user')&&acts.has('view:deal')&&acts.has('view:tools'));
ck('activity has no seller or buyer names in summaries', !rowsF.some(e=>/Asha|Joan|Buyer|0772|0700/.test(e.summary+e.reason)));
const maxId=Math.max(...rowsF.map(e=>e.id));
await rpc('authenticated',A,'aal2','public.admin_set_profile',[B,'Mama Joan','0772000001','Second edit']);
const after=await rpc('authenticated',A,'aal2','public.admin_events_feed',[maxId,null,50,'','']);
ck('live feed returns only newer events', after.ok&&after.rows[0].r.length>=1&&after.rows[0].r.every(e=>e.id>maxId));
const filt=await rpc('authenticated',A,'aal2','public.admin_events_feed',[0,null,200,'moderate','']);
ck('feed filters by action', filt.ok&&filt.rows[0].r.every(e=>e.action==='moderate'));
console.log(fails?`FAILURES: ${fails}`:'ALL PASS');
process.exit(fails?1:0);
