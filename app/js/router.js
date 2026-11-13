/* Sign-in screen, routes, render loop, start-up. */

async function SignIn(){
  let mode='phone',who=null,timer=0;const next=new URLSearchParams(location.hash.split('?')[1]||'').get('next')||(()=>{try{return sessionStorage.getItem('dealpin.next')||'/'}catch{return '/'}})();
  view(`<div class="narrow"><h1>Sign in</h1><p class="sub" id="sub"></p>
  <form id="sf" class="card" novalidate>
    <div class="field" id="fp"><label for="sp">Phone number</label><input id="sp" type="tel" inputmode="tel" autocomplete="tel" maxlength="24"><p class="help">Include the country code, for example ${esc(REGION.dial)}.</p></div>
    <div class="field" id="fe" hidden><label for="se">Email address</label><input id="se" type="email" inputmode="email" autocomplete="email" maxlength="120" autocapitalize="none" spellcheck="false"></div>
    <button class="btn block">Send code</button>
    <div class="actions"><button type="button" class="btn ghost block" id="sw"></button></div>
    <div class="or" role="separator"><span>or</span></div><button type="button" class="btn ghost block" id="gg">Continue with Google</button></form>
  <form id="cf" class="card" hidden novalidate><div class="field"><label for="sc" id="scl">Code</label><input id="sc" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="8"></div><button class="btn block">Sign in</button>
  <div class="actions"><button type="button" class="btn ghost" id="rs" disabled>Send the code again</button><button type="button" class="btn ghost" id="ch">Change it</button></div></form></div>`);
  const paint=()=>{const em=mode==='email';$('#fp').hidden=em;$('#fe').hidden=!em;
    $('#sub').textContent=em?'We email you a code. No password.':'We send a code by SMS. No password.';
    $('#sw').textContent=em?'Use my phone number instead':'Use my email instead';
    $('#scl').textContent=em?'Code from the email':'Code from the SMS'};
  paint();
  const cool=()=>{let n=30;const b=$('#rs');clearInterval(timer);b.disabled=true;b.textContent=`Send the code again (${n})`;
    timer=setInterval(()=>{if(!b.isConnected){clearInterval(timer);return}n--;if(n<=0){clearInterval(timer);b.disabled=false;b.textContent='Send the code again'}else b.textContent=`Send the code again (${n})`},1000)};
  const send=async()=>{await Auth.sendCode(who);$('#sf').hidden=true;$('#cf').hidden=false;note('Code sent');cool();$('#sc').focus()};
  tap('#gg',()=>Auth.google());
  on('#sw',()=>{mode=mode==='email'?'phone':'email';paint();$(mode==='email'?'#se':'#sp').focus()});
  submit('#sf',async()=>{
    if(mode==='email'){const e=$('#se').value.trim().toLowerCase();if(!e)return bad('#se','Enter your email address.');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)||e.length>120)return bad('#se','That email address does not look right.');who={email:e}}
    else{const raw=$('#sp').value.trim();if(!raw)return bad('#sp','Enter your phone number.');
      const n=tel(raw);if(n.length<8||n.length>15)return bad('#sp','That phone number does not look right.');who={phone:'+'+n}}
    await send()});
  submit('#cf',async()=>{const c=$('#sc').value.trim();if(!/^\d{4,8}$/.test(c))return bad('#sc','Enter the code you were sent.');await Auth.verify(who,c);try{sessionStorage.removeItem('dealpin.next')}catch{}go(/^\/[a-z0-9/?=&_-]*$/i.test(next)?next:'/')});
  tap('#rs',send);
  on('#ch',()=>{clearInterval(timer);$('#cf').hidden=true;$('#sf').hidden=false;$(mode==='email'?'#se':'#sp').focus()});
}

/* Shown instead of the app when mode is 'supabase' but url or anonKey are missing: the owner sees what to fix; nobody saves data into a half-set-up app. */
function Setup(){
  view(`<div class="empty"><h1>Dealpin is not connected yet</h1><p>The owner of this site needs to add the Supabase project address and public key in <code>js/config.js</code> and redeploy.</p></div>`)}
const configOk=()=>DEALPIN.mode!=='supabase'||(/^https:\/\/[a-z0-9.-]+$/i.test(DEALPIN.url||'')&&!!DEALPIN.anonKey);

const routes=[
  [/^\/$/,Home,'home'],[/^\/activity$/,Activity,''],[/^\/inbox$/,DealpinDaily.Inbox,'inbox'],[/^\/relationships$/,DealpinDaily.RelationshipList,'relationships'],[/^\/relationship\/(.+)$/,DealpinDaily.Relationship,'relationships'],[/^\/deals$/,Deals,'deals'],[/^\/explore$/,ExploreLanding,'explore',1],[/^\/products$/,ProductsLanding,'products'],[/^\/product\/new$/,ProductEditor,'products'],[/^\/product\/(\w+)\/edit$/,ProductEditor,'products'],[/^\/p\/(\w+)$/,PublicProduct,'',1],[/^\/request\/(\w+)$/,BuyerProductRequest,'',1],[/^\/new$/,NewDeal,'new'],[/^\/deal\/(\w+)$/,SellerDeal,'home'],[/^\/profile\/edit$/,ProfileEditor,'profile'],[/^\/profile$/,Profile,'profile'],
  [/^\/d\/(\w+)$/,BuyerDeal,'',1],[/^\/r\/(\w+)$/,Receipt,'',1],[/^\/u\/([\w-]+)$/,PublicProfile,'',1],[/^\/g\/(\w+)$/,Rider,'',1],[/^\/welcome$/,Welcome,'',1],[/^\/verify$/,Verify,'',1],[/^\/signin$/,SignIn,'',1],[/^\/tools$/,Tools,'tools'],[/^\/m\/(\w+)(?:\/(\w+))?(?:\/(edit))?$/,ModRoute,'tools'],[/^\/settings$/,Settings,'settings'],[/^\/autopilot$/,Autopilot,'autopilot'],[/^\/legal$/,Legal,'settings'],[/^\/edit\/(\w+)$/,NewDeal,'']
];
let renderSeq=0,lastKey='';
const SKEL='<div class="skel" role="status" aria-label="Loading"><div class="sk sk-t"></div><div class="sk sk-s"></div><div class="sk-r3"><div class="sk sk-b"></div><div class="sk sk-b"></div><div class="sk sk-b"></div></div><div class="sk sk-c"></div><div class="sk sk-c"></div><div class="sk sk-c"></div></div>';
/* Renders run one at a time, and only the newest request is drawn. A slow earlier screen can no longer finish
   after a newer one and put itself back on screen. The tab highlight and skeleton still change at once on tap. */
let renderChain=Promise.resolve();
function render(){
  stopW();const seq=++renderSeq;
  const path=(location.hash.slice(1)||'/').split('?')[0];
  const hit=routes.find(r=>r[0].test(path));
  document.body.classList.toggle('bare',!hit||(!!hit[3]&&hit[2]!=='explore'));
  $$('.nav a').forEach(a=>{const active=!!hit&&!!hit[2]&&a.dataset.r===hit[2];a.classList.toggle('on',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  if(configOk()&&hit){if(path!==lastKey||!app.firstElementChild){app.innerHTML=SKEL;lastHtml='';window.scrollTo(0,0)}lastKey=path}
  renderChain=renderChain.then(()=>{if(seq!==renderSeq)return;return renderNow(seq,path,hit)}).catch(()=>{});
  return renderChain;
}
async function renderNow(seq,path,hit){
  if(!configOk())return Setup();
  if(!hit)return missing('That page does not exist.');
  if(DEALPIN.mode==='supabase'&&!DEALPIN.testingBypassAuth&&!hit[3]){await Auth.token();if(!Auth.signedIn()){if(!(window.DealpinMaintenance&&await window.DealpinMaintenance)){const next=path+(location.hash.includes('?')?'?'+location.hash.split('?').slice(1).join('?'):'');try{sessionStorage.setItem('dealpin.next',next)}catch{}return location.replace('../#/signin')}}}   // renews the session; only a rejected or missing session goes to sign-in
  if(hit&&DEALPIN.mode==='supabase')watch(()=>render());   // every screen refreshes itself; a page's own watch() replaces this one
  try{await hit[1](...path.match(hit[0]).slice(1))}
  catch(x){if(seq!==renderSeq)return;view(`<div class="empty"><h1>Something went wrong</h1><p>${esc(x&&x.message&&/connection|Too many|sign in|not set up|Could not load/i.test(x.message)?x.message:'Reload the page and try again.')}</p><button class="btn" id="retry" type="button">Try again</button></div>`);on('#retry',()=>render());Monitor.report('render',x&&x.message,x&&x.stack)}
  paintBell();
  if(seq===renderSeq)app.focus({preventScroll:true});
}
addEventListener('hashchange',render);
if(DEALPIN.mode==='supabase'&&!DEALPIN.testingBypassAuth)Auth.finishOAuth().catch(()=>'Google sign-in did not finish. Try again.').then(m=>{if(m)note(m);render()});else render();
flush();
watchUpdates();
