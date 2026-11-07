// Checks js/config.js before you publish. Run from the dealpin folder: node tools/predeploy.js
const fs=require('fs'),vm=require('vm');const sb={window:{}};vm.runInNewContext(fs.readFileSync('js/config.js','utf8'),sb);const c=sb.window.DEALPIN;
let bad=0;const say=(ok,m)=>{console.log(ok?'ok  ':'FAIL',m);if(!ok)bad=1};
say(['local','supabase'].includes(c.mode),'mode is local or supabase');
if(c.mode==='supabase'){
  say(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url),'url is an https Supabase project address with no path');
  say(/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)$/.test(c.anonKey),'anonKey is a publishable key or an anon JWT');
  say(!/sb_secret_/.test(c.anonKey),'anonKey is not a secret key');
  try{const p=JSON.parse(Buffer.from(c.anonKey.split('.')[1],'base64url'));say(p.role!=='service_role','anon JWT is not the service_role key')}catch(e){}
  say(!c.testingBypassAuth,'sign-in bypass (testingBypassAuth) is OFF: required before real users');
}else console.log('warn Device-only mode: nothing is shared between phones. Set mode to supabase for real sales.');
if(c.testingBypassAuth)console.log('warn Sign-in is BYPASSED (testingBypassAuth:true). Set it to false in js/config.js before going live.');
for(const f of ['index.html','../_headers','../vercel.json']){const t=fs.readFileSync(f,'utf8');const h=c.url?new URL(c.url).host:'';say(!h||/\*\.supabase\.co/.test(t)||t.includes(h),f+' allows the backend host in connect-src')}
if(c.errorEndpoint){const h=new URL(c.errorEndpoint).host;for(const f of ['index.html','../_headers','../vercel.json'])say(fs.readFileSync(f,'utf8').includes(h),f+' allows the error endpoint host')}
const all=fs.readdirSync('js').map(f=>fs.readFileSync('js/'+f,'utf8')).join('\n');say(!/sb_secret_|service_role/.test(all),'no secret or service_role key in the app code');
process.exit(bad);
