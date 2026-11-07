/* Public screens: buyer, rider, receipt, seller record, verify. These open from a link and need no account. */
const NF=()=>DEALPIN.mode==='supabase'?'This link is not valid, or the deal was removed.':'This link is not available on this device.';
const GEO_ERR={1:'Location access was blocked. Allow it in your browser settings, or describe the place instead.',2:'Your position could not be found. Turn on GPS and try again, or describe the place instead.',3:'Finding your position took too long. Go outside or near a window and try again.'};
const here=(ok,fail_)=>navigator.geolocation.getCurrentPosition(ok,e=>fail_(GEO_ERR[e&&e.code]||GEO_ERR[2]),{enableHighAccuracy:true,timeout:20000,maximumAge:0});
const mapsHref=p=>`https://www.google.com/maps?q=${+p.lat},${+p.lng}`;

async function Rider(t){
  const d=await Store.riderDeal(t);if(!d)return missing(NF(),false);
  const b=d.buyer;if(!b||d.status==='cancelled')return missing('This delivery is not ready, or it was cancelled.',false);
  const a=d.arrival,dial=String(b.phone).replace(/[^0-9+]/g,'');
  view(`<h1>Delivery: ${esc(d.title)}</h1><p class="sub">For ${esc(b.name)}</p>
  <div class="card"><h2>Where to go</h2>${b.pin?`<p><a class="btn block" href="${mapsHref(b.pin)}" target="_blank" rel="noopener noreferrer">${ic('pin')} Open pin in Maps</a></p>`:''}${b.landmark?`<p>${esc(b.landmark)}</p>`:''}${mediaUrl(b.voice)?`<audio controls src="${esc(mediaUrl(b.voice))}"></audio>`:''}<p><a class="btn ghost block" href="tel:${esc(dial)}">Call ${esc(b.phone)}</a></p></div>
  ${a?`<div class="card"><h2>Arrival recorded</h2><p>${a.dist!=null?`You were ${Math.round(+a.dist)} m from the pin.`:'Your location was saved.'}</p></div>`
  :d.status==='shipped'?`<button class="btn block" id="ar">I have arrived</button>`:'<div class="card"><p>The seller has not marked this item as shipped yet. This page updates by itself.</p></div>'}
  ${d.needsHandover&&!d.handoverOk&&d.status==='shipped'?`<form id="hf" class="card" novalidate><h2>Handover code</h2><p class="help">Ask the buyer for their 4 digit code.</p><div class="field"><label for="hc">Code</label><input id="hc" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"></div><button class="btn block">Confirm handover</button></form>`:d.handoverOk?'<div class="card"><h2>Handover confirmed</h2></div>':''}`);
  submit('#hf',async()=>{const c=$('#hc').value.trim();if(!/^\d{4}$/.test(c))return bad('#hc','Enter the 4 digit code.');await Store.riderAct(t,'handover',{handoverCode:c});note('Handover confirmed');Rider(t)});
  tap('#ar',()=>new Promise(res=>{
    if(!navigator.geolocation){note('This browser cannot share location.');return res()}
    note('Finding your position…');
    here(async p=>{try{await Store.riderAct(t,'arrived',{arrival:{lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6),acc:Math.round(p.coords.accuracy)}});note('Arrival recorded');Rider(t)}catch(x){fail(x)}res()},m=>{note(m);res()})}));
  watch(()=>Rider(t));
}

const pickMime=()=>{const c=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];return window.MediaRecorder&&MediaRecorder.isTypeSupported?c.find(x=>MediaRecorder.isTypeSupported(x))||'':''};

async function BuyerDeal(t){
  const d=await Store.buyerDeal(t);if(!d)return missing(NF(),false);
  const head=`${langBox()}<h1>${esc(d.title)}</h1><p class="sub">${price(d)} from ${esc((d.seller||{}).name)}</p>${gal(d.photos)}`;
  const msg=d.seller&&d.seller.phone?`<a class="btn ghost block" href="https://wa.me/${tel(d.seller.phone)}?text=${encodeURIComponent('Hi, about '+d.title+' (deal '+d.id+')')}" target="_blank" rel="noopener">${T('msg')}</a>`:'';
  const rc=msg+`<a class="btn ghost block" href="#/r/${encodeURIComponent(d.id)}">${T('receipt')}</a>`;
  if(outbox().some(j=>(j.token||j.id)===t))return view(head+`<div class="card"><h2>${T('saved')}</h2><p>${T('savedp')}</p></div>`);
  if(d.status!=='created')watch(()=>BuyerDeal(t));   // the page updates by itself when the seller ships
  if(d.status==='cancelled')return view(head+'<div class="card"><h2>This deal was cancelled</h2><p>Contact the seller if you think this is a mistake.</p></div>'+msg);
  if(d.status==='agreed'){view(head+`<div class="card"><h2>${T('agreed')}</h2><p>Waiting for the seller to ship. This page updates by itself.</p></div>${payBox(d)}${rc}`);return bindPay(t)}
  if(d.status==='shipped'){
    view(head+`<div class="card"><h2>${T('onway')}</h2>${d.arrival?'<p><b>Your rider has arrived.</b> Check outside.</p>':''}${d.handover?`<p>${T('handover')}: <b class="code">${esc(d.handover)}</b></p>`:''}${d.parcel?`<p>Parcel reference: <b>${esc(d.parcel)}</b></p>`:''}<p>Only tap received once the item is in your hands.</p></div>${payBox(d)}<div class="actions"><button class="btn" id="rv">${T('got')}</button><button class="btn bad" id="pb">${T('wrong')}</button></div>`);
    bindPay(t);
    tap('#rv',async()=>{if(!await ask({title:'Confirm you received the item?',body:'This completes the deal and issues the receipt code.',ok:'Yes, I received it'}))return;await Store.buyerAct(t,'receive');note('Receipt confirmed');BuyerDeal(t)});
    on('#pb',()=>{view(head+`<form id="df" class="card" data-lock novalidate><h2>What is wrong?</h2><div class="field"><label for="dw">Describe the problem</label><textarea id="dw" rows="3" maxlength="300"></textarea></div><div class="field"><label for="dp">Photo (optional)</label><input id="dp" type="file" accept="image/*"></div><button class="btn bad block">Report the problem</button><button type="button" class="btn ghost block" id="dx">Go back</button></form>`);
      on('#dx',()=>BuyerDeal(t));
      submit('#df',async()=>{const why=$('#dw').value.trim();if(!why)return bad('#dw','Please say what is wrong.');
        const f=$('#dp').files[0],photo=f?await shrink(f):null;
        await Store.buyerAct(t,'dispute',{dispute:{why:why.slice(0,300),photo}});note('Problem reported');BuyerDeal(t)})});
    return;
  }
  if(d.status==='received'){view(head+`<div class="card"><div class="stamp">${ic('check')}Verified</div><p>Thank you. This deal is complete.</p></div>${rateBox(d)}${rc}`);return bindRate(t)}
  if(d.status==='resolved')return view(head+`<div class="card"><h2>Resolved</h2><p>The seller marked this problem as resolved.</p></div>${rc}`);
  if(d.status==='disputed')return view(head+`<div class="card"><h2>Problem reported</h2><p>The seller can see your report on the deal record.</p>${d.dispute&&d.dispute.reply?`<p><b>Seller reply:</b> ${esc(d.dispute.reply)}</p>`:''}</div>${rc}`);
  let pin=null,voice=null,rec=null;const rider_=mode(d)==='rider';
  view(head+msg+`<div class="card"><h2>Terms</h2><p>Delivery: ${esc(d.delivery)}</p>${d.terms?`<p>${esc(d.terms)}</p>`:''}</div>
  <form id="f" class="card" novalidate><h2>${T('details')}</h2>
    <div class="field"><label for="n">${T('name')}</label><input id="n" autocomplete="name" required maxlength="60"></div>
    <div class="field"><label for="ph">${T('phone')}</label><input id="ph" type="tel" inputmode="tel" autocomplete="tel" required maxlength="20"><p class="help">Include the country code, for example ${esc(REGION.dial)}.</p></div>
    ${rider_?`<div class="field"><span class="label">Where should it arrive?</span><button type="button" class="btn ghost block" id="gp">${ic('pin')} ${T('loc')}</button><p class="help" id="gs" aria-live="polite">Stand at the delivery spot first for the best accuracy.</p></div>`:''}
    <div class="field"><label for="lm">${rider_?T('place'):mode(d)==='courier'?'Town and bus park or courier office':'Note for the seller (optional)'}</label><textarea id="lm" rows="2" maxlength="200"></textarea></div>
    ${rider_?`<div class="field"><button type="button" class="btn ghost block" id="rc">${ic('mic')} ${T('voice')}</button><div id="vp"></div></div>`:''}
    <button class="btn block">${T('agree')}</button>
  </form>`);
  on('#gp',()=>{
    if(!navigator.geolocation)return note('This browser cannot share location. Describe the place instead.');
    $('#gs').textContent='Finding your location…';
    here(p=>{pin={lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6),acc:Math.round(p.coords.accuracy)};$('#gs').textContent=`Location saved, accurate to about ${pin.acc} m.`},m=>{$('#gs').textContent=m});
  });
  on('#rc',async()=>{
    if(rec&&rec.state==='recording')return rec.stop();
    if(!navigator.mediaDevices||!window.MediaRecorder)return note('Voice notes are not supported here. Describe the place in writing.');
    try{
      const st=await navigator.mediaDevices.getUserMedia({audio:true}),ch=[],mt=pickMime();rec=new MediaRecorder(st,mt?{mimeType:mt}:undefined);
      rec.ondataavailable=e=>{if(e.data&&e.data.size)ch.push(e.data)};
      rec.onstop=()=>{st.getTracks().forEach(x=>x.stop());const r=new FileReader();
        r.onload=()=>{voice=r.result;$('#vp').innerHTML=`<audio controls src="${esc(mediaUrl(voice))}"></audio>`;$('#rc').innerHTML=`${ic('mic')} Record again`};
        r.readAsDataURL(new Blob(ch,{type:rec.mimeType||mt}))};
      rec.start();$('#rc').innerHTML=`${ic('mic')} Stop recording`;setTimeout(()=>rec.state==='recording'&&rec.stop(),20000);
    }catch{note('Microphone access was blocked. Allow it in your browser, or describe the place in writing.')}
  });
  submit('#f',async()=>{
    const name=$('#n').value.trim(),phone=$('#ph').value.trim(),landmark=$('#lm').value.trim();
    if(!name)return bad('#n','Enter your name.');
    if(!phone)return bad('#ph','Enter your phone number.');
    if(!/^[0-9+() -]{5,20}$/.test(phone))return bad('#ph','Use digits, spaces and + only.');
    if(rider_&&!pin&&!landmark&&!voice)return bad('#lm','Share your location or describe the place.');
    if(mode(d)==='courier'&&!landmark)return bad('#lm','Enter the town and the bus park or courier office.');
    const buyer={name,phone,pin,landmark,voice};
    if(!navigator.onLine){try{localStorage.setItem(OB,JSON.stringify([...outbox(),{token:t,buyer}]))}catch{return note('Storage is full. Remove the voice note and try again.')}return view(head+`<div class="card"><h2>${T('saved')}</h2><p>${T('savedp')}</p></div>`)}
    await Store.buyerAct(t,'agree',{buyer});note('Deal agreed');BuyerDeal(t)});
}

async function Receipt(id){
  const d=await Store.getReceipt(id);if(!d)return missing(DEALPIN.mode==='supabase'?'This receipt was not found.':'This receipt is not available on this device yet.',false);
  const s=d.seller||{},b=d.buyer,rl=link('r',id);
  view(`<article class="ticket"><div class="hd"><b>Dealpin receipt</b><span>#${esc(d.id)}</span></div>
  <h1>${esc(d.title)}</h1>
  <dl><dt>Price</dt><dd>${price(d)}</dd><dt>Seller</dt><dd>${esc(s.name)}</dd><dt>Buyer</dt><dd>${b?esc(b.name):'Not yet agreed'}</dd><dt>Delivery</dt><dd>${esc(d.delivery)}</dd><dt>Payment</dt><dd>${d.payment?esc(d.payment.method)+(d.payment.ok?' (confirmed)':' (recorded)'):'Not recorded'}</dd></dl>
  ${steps(d)}
  ${d.code?`<div class="stamp">${ic('check')}Verified</div><p>Receipt code <span class="code">${esc(d.code)}</span></p>`:`<p class="sub">Not verified yet. The buyer has not confirmed receipt.</p>`}
  ${d.code?qrBox(rl,'Scan to check this receipt'):''}</article><div class="actions"><a class="btn" href="${'https://wa.me/?text='+encodeURIComponent(`Dealpin receipt for ${d.title} (${price(d)})${d.code?', code '+d.code:''}: ${rl}`)}" target="_blank" rel="noopener">Send receipt on WhatsApp</a><button class="btn ghost" id="rc">Copy receipt link</button><button class="btn ghost" id="pr">Print or save as PDF</button>${s.handle?`<a class="btn ghost" href="#/u/${encodeURIComponent(s.handle)}">See seller record</a>`:''}</div>`);
  on('#rc',()=>copy(rl,'Receipt link'));on('#pr',()=>window.print());
}

async function PublicProfile(h){
  const pr=await Store.publicSeller(h);if(!pr)return missing('No seller uses this link.',false);
  const s=pr.seller,ds=pr.deals,st=Store.stats(ds),v=ds.filter(d=>d.status==='received'),rt=Store.rating(ds);
  view(`<h1>${esc(s.name)}</h1><p class="sub">Seller record on Dealpin</p>${rt.n?`<p class="sub">${+rt.avg} ★ from ${+rt.n} rating${rt.n>1?'s':''}</p>`:''}
  <div class="stats two"><div><b>${st.verified}</b>Verified deals</div><div><b>${st.disputed}</b>Disputes</div></div>
  <h2>Recent verified deals</h2>
  ${v.length?`<ul class="list">${v.slice(0,10).map(d=>`<li><a class="row" href="#/r/${encodeURIComponent(d.id)}"><div><b>${esc(d.title)}</b><small>${price(d)} <span aria-hidden="true">·</span> ${when(d.events[d.events.length-1].at)}</small></div>${chip('received')}</a></li>`).join('')}</ul>`:'<p class="sub">No verified deals yet.</p>'}`);
}

async function Verify(){
  view(`<h1>Verify a receipt</h1><p class="sub">Enter the receipt code to check it.</p><form id="vf" class="card" novalidate><div class="field"><label for="vc">Receipt code</label><input id="vc" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="14"><p class="help">Three groups of four letters and numbers, like the code printed on the receipt.</p></div><button class="btn block">Check code</button></form><div id="vr" aria-live="polite"></div>`);
  submit('#vf',async()=>{const c=$('#vc').value.trim();if(!c)return bad('#vc','Enter the receipt code.');
    const d=await Store.verify(c);
    $('#vr').innerHTML=d?`<div class="card"><div class="stamp">${ic('check')}Code matches</div><p>${esc(d.title)}, ${price(d)}</p><a href="#/r/${encodeURIComponent(d.id)}">Open receipt</a></div>`:`<div class="card"><p>${DEALPIN.mode==='supabase'?'No receipt matches that code. Check the code and try again.':'No receipt on this device matches that code. Checking against the online record needs the online version of Dealpin.'}</p></div>`});
}
