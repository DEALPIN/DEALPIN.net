import fs from 'node:fs';
const p=new URL('../js/auth.js',import.meta.url); const src=fs.readFileSync(p,'utf8');
const checks=[
 ['idle timeout is defined',/IDLE=12\*60\*60\*1000/.test(src)],
 ['absolute session lifetime is defined',/MAX=30\*24\*60\*60\*1000/.test(src)],
 ['expired sessions are cleared',/now-last>IDLE/.test(src)&&/localStorage\.removeItem\(K\)/.test(src)],
 ['session activity is refreshed',/last_activity/.test(src)&&/Session\.touch\(\)/.test(src)],
 ['sign out clears OAuth verifier',/localStorage\.removeItem\('dealpin\.pkce'\)/.test(src)],
 ['sign out clears pending redirect',/sessionStorage\.removeItem\('dealpin\.next'\)/.test(src)],
 ['server logout remains enabled',/auth\/v1\/logout\?scope=local/.test(src)]
];
let bad=0; for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name); if(!ok)bad++} if(bad)process.exit(1);
