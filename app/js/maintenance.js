/* App gate. Every 10 seconds: is the app down for maintenance, and is this account suspended?
   Maintenance or suspension signs the person out here. The database refuses saves at the same time (setup steps 12 and 13). */
(()=>{
  const C=window.DEALPIN||{};
  if(C.mode!=='supabase'||!C.url||!C.anonKey)return;
  const url=C.url+'/rest/v1/rpc/app_status';
  const show=(title,msg)=>{
    let d=document.getElementById('maint');
    if(!d){
      d=document.createElement('div');d.id='maint';d.className='maint';d.setAttribute('role','alertdialog');d.setAttribute('aria-live','assertive');
      d.innerHTML='<div class="maint-card"><h1></h1><p></p><button class="btn" type="button" id="maint-retry">Check again</button></div>';
      document.body.appendChild(d);d.querySelector('#maint-retry').onclick=check;
    }
    d.querySelector('h1').textContent=title;d.querySelector('p').textContent=msg;
  };
  const hide=()=>{const d=document.getElementById('maint');if(d)d.remove()};
  async function check(){
    try{
      const hasAuth=typeof Auth!=='undefined';
      const tok=hasAuth?await Auth.token().catch(()=>null):null;
      const r=await fetch(url,{method:'POST',headers:{apikey:C.anonKey,'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:'{}',cache:'no-store'});
      if(!r.ok)return false;
      const s=(await r.json())||{};
      if(s.suspended){if(hasAuth)await Auth.signOut();show('Account suspended','Your account has been suspended. Contact Dealpin to find out more.');return true}
      if(s.maintenance){if(hasAuth)await Auth.signOut();show('Back soon',s.message||'Dealpin is being updated. Please try again shortly.');return true}
      hide();return false;
    }catch{return false}
  }
  window.DealpinMaintenance=check();
  setInterval(check,10000);
})();
