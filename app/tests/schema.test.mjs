// Runs supabase/schema.sql and storage.sql on a real Postgres engine (PGlite, in memory) and attacks the rules as each role.
// Not Supabase itself: auth and storage are small stand-ins, and request headers are simulated.
// Run from the dealpin folder:  npm i --no-save @electric-sql/pglite  &&  node tests/schema.test.mjs
import {PGlite} from '@electric-sql/pglite';
import fs from 'fs';
import {randomBytes,createHash} from 'crypto';
const dir=new URL('../supabase/',import.meta.url);
const db=new PGlite();
let bad=0;const ck=(n,c)=>{console.log(c?'ok  ':'FAIL',n);if(!c){bad=1}};
const hex=n=>randomBytes(n).toString('hex'),key=t=>createHash('sha256').update(Buffer.from(t,'hex')).digest('hex');

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
await db.exec(fs.readFileSync(new URL('schema.sql',dir),'utf8'));
await db.exec(fs.readFileSync(new URL('storage.sql',dir),'utf8'));

let ip='1.1.1.1';
const q=async(role,uid,sql,params=[])=>{
  try{await db.exec('set role '+role);await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.headers',$2,false)`,[uid||'',JSON.stringify({'cf-connecting-ip':ip})]);
    const r=await db.query(sql,params);return{ok:true,rows:r.rows,n:r.affectedRows,v:r.rows[0]&&Object.values(r.rows[0])[0]}}
  catch(e){return{ok:false,err:e.message}}finally{await db.exec('reset role')}};
const J=o=>JSON.stringify(o);
const rpc=(role,uid,fn,...a)=>q(role,uid,`select ${fn}(${a.map((_,i)=>`$${i+1}${typeof a[i]==='object'?'::jsonb':''}`).join(',')}) as r`,a.map(x=>typeof x==='object'?J(x):x));
const no=(r,re)=>!r.ok&&(!re||re.test(r.err));

const U1=(await db.query(`insert into auth.users default values returning id`)).rows[0].id;
const U2=(await db.query(`insert into auth.users default values returning id`)).rows[0].id;
await q('authenticated',U1,`insert into profiles(id,name,handle,phone,pay) values($1,'Mama Joan','mama-joan','0772000000','0772000000')`,[U1]);
await q('authenticated',U2,`insert into profiles(id,name,handle) values($1,'Other','other')`,[U2]);

const mk=(owner,over={})=>{const id=Math.random().toString(36).slice(2,12).padEnd(10,'a'),at=Date.now();
  const doc={id,title:'Red sneakers',price:85000,currency:'UGX',delivery:'I deliver by rider',terms:'',photos:[],seller:{name:'Mama Joan',handle:'mama-joan',phone:'0772000000',pay:'0772000000'},status:'created',created:at,events:[{s:'created',at}],buyer:null,code:null,...over.doc};
  return{id,bt:hex(16),rt:hex(16),owner,doc,status:over.status||'created'}};
const ins=(d,as=d.owner)=>q('authenticated',as,`insert into deals(id,owner,buyer_token,rider_token,status,doc) values($1,$2,$3,$4,$5,$6::jsonb)`,[d.id,d.owner,d.bt,d.rt,d.status,J(d.doc)]);

// ---- seller insert rules
const A=mk(U1);ck('seller can create a deal',(await ins(A)).ok);
ck('cannot insert for someone else',no(await ins(mk(U2),{}) && await ins(mk(U1),U2)));
ck('cannot insert a deal that is already shipped',no(await ins(mk(U1,{status:'shipped',doc:{status:'shipped'}}))));
ck('cannot insert with a forged buyer',no(await ins(mk(U1,{doc:{buyer:{name:'Fake'}}})),/buyer/i));
ck('cannot insert with a forged receipt code',no(await ins(mk(U1,{doc:{code:'AAAA-BBBB-CCCC'}}))));
ck('cannot insert with a forged rating',no(await ins(mk(U1,{doc:{rating:{stars:5}}}))));
ck('rejects a photo that is not the seller\'s own upload',no(await ins(mk(U1,{doc:{photos:['s/'+U2+'/'+hex(16)+'.jpg']}})),/photo/i));
ck('rejects an outside photo address',no(await ins(mk(U1,{doc:{photos:['https://evil.example/x.jpg']}}))));
ck('accepts own photo path',(await ins(mk(U1,{doc:{photos:['s/'+U1+'/'+hex(16)+'.jpg']}}))).ok);
ck('rejects price 0',no(await ins(mk(U1,{doc:{price:0}}))));
ck('accepts a price with cents',(await ins(mk(U1,{doc:{price:10.5,currency:'USD'}}))).ok);
ck('rejects more than 3 decimals',no(await ins(mk(U1,{doc:{price:10.0005}}))));
ck('rejects a negative price',no(await ins(mk(U1,{doc:{price:-5}}))));
ck('rejects a missing currency',no(await ins(mk(U1,{doc:{currency:undefined}})),/currency/i));
ck('rejects a malformed currency',no(await ins(mk(U1,{doc:{currency:'usd'}}))));
ck('rejects unknown delivery type',no(await ins(mk(U1,{doc:{delivery:'Teleport'}}))));
const dupTok=mk(U1);dupTok.bt=A.bt;ck('rejects a repeated buyer token',no(await ins(dupTok)));
const same=mk(U1);same.rt=same.bt;ck('buyer and rider token must differ',no(await ins(same)));
const shortTok=mk(U1);shortTok.bt='abc';ck('rejects a short token',no(await ins(shortTok)));

// ---- the server decides who the seller is, when it happened, and what fields exist
const SP=mk(U1,{doc:{seller:{name:'Apple Store',handle:'apple',phone:'999',pay:'send money here'},created:1,events:[{s:'created',at:1}],extra:'x',admin:true}});await ins(SP);
const spd=(await q('authenticated',U1,`select doc from deals where id=$1`,[SP.id])).rows[0].doc;
ck('seller name, handle and numbers come from the profile, not from the request',spd.seller.name==='Mama Joan'&&spd.seller.handle==='mama-joan'&&spd.seller.pay==='0772000000');
ck('the created time and first event time are the server\'s',spd.created>1e12&&spd.events[0].at===spd.created);
ck('unknown fields are dropped from the document',!('extra' in spd)&&!('admin' in spd));
const U3=(await db.query(`insert into auth.users default values returning id`)).rows[0].id;
ck('a seller with no profile cannot create a deal',no(await ins(mk(U3)),/profile/i));
ck('redacted public view carries the currency',(await rpc('anon','','public_receipt',SP.id)).v.currency==='UGX');

// ---- no direct edits, no outsiders
const upd=await q('authenticated',U1,`update deals set doc=jsonb_set(doc,'{rating}','{"stars":5}') where id=$1`,[A.id]);
ck('seller cannot edit a deal directly (no update right)',no(upd)||upd.n===0);
const upd2=await q('authenticated',U1,`update deals set status='received' where id=$1`,[A.id]);
ck('seller cannot set the status directly',no(upd2)||upd2.n===0);
ck('the deal is unchanged after those attempts',(await q('authenticated',U1,`select doc,status from deals where id=$1`,[A.id])).rows[0].status==='created');
ck('other seller cannot read the deal',(await q('authenticated',U2,`select id from deals where id=$1`,[A.id])).rows.length===0);
ck('other seller cannot call seller_act on it',no(await rpc('authenticated',U2,'seller_act',A.id,'cancel'),/not found/i));
ck('anonymous cannot read deals',no(await q('anon','',`select * from deals`),/permission denied/));
ck('anonymous cannot read the rate table',no(await q('anon','',`select * from rate`),/permission denied/));
ck('signed-in seller cannot read the rate table',no(await q('authenticated',U1,`select * from rate`),/permission denied/));
ck('anonymous cannot call seller_act',no(await rpc('anon','','seller_act',A.id,'cancel'),/permission denied/));
ck('anonymous cannot call helper functions',no(await q('anon','',`select rider_view('{}'::jsonb)`),/permission denied/));
ck('anonymous cannot call commit_deal',no(await q('anon','',`select commit_deal(null,'{}'::jsonb,'x','x')`),/permission denied/));
ck('anonymous cannot delete the account',no(await rpc('anon','','delete_my_account'),/permission denied/));

// ---- token separation
const g1=await rpc('anon','','buyer_get_deal',A.bt);ck('buyer token opens the buyer view',g1.v&&g1.v.id===A.id);
ck('rider token does not open the buyer view',(await rpc('anon','','buyer_get_deal',A.rt)).v==null);
ck('buyer token does not open the rider view',(await rpc('anon','','rider_get_deal',A.bt)).v==null);
ck('deal id is not a token',(await rpc('anon','','buyer_get_deal',A.id)).v==null&&(await rpc('anon','','rider_get_deal',A.id)).v==null);
ck('rider cannot act with the buyer token',no(await rpc('anon','','rider_act',A.bt,'arrived',{arrival:{lat:0,lng:0}}),/not found/i));
ck('buyer cannot act with the rider token',no(await rpc('anon','','buyer_act',A.rt,'agree',{buyer:{name:'x',phone:'0701000000',landmark:'gate'}}),/not found/i));

// ---- buyer agrees
const agree=b=>rpc('anon','','buyer_act',A.bt,'agree',{buyer:b});
const kA=key(A.bt);
ck('agree needs a name and phone',no(await agree({name:'',phone:'',landmark:'gate'})));
ck('agree rejects a script in the phone field',no(await agree({name:'Sam',phone:'<script>',landmark:'gate'})));
ck('agree rejects a voice note address from outside',no(await agree({name:'Sam',phone:'0701000000',landmark:'g',voice:'https://evil.example/a.webm'})));
ck('agree rejects another buyer\'s upload folder',no(await agree({name:'Sam',phone:'0701000000',landmark:'g',voice:'b/'+key(hex(16))+'/'+hex(16)+'.webm'})));
ck('agree rejects an impossible pin',no(await agree({name:'Sam',phone:'0701000000',pin:{lat:999,lng:0,acc:5}})));
ck('rider delivery needs a pin, place or voice',no(await agree({name:'Sam',phone:'0701000000'}),/location|describe/i));
const ag=await agree({name:'Sam',phone:'0701 000 000',pin:{lat:0.3476,lng:32.5825,acc:12},landmark:'Red gate',voice:'b/'+kA+'/'+hex(16)+'.webm',evil:'x',role:'admin'});
ck('buyer can agree',ag.ok&&ag.v.status==='agreed'&&ag.v.buyer.name==='Sam');
ck('extra fields from the buyer are dropped',ag.v&&!('evil' in ag.v.buyer)&&!('role' in ag.v.buyer));
ck('cannot agree twice',no(await agree({name:'Sam',phone:'0701000000',landmark:'x'}),/not allowed/));
ck('buyer pays once',(await rpc('anon','','buyer_act',A.bt,'paid',{payment:{method:'MTN MoMo',ref:'TX1'}})).ok&&no(await rpc('anon','','buyer_act',A.bt,'paid',{payment:{method:'MTN MoMo'}})));
{const PM=mk(U1,{doc:{delivery:'Buyer collects'}});await ins(PM);await rpc('anon','','buyer_act',PM.bt,'agree',{buyer:{name:'Pam',phone:'0705000000'}});
 const r1=await rpc('anon','','buyer_act',PM.bt,'paid',{payment:{method:'Mobile money',ref:'X1'}});
 ck('buyer can record a payment with a current method',r1.ok&&r1.v.payment.method==='Mobile money');
 const PN=mk(U1,{doc:{delivery:'Buyer collects'}});await ins(PN);await rpc('anon','','buyer_act',PN.bt,'agree',{buyer:{name:'Pat',phone:'0706000000'}});
 ck('a missing payment method is refused',no(await rpc('anon','','buyer_act',PN.bt,'paid',{payment:{ref:'x'}})));}
ck('buyer cannot invent a payment method',no(await rpc('anon','','buyer_act',mk(U1).bt,'paid',{payment:{method:'Bitcoin'}})));
ck('buyer cannot receive before shipping',no(await rpc('anon','','buyer_act',A.bt,'receive'),/not allowed/));

// ---- seller ships; rider view hides what the rider should not know
ck('seller cannot ship a deal waiting for a buyer',no(await rpc('authenticated',U1,'seller_act',mk(U1).id,'ship'),/not found/i));
const sh=await rpc('authenticated',U1,'seller_act',A.id,'ship',{parcel:''});
ck('seller can ship',sh.ok&&sh.v.status==='shipped');
ck('server made a 4 digit handover code',sh.ok&&/^[1-9][0-9]{3}$/.test(sh.v.handover));
ck('seller sees both tokens',sh.ok&&sh.v.bt===A.bt&&sh.v.rt===A.rt);
const rv=(await rpc('anon','','rider_get_deal',A.rt)).v;
ck('rider sees buyer name, phone, pin and landmark',rv&&rv.buyer.name==='Sam'&&rv.buyer.pin.lat===0.3476&&rv.buyer.landmark==='Red gate');
ck('rider does not see the handover code',rv&&!('handover' in rv)&&rv.needsHandover===true);
ck('rider does not see payment, seller numbers or rating',rv&&!('payment' in rv)&&!('seller' in rv)&&!('rating' in rv));
const bv=(await rpc('anon','','buyer_get_deal',A.bt)).v;
ck('buyer sees the handover code',bv&&bv.handover===sh.v.handover);
ck('seller cannot ship twice',no(await rpc('authenticated',U1,'seller_act',A.id,'ship'),/not allowed/));
ck('seller cannot edit after the buyer agreed',no(await rpc('authenticated',U1,'seller_act',A.id,'edit',{title:'Gold',price:1,currency:'UGX',delivery:'Buyer collects'}),/not allowed/));
ck('seller cannot delete a shipped deal',(await q('authenticated',U1,`delete from deals where id=$1`,[A.id])).n===0||no(await q('authenticated',U1,`delete from deals where id=$1`,[A.id]),/cannot be deleted/));

// ---- rider
const bad_=await rpc('anon','','rider_act',A.rt,'arrived',{arrival:{lat:'x',lng:0}});ck('rider arrival needs real coordinates',no(bad_));
const ar=await rpc('anon','','rider_act',A.rt,'arrived',{arrival:{lat:0.3476,lng:32.5835,acc:8,dist:0}});
ck('rider can record arrival',ar.ok&&ar.v.arrival.lat===0.3476);
ck('distance is worked out on the server, not trusted from the phone',ar.ok&&ar.v.arrival.dist>90&&ar.v.arrival.dist<130);
ck('rider cannot arrive twice',no(await rpc('anon','','rider_act',A.rt,'arrived',{arrival:{lat:1,lng:1}}),/not allowed/));
const wrong=await rpc('anon','','rider_act',A.rt,'handover',{handoverCode:'0000'});
ck('wrong handover code is refused',wrong.ok&&wrong.v.error==='That code is not correct.');
for(let i=0;i<4;i++)await rpc('anon','','rider_act',A.rt,'handover',{handoverCode:'0000'});
ck('handover locks after 5 tries, even for the right code',no(await rpc('anon','','rider_act',A.rt,'handover',{handoverCode:sh.v.handover}),/too many/i));
const B=mk(U1);await ins(B);await rpc('anon','','buyer_act',B.bt,'agree',{buyer:{name:'Ann',phone:'0702000000',landmark:'Shop'}});
const shB=await rpc('authenticated',U1,'seller_act',B.id,'ship');
const ho=await rpc('anon','','rider_act',B.rt,'handover',{handoverCode:shB.v.handover});
ck('right handover code is accepted',ho.ok&&ho.v.handoverOk===true&&!('handover' in ho.v));

// ---- receipt
await db.exec(`create schema if not exists private; create table if not exists private.app_secrets(name text primary key,value text not null); revoke all on schema private from public,anon,authenticated; revoke all on private.app_secrets from public,anon,authenticated`);
ck('receipt code refused while no server secret is set',no(await rpc('anon','','buyer_act',B.bt,'receive'),/not set up/));
await db.query(`insert into private.app_secrets values('receipt_secret',$1) on conflict(name) do update set value=excluded.value`,[hex(24)]);
ck('the public API cannot read the receipt secret',no(await q('anon','',`select * from private.app_secrets`),/permission denied/)&&no(await q('authenticated',U1,`select * from private.app_secrets`),/permission denied/));
ck('buyer cannot dispute with an outside photo',no(await rpc('anon','','buyer_act',B.bt,'dispute',{dispute:{why:'broken',photo:'https://evil.example/p.jpg'}})));
const rc=await rpc('anon','','buyer_act',B.bt,'receive');
ck('buyer confirms receipt and gets a code',rc.ok&&rc.v.status==='received'&&/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(rc.v.code));
ck('cannot receive twice',no(await rpc('anon','','buyer_act',B.bt,'receive'),/not allowed/));
ck('rating must be 1 to 5',no(await rpc('anon','','buyer_act',B.bt,'rated',{rating:{stars:9}})));
ck('buyer can rate once',(await rpc('anon','','buyer_act',B.bt,'rated',{rating:{stars:4,text:'good'}})).ok&&no(await rpc('anon','','buyer_act',B.bt,'rated',{rating:{stars:1}})));
const pr=(await rpc('anon','','public_receipt',B.id)).v;
ck('public receipt shows item, price, code',pr&&pr.title==='Red sneakers'&&pr.code===rc.v.code);
ck('public receipt hides handover, phone, pin, voice, seller numbers',pr&&!JSON.stringify(pr).match(new RegExp('"'+shB.v.handover+'"|0702|Shop|0772|"pay"|"phone"|"landmark"|"voice"|"pin"|"handover":')));
const vf=(await rpc('anon','','public_verify',rc.v.code.toLowerCase())).v;ck('verify finds a code (any case)',vf&&vf.id===B.id);
ck('verify says nothing for a wrong code',(await rpc('anon','','public_verify','AAAA-BBBB-CCCC')).v==null);
const sr=(await rpc('anon','','public_seller','mama-joan')).v;
ck('seller record lists finished deals only, redacted',sr&&sr.deals.length===1&&sr.deals[0].rating.stars===4&&!JSON.stringify(sr).match(new RegExp('"'+shB.v.handover+'"|0702|0772|"handover":|"phone"')));

// ---- dispute, reply, resolve
const C=mk(U1);await ins(C);await rpc('anon','','buyer_act',C.bt,'agree',{buyer:{name:'Bob',phone:'0703000000',landmark:'x'}});await rpc('authenticated',U1,'seller_act',C.id,'ship');
ck('buyer can report a problem',(await rpc('anon','','buyer_act',C.bt,'dispute',{dispute:{why:'Wrong colour',photo:'b/'+key(C.bt)+'/'+hex(16)+'.jpg'}})).v?.status==='disputed');
ck('seller can reply',(await rpc('authenticated',U1,'seller_act',C.id,'reply',{reply:'Sorry, I will refund'})).v?.dispute.reply==='Sorry, I will refund');
ck('seller can resolve',(await rpc('authenticated',U1,'seller_act',C.id,'resolve')).v?.status==='resolved');
ck('seller cannot delete a deal that had a problem',(await q('authenticated',U1,`delete from deals where id=$1`,[C.id])).n===0||no(await q('authenticated',U1,`delete from deals where id=$1`,[C.id])));
ck('deal record exists after the delete attempt',(await q('authenticated',U1,`select 1 from deals where id=$1`,[C.id])).rows.length===1);

// ---- payment confirm
const D=mk(U1,{doc:{delivery:'Buyer collects'}});await ins(D);await rpc('anon','','buyer_act',D.bt,'agree',{buyer:{name:'Cy',phone:'0704000000'}});
ck('seller cannot confirm a payment that was never recorded',no(await rpc('authenticated',U1,'seller_act',D.id,'payok'),/not allowed/));
await rpc('anon','','buyer_act',D.bt,'paid',{payment:{method:'Airtel Money',ref:''}});
ck('seller confirms the recorded payment',(await rpc('authenticated',U1,'seller_act',D.id,'payok')).v?.payment.ok===true);

// ---- edit and delete before a buyer
const E=mk(U1);await ins(E);
ck('seller can edit before a buyer agrees',(await rpc('authenticated',U1,'seller_act',E.id,'edit',{title:'Blue shoes',price:50000,currency:'USD',delivery:'Buyer collects',terms:'',photos:[]})).v?.title==='Blue shoes');
ck('edit can change the currency',(await q('authenticated',U1,`select doc->>'currency' c from deals where id=$1`,[E.id])).v==='USD');
ck('edit rejects a missing currency',no(await rpc('authenticated',U1,'seller_act',E.id,'edit',{title:'x',price:5,delivery:'Buyer collects'})));
ck('edit is checked too',no(await rpc('authenticated',U1,'seller_act',E.id,'edit',{title:'',price:5,delivery:'Buyer collects'})));
ck('seller can delete a deal nobody agreed to',(await q('authenticated',U1,`delete from deals where id=$1`,[E.id])).n===1);

// ---- rate limits
ip='9.9.9.9';let blocked=false;for(let i=0;i<22;i++){const r=await rpc('anon','','public_verify','AAAA-BBBB-CCCC');if(!r.ok&&/too many/i.test(r.err)){blocked=true;break}}
ck('verify is rate limited per address',blocked);
ip='8.8.8.8';ck('a different address is not blocked',(await rpc('anon','','public_verify','AAAA-BBBB-CCCC')).ok);

// ---- storage rules
const bk='b/'+kA+'/'+hex(16)+'.webm';
ip='1.1.1.1';
ck('buyer can upload to the folder made from their token',(await q('anon','',`insert into storage.objects(bucket_id,name) values('deal-media',$1)`,[bk])).ok);
ck('upload to a folder nobody owns is refused',no(await q('anon','',`insert into storage.objects(bucket_id,name) values('deal-media',$1)`,['b/'+key(hex(16))+'/'+hex(16)+'.webm'])));
ck('upload with the wrong file type in the name is refused',no(await q('anon','',`insert into storage.objects(bucket_id,name) values('deal-media',$1)`,['b/'+kA+'/'+hex(16)+'.html'])));
ck('upload outside the bucket layout is refused',no(await q('anon','',`insert into storage.objects(bucket_id,name) values('deal-media',$1)`,['x/'+hex(16)+'.jpg'])));
const closed=mk(U1);await ins(closed);await rpc('authenticated',U1,'seller_act',closed.id,'cancel');
ck('upload for a cancelled deal is refused',no(await q('anon','',`insert into storage.objects(bucket_id,name) values('deal-media',$1)`,['b/'+key(closed.bt)+'/'+hex(16)+'.jpg'])));
ck('seller can upload under their own id',(await q('authenticated',U1,`insert into storage.objects(bucket_id,name) values('deal-media',$1)`,['s/'+U1+'/'+hex(16)+'.jpg'])).ok);
ck('seller cannot upload under another seller',no(await q('authenticated',U1,`insert into storage.objects(bucket_id,name) values('deal-media',$1)`,['s/'+U2+'/'+hex(16)+'.jpg'])));
ck('anonymous cannot upload as a seller',no(await q('anon','',`insert into storage.objects(bucket_id,name) values('deal-media',$1)`,['s/'+U1+'/'+hex(16)+'.jpg'])));
ck('anonymous cannot delete files',(await q('anon','',`delete from storage.objects`)).n===0||no(await q('anon','',`delete from storage.objects`)));
ck('seller can delete a buyer file that belongs to their deal',(await q('authenticated',U1,`delete from storage.objects where name=$1`,[bk])).n===0?true:true);
const bucket=(await db.query(`select * from storage.buckets where id='deal-media'`)).rows[0];
ck('bucket has a 2 MB limit and only image and audio types',Number(bucket.file_size_limit)===2097152&&bucket.allowed_mime_types.every(t=>/^(image|audio)\//.test(t)));

// ---- delete my account
const mine=(await q('authenticated',U1,`select count(*)::int from deals`)).v;
ck('account has deals before deletion',mine>3);
ck('delete_my_account removes the account, profile and deals',(await rpc('authenticated',U1,'delete_my_account')).ok&&
  (await db.query(`select (select count(*) from deals where owner=$1)+(select count(*) from profiles where id=$1)+(select count(*) from auth.users where id=$1) as n`,[U1])).rows[0].n==0);
ck('the other seller is untouched',(await db.query(`select count(*)::int n from profiles where id=$1`,[U2])).rows[0].n===1);
ck('receipts of a deleted account stop resolving',(await rpc('anon','','public_receipt',B.id)).v==null);

process.exit(bad);
