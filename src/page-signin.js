/* Website sign-in: Google or email code. Writes the same session the app reads (same origin), then opens the app. */
Pages.signin={title:'Sign in · Dealpin',desc:'Sign in to Dealpin with Google or an email code.',
html:()=>`<section class="auth-page"><div class="authcard"><h1 class="auth-h">Sign in to Dealpin</h1><p class="lead2" id="a-sub">Use Google or get a code by email. New here? Signing in creates your account.</p>
<div id="a-main"><button class="gbtn" id="a-g" type="button"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.2 7-10.3 7-17.6z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>Continue with Google</button>
<p class="or"><span>or</span></p>
<form id="a-e" class="demo" novalidate><div class="f"><label for="a-mail">Email address</label><input id="a-mail" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="you@example.com"></div><button class="btn pin" type="submit">Email me a code</button></form>
<form id="a-c" class="demo" novalidate hidden><div class="f"><label for="a-code">Code from your email</label><input id="a-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"></div><button class="btn pin" type="submit">Sign in</button><div class="alt"><button class="lnk" id="a-re" type="button">Send a new code</button><button class="lnk" id="a-ch" type="button">Use a different email</button></div></form>
<p class="msg" id="a-s" role="status" aria-live="polite"></p></div>
<p class="fine2">By continuing you agree to the <a href="app/terms.html">Terms</a> and <a href="app/privacy.html">Privacy policy</a>. Buyers and riders just open the link they are sent. No account needed.</p></div></section>`,
maint(){const C=window.DEALPIN||{};if(C.mode!=='supabase'||!C.url||!C.anonKey)return;
  fetch(C.url+'/rest/v1/app_settings?select=message,maintenance&id=eq.1',{headers:{apikey:C.anonKey,Accept:'application/json'},cache:'no-store'})
  .then(r=>r.ok?r.json():null).then(j=>{const st=Array.isArray(j)?j[0]:null;if(!st||!st.maintenance)return;
    const card=document.querySelector('.authcard');if(!card)return;
    const h=document.createElement('h1');h.className='auth-h';h.textContent='Back soon';
    const p=document.createElement('p');p.className='lead2';p.textContent=st.message||'Dealpin is being updated. Please try again shortly.';
    card.replaceChildren(h,p);}).catch(()=>{});},
init(){this.maint();
 const C=window.DEALPIN||{},K='dealpin.session',s=$('#a-s'),say=(t,e)=>{s.className='msg'+(e?' err':'');s.textContent=t};
 const ok=()=>{try{const u=new URL(C.url);return C.mode==='supabase'&&u.protocol==='https:'&&!!C.anonKey}catch{return false}};
 const goApp=()=>location.replace('app/');
 if(!ok())return goApp();
 try{if(JSON.parse(localStorage.getItem(K)||'null')?.refresh_token)return goApp()}catch{}
 const post=async(p,b)=>{let r;try{r=await fetch(C.url+p,{method:'POST',headers:{apikey:C.anonKey,'Content-Type':'application/json'},body:JSON.stringify(b)})}catch{throw new Error('No connection. Check your internet and try again.')}
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(r.status===429?'Too many tries. Wait a minute and try again.':j.error_code==='otp_expired'?'That code has expired. Ask for a new one.':j.msg||j.message||j.error_description||'Could not sign in. Try again.');return j};
 const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const pair=async()=>{const v=b64(crypto.getRandomValues(new Uint8Array(48))),ch=b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
  try{localStorage.setItem('dealpin.pkce',JSON.stringify({v,t:Date.now()}))}catch{throw new Error('This browser blocks sign-in storage. Turn off private mode and try again.')}return ch};
 const back=location.origin+'/app/';let mail='',cool=0;
 const lock=(b,on)=>{b.disabled=on};
 $('#a-g').onclick=async e=>{lock(e.currentTarget,1);try{const ch=await pair();location.assign(C.url+'/auth/v1/authorize?'+new URLSearchParams({provider:'google',redirect_to:back,code_challenge:ch,code_challenge_method:'s256'}))}catch(x){say(x.message,1);lock(e.currentTarget,0)}};
 const send=async()=>{const ch=await pair();await post('/auth/v1/otp?redirect_to='+encodeURIComponent(back),{email:mail,create_user:true,code_challenge:ch,code_challenge_method:'s256'});
  $('#a-e').hidden=true;$('#a-c').hidden=false;$('#a-sub').textContent='We sent a code to '+mail+'. Enter it below.';say('Code sent. Check your inbox and spam.');$('#a-code').focus();cool=Date.now()+30000};
 $('#a-e').onsubmit=async e=>{e.preventDefault();mail=$('#a-mail').value.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail))return say('Enter a valid email address.',1);
  const b=$('#a-e button');lock(b,1);say('Sending…');try{await send()}catch(x){say(x.message,1)}lock(b,0)};
 $('#a-c').onsubmit=async e=>{e.preventDefault();const t=$('#a-code').value.trim();if(!/^\d{4,8}$/.test(t))return say('Enter the code from the email.',1);
  const b=$('#a-c button');lock(b,1);say('Checking…');try{const j=await post('/auth/v1/verify',{type:'email',email:mail,token:t});
   if(!j.access_token)throw new Error('Sign-in did not complete. Try again.');
   localStorage.setItem(K,JSON.stringify({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+(j.expires_in||3600)*1000,user:{id:j.user&&j.user.id,name:(j.user&&j.user.user_metadata&&(j.user.user_metadata.full_name||j.user.user_metadata.name))||'',email:(j.user&&j.user.email)||mail}}));say('Signed in. Opening Dealpin…');goApp()}
  catch(x){say(x.message,1);lock(b,0)}};
 $('#a-re').onclick=async()=>{if(Date.now()<cool)return say('Wait a few seconds before asking again.',1);say('Sending…');try{await send()}catch(x){say(x.message,1)}};
 $('#a-ch').onclick=()=>{$('#a-c').hidden=true;$('#a-e').hidden=false;$('#a-sub').textContent='Use Google or get a code by email. New here? Signing in creates your account.';say('');$('#a-mail').focus()};
}};
