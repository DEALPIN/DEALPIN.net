/* Trust Score and Verified badge. Free for every seller. The online score is computed by the database from real deals (supabase/setup/16-trust.sql);
   this file only shows it, and computes the same number for the on-device version. Nothing here can raise a score. */
const Trust=(()=>{
  const W={
    en:{new:'New seller',building:'Building trust',growing:'Growing',trusted:'Trusted seller',top:'Top trusted seller',ver:'Verified seller',
      of:'Trust score',deals:'completed deals',nd:'Not enough deals yet for a score',need:'Needs 5 completed deals to show a score.',
      how:'How the score works',h1:'Completed deals',h2:'Buyer ratings',h3:'No disputes',h4:'Ships within 2 days',shop:'Your shop link',copy:'Copy shop link',share:'Share on WhatsApp',
      note:'Built only from real deals. It cannot be bought or edited.'},
    lg:{new:'Omutunzi omuggya',building:'Azimba obwesigwa',growing:'Akula',trusted:'Omutunzi eyeesigika',top:'Omutunzi eyeesigika ennyo',ver:'Omutunzi akakasiddwa',
      of:'Obubonero bw\u2019obwesigwa',deals:'endagaano ezikolebwa',nd:'Tebinnamala kuwa bubonero',need:'Weetaaga endagaano 5 ezikoleddwa.',
      how:'Obubonero bubalibwa butya',h1:'Endagaano ezikoleddwa',h2:'Ebiruubirirwa by\u2019abaguzi',h3:'Tewali nkaayana',h4:'Aweereza mu nnaku 2',shop:'Link y\u2019edduuka lyo',copy:'Koppa link',share:'Gabana ku WhatsApp',
      note:'Bukozesa endagaano entuufu zokka. Tebuguzibwa so tebukyusibwa.'},
    sw:{new:'Muuzaji mpya',building:'Anajenga uaminifu',growing:'Anakua',trusted:'Muuzaji anayeaminika',top:'Muuzaji anayeaminika zaidi',ver:'Muuzaji aliyethibitishwa',
      of:'Alama ya uaminifu',deals:'mikataba iliyokamilika',nd:'Bado hakuna mikataba ya kutosha kwa alama',need:'Inahitaji mikataba 5 iliyokamilika.',
      how:'Alama inavyokokotolewa',h1:'Mikataba iliyokamilika',h2:'Ukadiriaji wa wanunuzi',h3:'Bila migogoro',h4:'Hutuma ndani ya siku 2',shop:'Kiungo cha duka lako',copy:'Nakili kiungo',share:'Shiriki WhatsApp',
      note:'Inatokana na mikataba halisi tu. Haiwezi kununuliwa wala kubadilishwa.'}};
  const t=k=>{const l=(typeof LANG!=='undefined'&&W[LANG])||W.en;return l[k]||W.en[k]};
  /* Same formula as seller_trust() in 16-trust.sql, for deals kept on this device. */
  function compute(ds){
    const ok=ds.filter(d=>['received','resolved'].includes(d.status)),all=ds.filter(d=>['received','disputed','resolved'].includes(d.status));
    if(ok.length<5)return{tier:'new',deals:ok.length,need:5,verified:false};
    const disp=all.filter(d=>['disputed','resolved'].includes(d.status)).length,rs=all.filter(d=>d.rating&&d.rating.stars>=1&&d.rating.stars<=5).map(d=>d.rating.stars);
    const at=(d,s)=>{const e=(d.events||[]).find(x=>x.s===s);return e?Number(e.at):null};
    const sp=all.map(d=>[at(d,'agreed'),at(d,'shipped')]).filter(x=>x[0]!=null&&x[1]!=null),fast=sp.filter(x=>x[1]-x[0]<=172800000).length;
    const avg=rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:0;
    const sc=Math.round(Math.min(ok.length,50)/50*25+(rs.length?(avg-1)/4*30:18)+25*(1-disp/Math.max(all.length,1))+(sp.length?20*fast/sp.length:12));
    return{score:sc,tier:sc>=85?'top':sc>=70?'trusted':sc>=50?'growing':'building',deals:ok.length,rated:rs.length,avg:Math.round(avg*10)/10,disputes:disp,verified:sc>=70};
  }
  const label=x=>x?(x.verified&&x.tier!=='top'?t('ver'):t(x.tier)):'';
  /* Small badge for lists, product cards and headers. Shows nothing for a seller with no score yet. */
  const badge=x=>x&&x.tier&&x.tier!=='new'?`<span class="trust-badge trust-${esc(x.tier)}" title="${esc(t('of'))} ${+x.score}/100">${x.verified?'\u2713 ':''}${esc(label(x))} <b>${+x.score}</b></span>`:'';
  /* Larger line for deal links, receipts, product pages and the shop page. */
  const line=x=>!x||!x.tier?'':x.tier==='new'?`<p class="trust-line trust-new">${esc(t('new'))}. ${esc(t('nd'))}.</p>`:`<div class="trust-line trust-${esc(x.tier)}">${badge(x)}<small>${+x.deals} ${esc(t('deals'))}${x.rated?` \u00b7 ${+x.avg} \u2605`:''}${x.disputes?` \u00b7 ${+x.disputes} dispute${x.disputes>1?'s':''}`:''}</small></div>`;
  /* Seller's own card: score, progress and the shop link. */
  const card=(x,url)=>{
    const body=x.tier==='new'?`<p class="sub">${esc(t('need'))}</p><div class="trust-bar" role="progressbar" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${+x.deals}"><i data-w="${Math.min(100,(+x.deals||0)*20)}"></i></div><p class="help">${+x.deals} / 5 ${esc(t('deals'))}</p>`
      :`<div class="trust-big trust-${esc(x.tier)}"><b>${+x.score}</b><span>/100 \u00b7 ${esc(label(x))}</span></div><div class="trust-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${+x.score}"><i data-w="${+x.score}"></i></div>
      <ul class="trust-how"><li>${esc(t('h1'))}: ${+x.deals}</li><li>${esc(t('h2'))}: ${x.rated?+x.avg+' \u2605 ('+(+x.rated)+')':'\u2014'}</li><li>${esc(t('h3'))}: ${x.disputes?+x.disputes+' dispute'+(x.disputes>1?'s':''):'\u2713'}</li></ul>`;
    return `<section class="card trust-card"><h2>${esc(t('of'))}</h2>${body}<p class="help">${esc(t('note'))}</p>${url?`<div class="actions"><button class="btn ghost" id="trust-copy" type="button">${esc(t('copy'))}</button><a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(url)}">${esc(t('share'))}</a></div>`:''}</section>`;
  };
  return{compute,badge,line,card,label};
})();
