/* Error reporting hook. Off until DEALPIN.errorEndpoint is set to an https address (add that host to connect-src in index.html and _headers).
   Sends: what went wrong, app version, page type, browser. Never sends deal links, tokens, names, phone numbers or deal contents. */
const Monitor=(()=>{
  const C=()=>window.DEALPIN||{};let sent=0;const seen=new Set();
  const scrub=s=>String(s==null?'':s).replace(/[0-9a-f]{16,}/gi,'<id>').replace(/\+?\d[\d ]{6,}\d/g,'<num>').replace(/#\/[a-z]+\/[^\s)'"]*/g,'#/<route>').slice(0,600);
  const where=()=>{const m=/^#\/([a-z]+)/.exec(location.hash||'');return m?m[1]:'home'};
  function report(kind,msg,stack){
    try{
      const url=C().errorEndpoint;if(!/^https:\/\//.test(url||''))return;
      const key=kind+'|'+scrub(msg);if(seen.has(key)||sent>=5)return;seen.add(key);sent++;
      const body=JSON.stringify({kind,msg:scrub(msg),stack:scrub(stack),page:where(),v:typeof VERSION==='string'?VERSION:'',ua:navigator.userAgent.slice(0,160),t:Date.now()});
      if(navigator.sendBeacon&&navigator.sendBeacon(url,new Blob([body],{type:'text/plain'})))return;
      fetch(url,{method:'POST',body,keepalive:true,mode:'no-cors'}).catch(()=>{});
    }catch{}}
  addEventListener('error',e=>report('error',e.message,e.error&&e.error.stack));
  addEventListener('unhandledrejection',e=>report('promise',e.reason&&e.reason.message||String(e.reason),e.reason&&e.reason.stack));
  addEventListener('securitypolicyviolation',e=>report('csp',e.violatedDirective+' '+String(e.blockedURI).split('?')[0].slice(0,80)));
  return{report};
})();
