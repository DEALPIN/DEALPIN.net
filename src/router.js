/* Hash router: each page is a js file in Pages. A route change swaps the page and jumps to the top at once (no scrolling). */
const view=$('#view'),menu=$('#menu'),burger=$('#burger'),root=document.documentElement;
Pages.nf={title:'Page not found · Dealpin',desc:'',html:()=>head('That page does not exist','Try the menu, or go back to the start.')+cta('Go back to the start')};
function route(){
  const h=location.hash;if(h&&!h.startsWith('#/'))return;
  const k=h.slice(2).split('?')[0].replace(/\/$/,'')||'home',p=Pages[k]||Pages.nf;
  document.body.classList.toggle('signin-mode',k==='signin');
  if(view.dataset.pre&&k==='home'&&view.firstElementChild){delete view.dataset.pre}else{delete view.dataset.pre;view.innerHTML=p.html();view.classList.remove('in');void view.offsetWidth;view.classList.add('in')}
  root.scrollTop=0;document.body.scrollTop=0;window.scrollTo(0,0);
  document.title=p.title;$('#desc').content=p.desc||'';
  $$('.menu a[data-k]').forEach(a=>{const on=a.dataset.k===k;on?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current')});
  menu.classList.remove('open');burger.setAttribute('aria-expanded','false');
  if(p.init)p.init();$('#main').focus({preventScroll:true});
}
/* If Google or an email link returns to the website root with ?code=, finish the sign-in here with the verifier this browser kept, then open the app. */
(async()=>{
  const code=new URLSearchParams(location.search).get('code');if(!code)return;
  let v='';try{const o=JSON.parse(localStorage.getItem('dealpin.pkce')||'null');if(o&&typeof o.v==='string'&&Date.now()-o.t<600000)v=o.v;localStorage.removeItem('dealpin.pkce')}catch{}
  if(!v)return;   // no matching sign-in in this browser: never exchange a code we did not ask for
  const C=window.DEALPIN||{};
  try{
    const r=await fetch(C.url+'/auth/v1/token?grant_type=pkce',{method:'POST',headers:{apikey:C.anonKey,'Content-Type':'application/json'},body:JSON.stringify({auth_code:code,code_verifier:v})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.access_token)throw new Error('sign-in');
    const m=(j.user&&j.user.user_metadata)||{};
    localStorage.setItem('dealpin.session',JSON.stringify({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+(j.expires_in||3600)*1000,user:{id:j.user&&j.user.id,name:m.full_name||m.name||'',email:(j.user&&j.user.email)||'',picture:m.avatar_url||m.picture||''}}));
    location.replace('app/');
  }catch{history.replaceState(null,'',location.pathname+'#/signin')}
})();
addEventListener('hashchange',route);route();
/* theme and menu */
const K='dealpin.site.theme',modes=['system','light','dark'],gt=()=>{try{const v=localStorage.getItem(K);return modes.includes(v)?v:'system'}catch{return'system'}};
const ap=m=>{m==='system'?root.removeAttribute('data-theme'):root.setAttribute('data-theme',m);$('#theme').setAttribute('aria-label','Colour theme: '+m+'. Tap to change.')};
ap(gt());$('#theme').onclick=()=>{const n=modes[(modes.indexOf(gt())+1)%3];try{localStorage.setItem(K,n)}catch{}ap(n)};
burger.onclick=()=>{const o=menu.classList.toggle('open');burger.setAttribute('aria-expanded',o)};
addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('open')){menu.classList.remove('open');burger.setAttribute('aria-expanded','false');burger.focus()}});
