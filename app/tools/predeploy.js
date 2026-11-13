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
// Production guardrails: reject obvious secret material and unsafe local/test configuration anywhere in the app source.
const roots=['.','../'];const forbiddenFiles=[];const secretHits=[];
for(const root of roots){
  for(const name of fs.readdirSync(root,{withFileTypes:true})){
    if(name.name==='node_modules' || name.name==='.git' || name.name==='tools' && root==='.') continue;
    const full=require('path').join(root,name.name);
    if(name.isFile() && /^(\.env|\.env\..*|.*\.pem|.*\.key)$/.test(name.name)) forbiddenFiles.push(full);
  }
}
say(forbiddenFiles.length===0,'no .env/private-key files are packaged for deployment');
const scanFiles=[];function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git'].includes(ent.name))continue;const full=require('path').join(dir,ent.name);if(ent.isDirectory())walk(full);else if(/\.(js|mjs|ts|html|json|css|sql|md|txt)$/.test(ent.name))scanFiles.push(full)}}
walk('.');
for(const f of scanFiles){const t=fs.readFileSync(f,'utf8');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(t)||/sk-[A-Za-z0-9]{20,}/.test(t)||/AIza[0-9A-Za-z_-]{20,}/.test(t))secretHits.push(f)}
say(secretHits.length===0,'no obvious private-key or high-risk secret patterns found in packaged text files');
const headers=fs.readFileSync('../_headers','utf8'),vercel=fs.readFileSync('../vercel.json','utf8');
for(const h of ['Strict-Transport-Security','X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Content-Security-Policy']) say(headers.includes(h),`_headers contains ${h}`);
for(const h of ['Strict-Transport-Security','X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Content-Security-Policy']) say(vercel.includes(h),`vercel.json contains ${h}`);
process.exit(bad);
