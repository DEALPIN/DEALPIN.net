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
addEventListener('hashchange',route);route();
/* theme and menu */
const K='dealpin.site.theme',modes=['system','light','dark'],gt=()=>{try{const v=localStorage.getItem(K);return modes.includes(v)?v:'system'}catch{return'system'}};
const ap=m=>{m==='system'?root.removeAttribute('data-theme'):root.setAttribute('data-theme',m);$('#theme').setAttribute('aria-label','Colour theme: '+m+'. Tap to change.')};
ap(gt());$('#theme').onclick=()=>{const n=modes[(modes.indexOf(gt())+1)%3];try{localStorage.setItem(K,n)}catch{}ap(n)};
burger.onclick=()=>{const o=menu.classList.toggle('open');burger.setAttribute('aria-expanded',o)};
addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('open')){menu.classList.remove('open');burger.setAttribute('aria-expanded','false');burger.focus()}});
