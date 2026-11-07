/* Session + one-time code sign-in (SMS or email) (Supabase Auth REST). Unused in local mode.
   The access token lasts about an hour; Auth.token() renews it with the refresh token before it runs out. */
const Session=(()=>{const K='dealpin.session';
  const raw=()=>{try{return JSON.parse(localStorage.getItem(K))}catch{return null}};
  return{raw,
    get(){const s=raw();return s&&s.expires_at>Date.now()?s:null},
    set(s){try{localStorage.setItem(K,JSON.stringify(s))}catch{}},
    clear(){try{localStorage.removeItem(K)}catch{}}}})();
const Auth=(()=>{const C=()=>window.DEALPIN||{};let busy=null;
  const post=async(p,b,tok)=>{
    const base=C().url;let parsed;try{parsed=new URL(base)}catch{}
    if(!parsed||parsed.protocol!=='https:'||parsed.username||parsed.password||!C().anonKey)throw new Error('Online sign-in is not securely configured.');
    let r;try{r=await fetch(base+p,{method:'POST',headers:{apikey:C().anonKey,'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify(b)})}
    catch{const e=new Error('No connection. Check your internet and try again.');e.status=0;throw e}
    const j=await r.json().catch(()=>({}));
    if(!r.ok){const MAP={email_address_not_authorized:'This email address is not allowed with the current email sender. Connect your own email sender in Supabase, or use an address that belongs to your Supabase team.',over_email_send_rate_limit:'Too many emails were sent. Wait a while and try again.',over_sms_send_rate_limit:'Too many texts were sent. Wait a while and try again.',email_provider_disabled:'Email sign-in is switched off in Supabase.',phone_provider_disabled:'Phone sign-in is switched off in Supabase.',signup_disabled:'New sign-ups are switched off in Supabase.',otp_expired:'That code has expired. Ask for a new one.',otp_disabled:'Code sign-in is switched off in Supabase.',flow_state_not_found:'That sign-in expired. Tap Continue with Google again.',flow_state_expired:'That sign-in expired. Tap Continue with Google again.',bad_code_verifier:'That sign-in expired. Tap Continue with Google again.'};
    const code=j.error_code||j.code,e=new Error(r.status===429&&!MAP[code]?'Too many tries. Wait a minute and try again.':MAP[code]||j.msg||j.message||j.error_description||('Could not sign in (error '+r.status+(code?', '+code:'')+'). Try again.'));e.status=r.status;throw e}
    return j};
  const save=j=>{if(!j||typeof j.access_token!=='string'||!j.access_token)throw new Error('Sign-in did not complete. Try again.');const old=Session.raw()||{};Session.set({access_token:j.access_token,refresh_token:j.refresh_token||old.refresh_token,
    expires_at:Date.now()+(j.expires_in||3600)*1000,user:{id:(j.user&&j.user.id)||(old.user&&old.user.id),name:((j.user&&j.user.user_metadata&&(j.user.user_metadata.full_name||j.user.user_metadata.name))||(old.user&&old.user.name)||''),email:(j.user&&j.user.email)||(old.user&&old.user.email)||'',picture:((j.user&&j.user.user_metadata&&(j.user.user_metadata.avatar_url||j.user.user_metadata.picture))||(old.user&&old.user.picture)||'')}})};
  const refresh=()=>busy||(busy=(async()=>{
    const s=Session.raw();if(!s||!s.refresh_token)return null;
    try{save(await post('/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refresh_token}));return Session.get()}
    catch(e){if(e.status>=400&&e.status<500&&e.status!==429)Session.clear();return null}   // rejected: sign in again. Offline: keep the session.
  })().finally(()=>{busy=null}));
  return{
    signedIn:()=>!!Session.raw(),
    user(){const s=Session.raw();return s&&s.user||{}},
    /* The signed-in person's name and email. Older sessions are filled in once from the account. */
    async profile(){const s=Session.raw();if(!s)return{};if(s.user&&(s.user.name||s.user.email)&&'picture' in s.user)return s.user;const t=await this.token();if(!t)return s.user||{};
      try{const r=await fetch(C().url+'/auth/v1/user',{headers:{apikey:C().anonKey,Authorization:'Bearer '+t}});if(r.ok){const j=await r.json(),m=j.user_metadata||{},cur=Session.raw()||s;cur.user={...cur.user,name:m.full_name||m.name||'',email:j.email||'',picture:m.avatar_url||m.picture||''};Session.set(cur);return cur.user}}catch{}return s.user||{}},
    /* A valid access token, renewed if it ends within a minute. null when signed out or offline. */
    async token(){const s=Session.raw();if(!s)return null;if(s.expires_at-Date.now()>60000)return s.access_token;const n=await refresh();return n?n.access_token:null},
    /* who is {phone:'+<country code><number>'} or {email:'a@b.com'} */
    /* Email: the message carries a code AND a link. The link comes back to this site with a one-time ?code= (same PKCE exchange as Google). */
    async sendCode(who){
      if(who.email){const ch=await this.pair();await post('/auth/v1/otp?redirect_to='+encodeURIComponent(location.origin+'/app/'),{...who,create_user:true,code_challenge:ch,code_challenge_method:'s256'})}
      else await post('/auth/v1/otp',{...who,create_user:true})},
    async verify(who,token){save(await post('/auth/v1/verify',{type:who.email?'email':'sms',...who,token}))},
    /* Google: authorisation-code flow with PKCE. The secret half (verifier) never leaves this tab; the address only carries a one-time code. */
    async pair(){
      const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const v=b64(crypto.getRandomValues(new Uint8Array(48))),ch=b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
      try{localStorage.setItem('dealpin.pkce',JSON.stringify({v,t:Date.now()}))}catch{throw new Error('This browser blocks sign-in storage. Turn off private mode and try again.')}
      return ch},
    async google(){
      const ch=await this.pair();
      const base=C().url;let u;try{u=new URL(base)}catch{}
      if(!u||u.protocol!=='https:'||!C().anonKey)throw new Error('Online sign-in is not securely configured.');
      const q=new URLSearchParams({provider:'google',redirect_to:location.origin+'/app/',code_challenge:ch,code_challenge_method:'s256'});
      location.assign(base+'/auth/v1/authorize?'+q)},
    /* Call once at start-up: if the address carries a Google sign-in result, finish it. Returns a message to show, or ''. */
    async finishOAuth(){  // also finishes an email link
      const sp=new URLSearchParams(location.search),hp=new URLSearchParams(location.hash.replace(/^#\/?\??/,''));
      const code=sp.get('code'),err=sp.get('error')||sp.get('error_description')||hp.get('error')||hp.get('error_description');
      if(!code&&!err)return '';
      let v='';try{const o=JSON.parse(localStorage.getItem('dealpin.pkce')||'null');if(o&&typeof o.v==='string'&&Date.now()-o.t<600000)v=o.v;localStorage.removeItem('dealpin.pkce')}catch{}
      history.replaceState(null,'',location.pathname+'#/');
      if(!v)return err?'':'That link was not opened in the same app or browser where you asked for it. Type the code from the email instead, or ask for a new one.';
      if(err)return 'Google sign-in did not finish. Try again.';
      try{save(await post('/auth/v1/token?grant_type=pkce',{auth_code:code,code_verifier:v}));return ''}
      catch(e){return e.message}},
    async signOut(){const s=Session.raw();Session.clear();if(s&&s.access_token)try{await post('/auth/v1/logout?scope=local',{},s.access_token)}catch{}}}})();
