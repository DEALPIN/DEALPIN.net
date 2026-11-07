// The install check (supabase/verify.sql) on a real Postgres engine: passes on a full install, names what is wrong when something is missing or too open.
// Run: npm i --no-save @electric-sql/pglite && node tests/verify.test.mjs
import {PGlite} from '@electric-sql/pglite';import fs from 'fs';
const dir=new URL('../supabase/',import.meta.url);let bad=0;const ck=(n,c)=>{console.log(c?'ok  ':'FAIL',n);if(!c){bad=1;process.exitCode=1}};
const build=async files=>{const db=new PGlite();await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant usage on schema public to anon,authenticated;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated; grant select,insert,delete on storage.objects to anon,authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;`);
  for(const f of files)await db.exec(fs.readFileSync(new URL(f,dir),'utf8'));return db};
const run=async db=>{const r=(await db.query(fs.readFileSync(new URL('verify.sql',dir),'utf8'))).rows;return{all:r.find(x=>x.name==='ALL CHECKS PASSED').ok,bad:r.filter(x=>!x.ok&&x.name!=='ALL CHECKS PASSED').map(x=>x.name)}};
const ALL=['schema.sql','storage.sql','phase-two-products.sql','phase-three-requests.sql','phase-four-requests-online.sql','phase-five-tools-sync.sql'];
let r=await run(await build(ALL));ck('a full install passes every check',r.all&&r.bad.length===0);
r=await run(await build(ALL.slice(0,5)));ck('a missing phase is named, not hidden',!r.all&&r.bad.some(n=>/Tools/.test(n)));
let db=await build(ALL);await db.exec('grant select on deals to anon');r=await run(db);ck('an open table is caught',!r.all&&r.bad.some(n=>/anon cannot read/.test(n)));
db=await build(ALL);await db.exec('grant execute on function mod_apply(jsonb) to anon');r=await run(db);ck('a function open to the public is caught',!r.all&&r.bad.some(n=>/signed-in users only/.test(n)));
db=await build(ALL);await db.exec('alter table mod_records disable row level security');r=await run(db);ck('switched-off row level security is caught',!r.all&&r.bad.some(n=>/mod_records has row level/.test(n)));
process.exit(bad);
