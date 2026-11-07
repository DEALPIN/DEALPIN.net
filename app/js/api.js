/* Picks the data layer and adds live updates. All screens use Store and watch only. */
const DEALPIN=window.DEALPIN||{mode:'local'};
const Store=DEALPIN.mode==='supabase'?SupabaseStore:LocalStore;
let stopW=()=>{};
let softRender=false;   // true while watch() redraws: the screen keeps its scroll position and is only replaced when something changed
/* Calls fn again when the data may have changed (another tab, or every 8 seconds online).
   Skipped while a field is focused, while a form marked data-lock holds the person's input, or while the page is hidden. */
function watch(fn){stopW();
  let busy=false;
  const go=async()=>{
    if(busy||document.hidden)return;
    if(/INPUT|TEXTAREA|SELECT/.test((document.activeElement||{}).tagName))return;
    if(document.querySelector('#app [data-lock], dialog[open]'))return;
    busy=true;softRender=true;try{await fn()}catch{}finally{softRender=false;busy=false}};
  const ls=e=>{if(e.key==='dealpin.v1'||e.key==='dealpin.mods.v1')go()};addEventListener('storage',ls);
  const t=DEALPIN.mode==='supabase'?setInterval(go,8000):0;
  const vis=()=>{if(!document.hidden&&DEALPIN.mode==='supabase')go()};document.addEventListener('visibilitychange',vis);
  stopW=()=>{removeEventListener('storage',ls);document.removeEventListener('visibilitychange',vis);clearInterval(t)}}
