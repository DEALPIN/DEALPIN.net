/* Dealpin Phase One shell behavior: navigation state, contextual creation sheet, profile/header shell. */
(()=>{
  const $=s=>document.querySelector(s);
  const nav=$('#main-navigation'),scrim=$('#create-scrim');
  const routeState=()=>{
    const path=(location.hash.slice(1)||'/').split('?')[0];
    const map={'/':'home','/deals':'deals','/explore':'explore','/products':'products','/profile':'profile','/profile/edit':'profile','/settings':'profile','/autopilot':'profile',};
    const active=map[path]||'';
    if(nav)nav.querySelectorAll('a[data-r]').forEach(a=>{
      const yes=a.dataset.r===active;
      if(yes)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
    document.body.classList.toggle('shell-hidden',document.body.classList.contains('bare'));
  };
  const trigger=$('#create-menu'),sheet=scrim?.querySelector('[role=dialog]');
  const focusable=()=>sheet?[...sheet.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>!x.hidden):[];
  const isolate=on=>['#app-header','#main-navigation','#app','#toast'].forEach(sel=>{const el=$(sel);if(!el)return;if(on){el.setAttribute('aria-hidden','true');if('inert' in el)el.inert=true}else{el.removeAttribute('aria-hidden');if('inert' in el)el.inert=false}});
  const open=()=>{if(!scrim)return;scrim.hidden=false;document.body.classList.add('no-scroll');isolate(true);trigger?.setAttribute('aria-expanded','true');$('#close-create')?.focus()};
  const close=()=>{if(!scrim||scrim.hidden)return;scrim.hidden=true;document.body.classList.remove('no-scroll');isolate(false);trigger?.setAttribute('aria-expanded','false');trigger?.focus()};
  trigger?.setAttribute('aria-haspopup','dialog');trigger?.setAttribute('aria-expanded','false');
  $('#create-menu')?.addEventListener('click',open);
  $('#close-create')?.addEventListener('click',close);
  scrim?.addEventListener('click',e=>{if(e.target===scrim)close()});
  scrim?.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  addEventListener('keydown',e=>{if(!scrim||scrim.hidden)return;if(e.key==='Escape'){e.preventDefault();close();return}if(e.key==='Tab'){const f=focusable();if(!f.length){e.preventDefault();return}const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
  addEventListener('hashchange',routeState);
  const original=window.applyTheme;
  if(typeof original==='function'){
    window.applyTheme= function(value){
      const result=original(value);
      const dark=result==='dark'||(result==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
      const meta=document.querySelector('meta[name="theme-color"]');
      if(meta)meta.content=dark?'#050B08':'#F2F5F3';
      return result;
    };
    window.applyTheme();
  }
  routeState();
})();

/* Pull to refresh on any screen at the top, and an offline banner. Uses only the CSSOM (no inline style attributes), so the strict CSP stays intact. */
(()=>{
  const ptr=document.createElement('div');ptr.id='ptr';ptr.setAttribute('aria-hidden','true');ptr.innerHTML='<span></span>';document.body.appendChild(ptr);
  const root=document.documentElement;let y0=null,dy=0,armed=false;
  const set=v=>root.style.setProperty('--ptr',String(v));
  addEventListener('touchstart',e=>{
    if(document.body.classList.contains('bare')||scrollY>0||e.touches.length!==1||document.body.classList.contains('ptr-busy')){y0=null;return}
    y0=e.touches[0].clientY;dy=0;armed=false;
  },{passive:true});
  addEventListener('touchmove',e=>{
    if(y0==null)return;
    dy=Math.max(0,e.touches[0].clientY-y0);
    armed=dy>72;
    set(Math.min(dy*.5,84));
    document.body.classList.toggle('ptr-ready',armed);
  },{passive:true});
  const end=()=>{
    if(y0==null)return;
    y0=null;document.body.classList.remove('ptr-ready');
    if(armed){
      document.body.classList.add('ptr-busy');set(56);
      Promise.resolve().then(()=>render()).catch(()=>{}).finally(()=>{setTimeout(()=>{document.body.classList.remove('ptr-busy');set(0)},450)});
    }else set(0);
  };
  addEventListener('touchend',end,{passive:true});
  addEventListener('touchcancel',end,{passive:true});

  addEventListener('offline',()=>document.body.classList.add('offline'));
  addEventListener('online',()=>document.body.classList.remove('offline'));
  if(navigator.onLine===false)document.body.classList.add('offline');
})();
