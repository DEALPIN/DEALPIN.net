/* Error reporting hook. Off until DEALPIN.errorEndpoint is set to an https address. For this project it is the crash_reports table (supabase/setup/7-crash-reports.sql), already allowed by connect-src.
   Sends: what went wrong, app version, page type, browser. Never sends deal links, tokens, names, phone numbers or deal contents. */
const Monitor=(()=>{
  const C=()=>window.DEALPIN||{};let sent=0;const seen=new Set();
  const scrub=s=>String(s==null?'':s).replace(/[0-9a-f]{16,}/gi,'<id>').replace(/\+?\d[\d ]{6,}\d/g,'<num>').replace(/#\/[a-z]+\/[^\s)'"]*/g,'#/<route>').slice(0,600);
  const where=()=>{const m=/^#\/([a-z]+)/.exec(location.hash||'');return m?m[1]:'home'};
  const id=key=>{try{let v=sessionStorage.getItem(key);if(!v){v=crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Math.random().toString(36).slice(2)+Date.now().toString(36);sessionStorage.setItem(key,v)}return v.slice(0,64)}catch{return ''}};
  const clientId=id('dealpin.monitor.client'),requestId=()=>id('dealpin.monitor.request');
  function report(kind,msg,stack,extra={}){
    try{
      const url=C().errorEndpoint;if(!/^https:\/\//.test(url||''))return;
      const clean=kind+'|'+scrub(msg);if(seen.has(clean)||sent>=12)return;seen.add(clean);sent++;
      const body=JSON.stringify({kind,msg:scrub(msg),stack:scrub(stack),page:where(),v:typeof VERSION==='string'?VERSION:'',ua:navigator.userAgent.slice(0,160),client_id:clientId,request_id:requestId(),duration_ms:Number.isFinite(extra.duration_ms)?Math.round(extra.duration_ms):undefined});
      if(C().url&&url.indexOf(C().url+'/rest/v1/')===0){fetch(url,{method:'POST',body,keepalive:true,headers:{apikey:C().anonKey,'Content-Type':'application/json',Prefer:'return=minimal'}}).catch(()=>{});return}
      if(navigator.sendBeacon&&navigator.sendBeacon(url,new Blob([body],{type:'text/plain'})))return;
      fetch(url,{method:'POST',body,keepalive:true,mode:'no-cors'}).catch(()=>{});
    }catch{}}
  addEventListener('error',e=>report('error',e.message,e.error&&e.error.stack));
  addEventListener('unhandledrejection',e=>report('promise',e.reason&&e.reason.message||String(e.reason),e.reason&&e.reason.stack));
  addEventListener('securitypolicyviolation',e=>report('csp',e.violatedDirective+' '+String(e.blockedURI).split('?')[0].slice(0,80)));
  addEventListener('offline',()=>report('network','browser went offline'));
  addEventListener('online',()=>report('network','browser returned online'));
  addEventListener('load',()=>{try{const n=performance.getEntriesByType('navigation')[0];if(n&&n.loadEventEnd>2500)report('slow-navigation','Page load exceeded 2.5 seconds',null,{duration_ms:n.loadEventEnd})}catch{}});
  if('PerformanceObserver' in window){try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{if(e.duration>2000)report('long-task','Long main-thread task',null,{duration_ms:e.duration})})).observe({type:'longtask',buffered:true})}catch{}}
  return{report,requestId};
})();
