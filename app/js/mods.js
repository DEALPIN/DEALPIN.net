/* The six Tools: Ledger, Invoices, Riders, Deliveries, Stock, Group orders. Each is one definition object; js/mods-ui.js draws them. */
const sumBy=(l,f)=>{const q={};l.forEach(x=>{const v=f(x);if(v)q[x.cur]=(q[x.cur]||0)+v});return q};
const moneyList=q=>Object.keys(q).sort().map(c=>fmM(q[c],c)).join(' + ')||'None';
const kpis=a=>`<div class="kpis">${a.map(([l,v])=>`<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}</div>`;
const sha=async s=>{if(!(window.crypto&&crypto.subtle))return '';return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('')};
const logEv=(o,s,ex={})=>({...o,...ex,ev:[...o.ev,{s,at:Date.now()}]});
const evList=l=>`<ul class="tl">${l.slice().reverse().map(v=>`<li>${esc(v.s)}<small>${when(v.at)}</small></li>`).join('')}</ul>`;

/* ================= Ledger */
TOOLS.ledger={title:'Ledger',icon:'book',sing:'entry',search:'Search by name or note',intro:'Who owes you and who you owe, with part payments and a statement you can send.',
  st(x){const b=Calc.ledger(x);return b.bal<=0?['Settled','received']:x.due&&x.due<today()?['Overdue','disputed']:b.paid>0?['Part paid','shipped']:['Open','agreed']},
  tabs:[['Open',x=>Calc.ledger(x).bal>0],['Settled',x=>Calc.ledger(x).bal<=0],['All',()=>true]],
  text:x=>[x.who,x.phone,x.note].join(' '),
  kpi(l){const open=l.filter(x=>Calc.ledger(x).bal>0);return kpis([['Owed to you',moneyList(sumBy(open.filter(x=>x.dir==='owed'),x=>Calc.ledger(x).bal))],['You owe',moneyList(sumBy(open.filter(x=>x.dir==='owe'),x=>Calc.ledger(x).bal))],['Overdue',String(open.filter(x=>x.due&&x.due<today()).length)]])},
  row(x){const b=Calc.ledger(x);return `<div class="deal-main"><b>${esc(x.who)}</b><small>${x.dir==='owed'?'Owes you':'You owe'} ${fmM(Math.max(0,b.bal),x.cur)}${x.due?' · due '+dt(x.due):''}</small></div>${pill(...this.st(x))}`},
  form:x=>fSelect('dr','Type',x.dir||'owed',[['owed','Someone owes me'],['owe','I owe someone']])+fText('w','Name',x.who||'',{max:60,auto:'off'})+fPhone('ph','Phone (optional)',x.phone||'')+fMoney('am','Amount',x.amt||'')+fCur('cu',x.cur)+fDate('du','Due date (optional)',x.due||'')+fText('nt','What it is for (optional)',x.note||'',{max:140}),
  read(x){const amt=amount('am','Enter an amount above 0.'),cur=val('cu'),paid=x.pay?sumP(x.pay,x.cur):0;
    if(x.pay&&x.pay.length&&cur!==x.cur)throw new FieldErr('#cu','The currency cannot change after a payment was recorded.');
    if(mn(amt,cur)<paid)throw new FieldErr('#am',`The amount cannot be less than the ${fmM(paid,cur)} already paid.`);
    return{dir:val('dr'),who:need('w','Enter a name.'),phone:val('ph'),amt,cur,due:val('du'),note:val('nt')}},
  view(x,ctx){const b=Calc.ledger(x);return `<h1>${esc(x.who)}</h1><p class="sub">${x.dir==='owed'?'Owes you':'You owe'} ${pill(...this.st(x))}</p>
    <div class="card">${kpis([['Total',fmM(b.tot,x.cur)],['Paid',fmM(b.paid,x.cur)],['Balance',fmM(Math.max(0,b.bal),x.cur)]])}${x.note?`<p>${esc(x.note)}</p>`:''}${x.due?`<p class="help">Due ${dt(x.due)}</p>`:''}${x.phone?`<p class="help">${esc(x.phone)}</p>`:''}</div>
    <div class="card"><h2>Payments</h2>${payList(x.pay,x.cur)}</div>${b.bal>0?payForm('Record a payment'):''}
    <div class="actions noprint">${waBtn(this.msg(x,ctx.me),x.phone,'Send statement on WhatsApp')}${b.bal>0?'<button class="btn ghost" id="settle">Mark as fully paid</button>':''}</div>`},
  msg(x,me){const b=Calc.ledger(x);return `Hello ${x.who}, statement from ${me.name||'me'}: ${x.dir==='owed'?'you owe me':'I owe you'} ${fmM(b.tot,x.cur)}${x.note?' for '+x.note:''}. Paid so far: ${fmM(b.paid,x.cur)}. Balance: ${fmM(Math.max(0,b.bal),x.cur)}${x.due?'. Due '+dt(x.due):''}.`},
  bind(x,ctx,again){const b=Calc.ledger(x);bindPayment(x,'ledger',b.bal,again);
    tap('#settle',async()=>{if(!await ask({title:'Mark as fully paid?',body:`This records a payment of ${fmM(b.bal,x.cur)}.`,ok:'Mark as paid'}))return;await ModStore.save('ledger',{...x,pay:[...x.pay,{amt:mj(b.bal,x.cur),at:Date.now(),note:'Settled'}]});note('Settled');again()})},
  csv:{head:['Type','Name','Phone','Currency','Total','Paid','Balance','Due','Note','Created'],row:x=>{const b=Calc.ledger(x);return[x.dir==='owed'?'Owed to me':'I owe',x.who,x.phone,x.cur,mj(b.tot,x.cur),mj(b.paid,x.cur),mj(b.bal,x.cur),x.due,x.note,new Date(x.at).toISOString()]}}};

/* ================= Invoices */
const nextNo=l=>'INV-'+String(l.reduce((m,x)=>Math.max(m,+(/(\d+)$/.exec(x.no)||[0,0])[1]||0),0)+1).padStart(4,'0');
let lineSeq=0;
const lineHtml=(it={})=>{const n=++lineSeq;return `<div class="line"><div class="field"><label for="ld${n}">Description</label><input id="ld${n}" class="ld" maxlength="100" value="${esc(it.d||'')}" autocomplete="off"></div><div class="row-2"><div class="field"><label for="lq${n}">Quantity</label><input id="lq${n}" class="lq" type="number" inputmode="decimal" min="0" step="any" value="${esc(it.q==null?1:it.q)}"></div><div class="field"><label for="lp${n}">Price each</label><input id="lp${n}" class="lp" type="number" inputmode="decimal" min="0" step="any" value="${it.p||it.p===0?esc(it.p):''}"></div></div><button type="button" class="btn ghost rl noprint">Remove this line</button></div>`};
const readLines=()=>$$('.line').map(r=>({r,d:$('.ld',r),q:$('.lq',r),p:$('.lp',r)})).filter(l=>l.d.value.trim()||l.p.value.trim());
TOOLS.invoices={title:'Invoices',icon:'doc',sing:'invoice',search:'Search by number or client',intro:'Professional invoices with part payments. Print or save as PDF, or send by WhatsApp.',
  st(x){const b=Calc.invoice(x);return b.tot>0&&b.bal<=0?['Paid','received']:x.due&&x.due<today()?['Overdue','disputed']:b.paid>0?['Part paid','shipped']:['Unpaid','agreed']},
  tabs:[['Unpaid',x=>Calc.invoice(x).bal>0],['Paid',x=>{const b=Calc.invoice(x);return b.tot>0&&b.bal<=0}],['All',()=>true]],
  text:x=>[x.no,x.client,x.phone].join(' '),
  kpi(l){const open=l.filter(x=>Calc.invoice(x).bal>0);return kpis([['Outstanding',moneyList(sumBy(open,x=>Calc.invoice(x).bal))],['Overdue',String(open.filter(x=>x.due&&x.due<today()).length)],['Invoices',String(l.length)]])},
  row(x){return `<div class="deal-main"><b>${esc(x.no)} · ${esc(x.client)}</b><small>${fmM(Calc.invoice(x).tot,x.cur)}${x.due?' · due '+dt(x.due):''}</small></div>${pill(...this.st(x))}`},
  async prefill(q){if(!q.deal)return null;const d=await Store.getDeal(q.deal);if(!d)return null;return{client:d.buyer?d.buyer.name:'',phone:d.buyer?d.buyer.phone:'',cur:cur(d),items:[{d:d.title,q:1,p:d.price}],deal:d.id}},
  form:(x,ctx)=>fText('no','Invoice number',x.no||nextNo(ctx.all),{max:20})+fText('cl','Client',x.client||'',{max:60})+fPhone('ph','Client phone (optional)',x.phone||'')+fDate('is','Issue date',x.issue||today())+fDate('du','Due date (optional)',x.due||'')+fCur('cu',x.cur)
    +`<div class="field"><span class="label">Items</span><div id="lines">${(x.items&&x.items.length?x.items:[{}]).map(lineHtml).join('')}</div><button type="button" class="btn ghost" id="addl">Add a line</button></div>`
    +fMoney('dc','Discount (amount, optional)',x.disc||'')+fText('tx','Tax (percent, optional)',x.tax||'',{type:'number',mode:'decimal'})+fArea('nt','Notes (optional)',x.notes||'',{max:300})+'<div class="tot" id="ltot" aria-live="polite"></div>',
  bindForm(x){
    const calc=()=>{const cu=val('cu'),items=readLines().map(l=>({q:Math.max(0,+l.q.value||0),p:Math.max(0,+l.p.value||0)})),b=Calc.invoice({cur:cu,items,disc:Math.max(0,+val('dc')||0),tax:Math.max(0,+val('tx')||0),pay:[]});
      $('#ltot').innerHTML=`<p>Subtotal <b>${fmM(b.sub,cu)}</b></p>${b.dc?`<p>Discount <b>−${fmM(b.dc,cu)}</b></p>`:''}${b.tx?`<p>Tax <b>${fmM(b.tx,cu)}</b></p>`:''}<p class="grand">Total <b>${fmM(b.tot,cu)}</b></p>`};
    const wire=()=>$$('.rl').forEach(b=>b.onclick=()=>{if($$('.line').length>1){b.closest('.line').remove();calc()}else note('An invoice needs at least one line.')});
    $('#mf').addEventListener('input',calc);$('#mf').addEventListener('change',calc);
    on('#addl',()=>{$('#lines').insertAdjacentHTML('beforeend',lineHtml());wire();const l=$$('.ld');l[l.length-1].focus()});wire();calc()},
  read(x){const lines=readLines();if(!lines.length)throw new FieldErr('.ld','Add at least one item.');
    const items=lines.map(l=>{if(!l.d.value.trim())throw new FieldErr(l.d,'Describe this item.');const q=+l.q.value,p=l.p.value===''?NaN:+l.p.value;
      if(!(q>0))throw new FieldErr(l.q,'Quantity must be above 0.');if(!(p>=0))throw new FieldErr(l.p,'Enter the price.');return{d:l.d.value.trim(),q,p}});
    const cu=val('cu'),tax=optional('tx');if(tax>100)throw new FieldErr('#tx','Tax is a percent from 0 to 100.');
    if(x.pay&&x.pay.length&&cu!==x.cur)throw new FieldErr('#cu','The currency cannot change after a payment was recorded.');
    const o={no:need('no','Enter an invoice number.'),client:need('cl','Enter the client name.'),phone:val('ph'),issue:val('is')||today(),due:val('du'),cur:cu,items,disc:optional('dc'),tax,notes:val('nt')};
    const b=Calc.invoice({...o,pay:x.pay||[]});if(b.tot<=0)throw new FieldErr('.lp','The total must be above 0.');if(b.paid>b.tot)throw new FieldErr('#mf','The invoice total cannot be less than what was already paid.');return o},
  async prep(x){const b=Calc.invoice(x),h=(await sha(JSON.stringify([x.no,x.client,x.issue,x.cur,x.items,x.tax,x.disc,b.tot]))).slice(0,12).toUpperCase();return h===x.code?x:ModStore.save('invoices',{...x,code:h})},
  view(x,ctx){const b=Calc.invoice(x),me=ctx.me;return `<div class="doc"><div class="dochead"><div><h1>Invoice ${esc(x.no)}</h1><p class="sub">${pill(...this.st(x))}</p></div><div class="right"><b>${esc(me.name||'')}</b><small>${esc(me.phone||'')}</small></div></div>
    <p><b>Billed to</b><br>${esc(x.client)}${x.phone?'<br>'+esc(x.phone):''}</p><p class="help">Issued ${dt(x.issue)}${x.due?' · due '+dt(x.due):''}</p>
    <div class="scroll"><table class="tbl"><thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Price</th><th scope="col">Amount</th></tr></thead><tbody>${x.items.map(i=>`<tr><td>${esc(i.d)}</td><td>${+i.q}</td><td>${fmM(mn(i.p,x.cur),x.cur)}</td><td>${fmM(Calc.line(i,x.cur),x.cur)}</td></tr>`).join('')}</tbody></table></div>
    <div class="tot"><p>Subtotal <b>${fmM(b.sub,x.cur)}</b></p>${b.dc?`<p>Discount <b>−${fmM(b.dc,x.cur)}</b></p>`:''}${b.tx?`<p>Tax ${+x.tax}% <b>${fmM(b.tx,x.cur)}</b></p>`:''}<p class="grand">Total <b>${fmM(b.tot,x.cur)}</b></p><p>Paid <b>${fmM(b.paid,x.cur)}</b></p><p class="grand">Balance due <b>${fmM(Math.max(0,b.bal),x.cur)}</b></p></div>
    ${x.notes?`<p>${esc(x.notes)}</p>`:''}${me.pay?`<p class="help">Pay to: ${esc(me.pay)}</p>`:''}${x.code?`<p class="help">Reference ${esc(x.code.replace(/(.{4})/g,'$1 ').trim())}</p>`:''}</div>
    <div class="card noprint"><h2>Payments</h2>${payList(x.pay,x.cur)}</div>${b.bal>0?payForm('Record a payment'):''}
    <div class="actions noprint"><button class="btn" id="pr">Print or save as PDF</button>${waBtn(`Hello ${x.client}, invoice ${x.no} from ${me.name||'me'}: total ${fmM(b.tot,x.cur)}, balance ${fmM(Math.max(0,b.bal),x.cur)}${x.due?', due '+dt(x.due):''}.${me.pay?' Pay to: '+me.pay+'.':''}`,x.phone,'Send on WhatsApp')}</div>`},
  bind(x,ctx,again){bindPayment(x,'invoices',Calc.invoice(x).bal,again);on('#pr',()=>window.print())},
  dup:async(x,ctx)=>({...x,id:'',rev:undefined,at:undefined,no:nextNo(await ModStore.list('invoices')),issue:today(),due:'',pay:[],code:'',deal:''}),
  csv:{head:['Number','Client','Phone','Currency','Issued','Due','Total','Paid','Balance','Reference'],row:x=>{const b=Calc.invoice(x);return[x.no,x.client,x.phone,x.cur,x.issue,x.due,mj(b.tot,x.cur),mj(b.paid,x.cur),mj(b.bal,x.cur),x.code]}}};

/* ================= Riders and settlement */
const settleable=(j,r)=>j.rider===r.id&&j.st==='delivered'&&!j.settled;
const heldReason=(j,r)=>TOOLS.jobs.review(j)?'needs a review note':Calc.earn(j,r)===null?`rate is not set in ${j.cur}`:'';
TOOLS.riders={title:'Riders',icon:'users',sing:'rider',search:'Search riders',intro:'The people who deliver for you, what each earns, and what to settle.',
  tabs:[['All',()=>true]],text:x=>[x.name,x.phone].join(' '),kpi:l=>kpis([['Riders',String(l.length)]]),
  row:x=>`<div class="deal-main"><b>${esc(x.name)}</b><small>${x.kind==='pct'?+x.rate+'% of each delivery fee':money(x.rate,x.cur)+' per delivery'}</small></div>`,
  form:x=>fText('w','Name',x.name||'',{max:60,auto:'off'})+fPhone('ph','Phone',x.phone||'')+fSelect('kd','How you pay this rider',x.kind||'flat',[['flat','A fixed amount per delivery'],['pct','A share of the delivery fee']])+fCur('cu',x.cur)+fMoney('rt','Amount, or percent of the fee',x.rate||'',{zero:1}),
  read(x){const kind=val('kd'),rate=amount('rt','Enter an amount, 0 or more.',true);if(kind==='pct'&&rate>100)throw new FieldErr('#rt','A share is a percent from 0 to 100.');return{name:need('w','Enter a name.'),phone:val('ph'),kind,cur:val('cu'),rate}},
  async view(x){const jobs=await ModStore.list('jobs'),setl=(await ModStore.list('setl')).filter(z=>z.rider===x.id),ready={},held=[];
    jobs.filter(j=>settleable(j,x)).forEach(j=>{const why=heldReason(j,x);if(why)held.push([j,why]);else{const g=ready[j.cur]||(ready[j.cur]={n:0,earn:0,cod:0});g.n++;g.earn+=Calc.earn(j,x);g.cod+=mn(j.cod,j.cur)}});
    return `<h1>${esc(x.name)}</h1><p class="sub">${x.kind==='pct'?+x.rate+'% of each fee':money(x.rate,x.cur)+' per delivery'}${x.phone?' · '+esc(x.phone):''}</p>
    <div class="card"><h2>To settle</h2>${Object.keys(ready).length?Object.entries(ready).map(([cu,g])=>`<p><b>${g.n}</b> ${g.n===1?'delivery':'deliveries'} · earned <b>${fmM(g.earn,cu)}</b> · cash collected <b>${fmM(g.cod,cu)}</b></p><p class="sum">${g.cod>=g.earn?`Rider hands you <b>${fmM(g.cod-g.earn,cu)}</b>`:`You pay the rider <b>${fmM(g.earn-g.cod,cu)}</b>`}</p>`).join(''):'<p class="help">Nothing to settle. Delivered jobs show here until you settle them.</p>'}${Object.keys(ready).length?'<div class="actions noprint"><button class="btn" id="st">Mark these as settled</button></div>':''}</div>
    ${held.length?`<div class="card warn"><h2>On hold</h2>${held.map(([j,w])=>`<p><a href="#/m/jobs/${mid(j.id)}">${esc(j.dname)}</a> · ${esc(w)}</p>`).join('')}</div>`:''}
    <div class="card"><h2>Past settlements</h2>${setl.length?setl.map(z=>`<p>${when(z.at)} · ${+z.count} ${z.count===1?'job':'jobs'} · ${z.net>=0?'rider handed over':'you paid'} <b>${fmM(Math.abs(mn(z.net,z.cur)),z.cur)}</b></p>`).join(''):'<p class="help">None yet.</p>'}</div>`},
  async bind(x,ctx,again){tap('#st',async()=>{
    const jobs=(await ModStore.list('jobs')).filter(j=>settleable(j,x)&&!heldReason(j,x)),by={};jobs.forEach(j=>(by[j.cur]=by[j.cur]||[]).push(j));
    if(!jobs.length)return again();
    if(!await ask({title:'Mark these deliveries as settled?',body:'Use this after the cash and the rider’s pay have been handed over. It cannot be undone.',ok:'Mark as settled'}))return;
    const ops=[];for(const cu in by){const L=by[cu],earn=L.reduce((u,j)=>u+Calc.earn(j,x),0),cod=L.reduce((u,j)=>u+mn(j.cod,cu),0);
      ops.push({op:'save',col:'setl',obj:{rider:x.id,cur:cu,count:L.length,earn:mj(earn,cu),cod:mj(cod,cu),net:mj(cod-earn,cu),at:Date.now()}});L.forEach(j=>ops.push({op:'save',col:'jobs',obj:{...j,settled:true}}))}
    await ModStore.batch(ops);note('Settled');again()})}};

/* ================= Deliveries */
const JOB_ST={new:['New','agreed'],picked:['On the way','shipped'],delivered:['Delivered','received'],failed:['Failed','disputed'],cancelled:['Cancelled','cancelled']};
TOOLS.jobs={title:'Deliveries',icon:'truck',sing:'delivery',search:'Search recipient or place',intro:'Assign a drop, prove the handover with a code, collect cash on delivery, settle your riders.',
  review:x=>(x.st==='failed'||(x.st==='delivered'&&!!x.why))&&!x.res,
  st(x){return this.review(x)?['Needs review','disputed']:JOB_ST[x.st]},
  canEdit:x=>x.st==='new'||x.st==='picked',
  tabs:[['Open',x=>x.st==='new'||x.st==='picked'],['Delivered',x=>x.st==='delivered'],['Needs review',x=>TOOLS.jobs.review(x)],['All',()=>true]],
  text:(x,ctx)=>[x.client,x.dname,x.drop,x.dphone,(ctx.rider(x.rider)||{}).name].join(' '),
  filters:ctx=>ctx.riders.length?`<div class="sort-wrap"><label class="sr-only" for="xf">Filter by rider</label><select id="xf"><option value="">All riders</option><option value="_none">Not assigned</option>${ctx.riders.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></div>`:'',
  match:(x,v)=>!v||(v==='_none'?!x.rider:x.rider===v),
  kpi(l){const t0=new Date().setHours(0,0,0,0),out=l.filter(x=>x.st==='picked');
    return kpis([['Open',String(l.filter(x=>x.st==='new'||x.st==='picked').length)],['Delivered today',String(l.filter(x=>x.st==='delivered'&&((x.ev.find(v=>v.s.startsWith('Delivered'))||{at:0}).at>=t0)).length)],['Needs review',String(l.filter(x=>this.review(x)).length)],['Cash out with riders',moneyList(sumBy(out,x=>mn(x.cod,x.cur)))]])},
  row(x,ctx){const r=ctx.rider(x.rider);return `<div class="deal-main"><b>${esc(x.dname||x.drop)}</b><small>${esc(x.drop)}${r?' · '+esc(r.name):''}${x.cod?' · collect '+money(x.cod,x.cur):''}</small></div>${pill(...this.st(x))}`},
  listActions:()=>'<a class="btn ghost" href="#/m/riders">Riders and settlement</a>',
  async prefill(q,ctx){if(!q.deal)return null;const d=await Store.getDeal(q.deal);if(!d||!d.buyer)return null;const cod=d.payment&&d.payment.method==='Cash on delivery'?d.price:'';
    return{client:ctx.me.name||'',dname:d.buyer.name,dphone:d.buyer.phone,drop:d.buyer.landmark||'',cur:cur(d),cod,pin:d.buyer.pin?{lat:d.buyer.pin.lat,lng:d.buyer.pin.lng}:null,deal:d.id,note:d.title}},
  form:(x,ctx)=>fText('cl','Whose delivery is it? (client or shop, optional)',x.client||'',{max:60})+fPhone('cp','Their phone (optional)',x.cphone||'')+fText('pk','Pick up from',x.pickup||'',{max:120})+fText('dn','Deliver to (name)',x.dname||'',{max:60})+fPhone('dp','Recipient phone',x.dphone||'')+fText('dr','Drop-off place or landmark',x.drop||'',{max:120})+fMoney('fe','Delivery fee',x.fee||'',{zero:1})+fMoney('cd','Cash to collect (optional)',x.cod||'',{zero:1})+fCur('cu',x.cur)+fSelect('rd','Rider',x.rider||'',[['','Myself or not assigned'],...ctx.riders.map(r=>[r.id,r.name])])+fText('nt','Note for the rider (optional)',x.note||'',{max:140}),
  read(x){const dphone=need('dp','Enter the recipient phone.');if(!/^[0-9+() -]{5,20}$/.test(dphone))throw new FieldErr('#dp','Use digits, spaces and + only.');
    return{client:val('cl'),cphone:val('cp'),pickup:val('pk'),dname:need('dn','Enter the recipient name.'),dphone,drop:need('dr','Enter the drop-off place.'),fee:optional('fe'),cod:optional('cd'),cur:val('cu'),rider:val('rd'),note:val('nt'),pin:x.pin||null,deal:x.deal||''}},
  view(x,ctx){const r=ctx.rider(x.rider),s=this.st(x),rv=this.review(x);
    const route=x.pin?`<a class="btn ghost" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q=${+x.pin.lat},${+x.pin.lng}">${ic('pin')} Open pin in Maps</a>`:'';
    return `<h1>${esc(x.dname)}</h1><p class="sub">${pill(...s)}${x.deal?` <a href="#/deal/${mid(x.deal)}">View the deal</a>`:''}</p>
    <div class="card"><p><b>Pick up</b> ${esc(x.pickup||'Not set')}</p><p><b>Drop-off</b> ${esc(x.drop)}</p><p><b>Recipient</b> ${esc(x.dname)}, <a href="tel:${esc(x.dphone.replace(/[^0-9+]/g,''))}">${esc(x.dphone)}</a></p>${x.client?`<p><b>For</b> ${esc(x.client)}</p>`:''}<p><b>Fee</b> ${money(x.fee,x.cur)}${x.cod?` · <b>Collect</b> ${money(x.cod,x.cur)}`:''}</p>${r?`<p><b>Rider</b> ${esc(r.name)}${r.phone?', '+esc(r.phone):''}</p>`:''}${x.note?`<p class="help">${esc(x.note)}</p>`:''}${route?`<div class="actions">${route}</div>`:''}</div>
    ${x.st==='new'?`<div class="actions noprint"><button class="btn" id="pk">Picked up, start delivery</button><button class="btn bad" id="cn">Cancel delivery</button></div>`:''}
    ${x.st==='picked'?`<form id="cf" class="card noprint" data-lock novalidate><h2>Prove the handover</h2><p class="help">Ask the recipient for their 4 digit code and enter it here.</p>${fText('cc','Code','',{max:4,mode:'numeric'})}${x.tries>=5?'<p class="err">Too many wrong codes. Reset the code, or use the options below.</p>':'<button class="btn block">Confirm delivery</button>'}</form>
      <div class="card noprint"><h2>Code for the recipient</h2><p class="help">Send the code to the recipient only. Keep it off public posts. The rider should not see it.</p><div class="actions">${waBtn(`Your delivery${x.client?' from '+x.client:''} is on the way. Give this code to the rider when you receive it: ${x.code}`,x.dphone,'Send code on WhatsApp')}<button class="btn ghost" id="rc">Make a new code</button><button class="btn ghost" id="sc">Show the code</button></div></div>
      <form id="ff" class="card noprint" data-lock novalidate><h2>Cannot deliver?</h2>${fText('wy','Reason','',{max:140})}<div class="actions"><button type="button" class="btn bad" id="fl">Mark as failed</button><button type="button" class="btn ghost" id="nc">Delivered without the code</button></div><p class="help">Both need a reason and are kept in the record for review.</p></form>`:''}
    ${x.st==='delivered'||x.st==='failed'?`<div class="card"><h2>${x.st==='failed'?'Why it failed':'Proof'}</h2>${x.why?`<p>${esc(x.why)}</p>`:''}${x.proof?`<img class="proof" src="${esc(mediaUrl(x.proof))}" alt="Photo taken at handover">`:'<p class="help">No photo.</p>'}${x.st==='delivered'&&!x.proof?`<div class="field noprint"><label for="ph">Add a photo of the handover</label><input id="ph" type="file" accept="image/*" capture="environment"></div>`:''}</div>`:''}
    ${rv?`<form id="rvf" class="card warn noprint" data-lock novalidate><h2>Review needed</h2><p class="help">Write down what was found or agreed. Until you do, this stays on your attention list and is held back from settlement.</p>${fArea('rn','Review note','',{max:140,rows:2})}<button class="btn block">Save review</button></form>`:''}
    ${x.res?`<div class="card"><h2>Review</h2><p>${esc(x.res)}</p></div>`:''}
    ${x.st==='failed'?'<div class="actions noprint"><button class="btn" id="ra">Try this delivery again</button></div>':''}
    <div class="card"><h2>History</h2>${evList(x.ev)}</div>`},
  async bind(x,ctx,again){
    const upd=async(o,m)=>{await ModStore.save('jobs',o);if(m)note(m);again()};
    const act=async(a,p,m)=>{const r=await ModStore.act('jobs',x.id,a,p);if(m)note(m);again();return r};
    tap('#pk',()=>act('pickup'));
    tap('#cn',async()=>{const w=await ask({title:'Cancel this delivery?',input:{label:'Reason',max:140},ok:'Cancel delivery',cancel:'Keep it',danger:true});if(w===null)return;if(!w)return note('Say why first.');await act('cancel',{why:w},'Cancelled')});
    submit('#cf',async()=>{if(x.tries>=5)return;const c=val('cc');if(!/^\d{4}$/.test(c))return bad('#cc','Enter the 4 digit code.');
      const r=await ModStore.act('jobs',x.id,'confirm',{code:c});note(r.ok?'Delivery confirmed':'That code is not correct.');again()});
    tap('#rc',async()=>{if(await ask({title:'Make a new code?',body:'The old code stops working and the wrong-code count starts again. Send the new code to the recipient.',ok:'Make a new code'}))await act('reset',{},'New code made')});
    tap('#sc',async()=>{if(!await ask({title:'Show the code?',body:'Only do this if the recipient cannot get their message. It is written in the history.',ok:'Show the code'}))return;await ModStore.act('jobs',x.id,'viewed');await ask({title:'Delivery code',input:{label:'Code',value:x.code,readonly:true,max:4},ok:'Done',cancel:false});again()});
    const why=async(st,label)=>{const w=val('wy');if(!w)return bad('#wy','Say why first.');await act(st==='failed'?'fail':'nocode',{why:w},'Saved')};
    tap('#fl',()=>why('failed','Failed'));tap('#nc',async()=>{if(!val('wy'))return bad('#wy','Say why first.');if(await ask({title:'Mark as delivered without the code?',body:'This is kept in the record and flagged for review.',ok:'Mark as delivered'}))await why('delivered','Delivered without code')});
    submit('#rvf',async()=>{const n=val('rn');if(!n)return bad('#rn','Write a short review note.');await upd(logEv(x,'Reviewed',{res:n}),'Review saved')});
    tap('#ra',()=>act('retry',{},'Ready for another attempt'));
    const ph=$('#ph');if(ph)ph.onchange=async()=>{try{const f=ph.files[0];if(f){await ModStore.save('jobs',logEv(x,'Photo added',{proof:await shrink(f)}));note('Photo saved');again()}}catch(z){fail(z)}}},
  csv:{head:['Created','Status','Recipient','Phone','Drop-off','Rider','Currency','Fee','Cash to collect','Settled','Reason','Review note'],row:(x,ctx)=>[new Date(x.at).toISOString(),JOB_ST[x.st][0],x.dname,x.dphone,x.drop,(ctx.rider(x.rider)||{}).name||'',x.cur,x.fee,x.cod,x.settled?'Yes':'No',x.why,x.res]}};

/* ================= Stock */
const stockLevel=x=>x.qty<=0?['Out','disputed']:x.low>0&&x.qty<=x.low?['Low','shipped']:['In stock','received'];
TOOLS.stock={title:'Stock',icon:'box',sing:'item',search:'Do you have it? Type an item',intro:'What you have right now. Answer “do you have it?” in a second and share what is available.',
  tabs:[['All',()=>true],['In stock',x=>x.qty>0],['Low',x=>x.qty>0&&x.low>0&&x.qty<=x.low],['Out',x=>x.qty<=0]],
  text:x=>[x.name,x.sku,x.cat].join(' '),
  kpi:l=>kpis([['Items',String(l.length)],['Low',String(l.filter(x=>x.qty>0&&x.low>0&&x.qty<=x.low).length)],['Out',String(l.filter(x=>x.qty<=0).length)],['Stock value',moneyList(sumBy(l,x=>Math.round(mn(x.price,x.cur)*x.qty)))]]),
  row:x=>`<div class="deal-main"><b>${esc(x.name)}</b><small>${+x.qty} ${esc(x.unit)} · ${money(x.price,x.cur)}${x.cat?' · '+esc(x.cat):''}</small></div>${pill(...stockLevel(x))}`,
  listActions:all=>all.length?'<button class="btn ghost" id="shr">Copy what is available</button>':'',
  bindList(all){on('#shr',()=>copy(TOOLS.stock.share(all),'List'))},
  form:x=>fText('nm','Item',x.name||'',{max:60})+fText('sk','Code or SKU (optional)',x.sku||'',{max:30})+fText('ct','Category (optional)',x.cat||'',{max:30})+fText('qy','Quantity in stock',x.qty||0,{type:'number',mode:'decimal'})+fText('un','Unit (for example pieces, kg, box)',x.unit||'',{max:12})+fMoney('pr','Price',x.price||'',{zero:1})+fCur('cu',x.cur)+fText('lw','Warn me when stock is at or below (optional)',x.low||'',{type:'number',mode:'decimal'}),
  read(x){const o={name:need('nm','Enter the item name.'),sku:val('sk'),cat:val('ct'),qty:optional('qy'),unit:val('un')||'pcs',price:optional('pr'),cur:val('cu'),low:optional('lw')};
    return x.mv&&o.qty!==x.qty?{...o,mv:[...x.mv,{d:Math.round((o.qty-x.qty)*1000)/1000,r:'Edited',at:Date.now()}]}:o},
  view(x){return `<h1>${esc(x.name)}</h1><p class="sub">${pill(...stockLevel(x))}${x.sku?' · '+esc(x.sku):''}</p>
    <div class="card">${kpis([['In stock',`${+x.qty} ${x.unit}`],['Price',money(x.price,x.cur)]])}<div class="actions noprint"><button class="btn ghost" id="m1">− 1</button><button class="btn ghost" id="p1">+ 1</button></div></div>
    <form id="af" class="card noprint" data-lock novalidate><h2>Change the count</h2>${fText('ad','Add or remove (use − to remove)','',{type:'number',mode:'decimal'}).replace(' min="0"','')}${fText('ar','Reason (sold, restocked, damaged)','',{max:40})}<button class="btn block">Update stock</button></form>
    <div class="card"><h2>History</h2>${x.mv.length?`<ul class="tl">${x.mv.slice().reverse().map(v=>`<li>${v.d>0?'+':''}${+v.d} ${esc(x.unit)}${v.r?' · '+esc(v.r):''}<small>${when(v.at)}</small></li>`).join('')}</ul>`:'<p class="help">No changes yet.</p>'}</div>`},
  bind(x,ctx,again){
    const adj=async(d,r)=>{const q=Math.round((x.qty+d)*1000)/1000;if(q<0)return note('You cannot go below 0.');await ModStore.save('stock',{...x,qty:q,mv:[...x.mv,{d,r,at:Date.now()}]});again()};
    tap('#m1',()=>adj(-1,'Quick change'));tap('#p1',()=>adj(1,'Quick change'));
    submit('#af',async()=>{const d=Number(val('ad'));if(!val('ad')||!Number.isFinite(d)||d===0)return bad('#ad','Enter a number above or below 0.');if(x.qty+d<0)return bad('#ad','You cannot go below 0.');await adj(d,val('ar'))})},
  share(l){const g={};l.filter(x=>x.qty>0).forEach(x=>(g[x.cat||'Available']=g[x.cat||'Available']||[]).push(x));return Object.entries(g).map(([k,v])=>k+'\n'+v.map(x=>`• ${x.name}, ${money(x.price,x.cur)}`).join('\n')).join('\n\n')||'Nothing in stock right now.'},
  csv:{head:['Item','SKU','Category','Quantity','Unit','Currency','Price','Low-stock level'],row:x=>[x.name,x.sku,x.cat,x.qty,x.unit,x.cur,x.price,x.low]}};

/* ================= Group orders */
const GRP_ST={open:['Open','agreed'],ordered:['Ordered','shipped'],delivered:['Delivered','received'],closed:['Closed','cancelled']};
const grpDue=x=>Calc.split(x),grpPaid=x=>x.mem.reduce((u,m)=>u+mn(m.paid,x.cur),0),grpTotal=x=>mn(x.total,x.cur)+(x.mem.length?mn(x.fee,x.cur):0);
TOOLS.groups={title:'Group orders',icon:'users',sing:'group order',search:'Search group orders',intro:'Pool an order, split the bill and delivery fairly, and see who has paid.',
  st:x=>GRP_ST[x.st],tabs:[['Active',x=>x.st!=='closed'],['Closed',x=>x.st==='closed'],['All',()=>true]],text:x=>[x.title,x.note].join(' '),
  kpi:l=>kpis([['Open',String(l.filter(x=>x.st==='open').length)],['Ordered',String(l.filter(x=>x.st==='ordered').length)],['Still to collect',moneyList(sumBy(l.filter(x=>x.st!=='closed'),x=>Math.max(0,grpTotal(x)-grpPaid(x))))]]),
  row:x=>`<div class="deal-main"><b>${esc(x.title)}</b><small>${x.mem.length} ${x.mem.length===1?'person':'people'} · ${fmM(grpPaid(x),x.cur)} of ${fmM(grpTotal(x),x.cur)} paid${x.deadline?' · join by '+dt(x.deadline):''}</small></div>${pill(...GRP_ST[x.st])}`,
  form:x=>fText('ti','What are you ordering?',x.title||'',{max:80})+fText('nt','Note (supplier, pick-up point)',x.note||'',{max:140})+fCur('cu',x.cur)+fMoney('to','Total bill from the supplier',x.total||'',{zero:1})+fMoney('fe','Delivery fee (split equally)',x.fee||'',{zero:1})+fSelect('sp','Split the bill',x.split||'qty',[['qty','By quantity ordered'],['equal','Equally']])+fDate('dl','Join by (optional)',x.deadline||''),
  read(x){const cu=val('cu');if(x.mem&&x.mem.some(m=>m.paid>0)&&cu!==x.cur)throw new FieldErr('#cu','The currency cannot change after payments were recorded.');return{title:need('ti','Enter what you are ordering.'),note:val('nt'),cur:cu,total:optional('to'),fee:optional('fe'),split:val('sp'),deadline:val('dl')}},
  view(x){const due=grpDue(x),paid=grpPaid(x);return `<h1>${esc(x.title)}</h1><p class="sub">${pill(...GRP_ST[x.st])}${x.note?' · '+esc(x.note):''}</p>
    <div class="card">${kpis([['Bill',money(x.total,x.cur)],['Delivery',money(x.fee,x.cur)],['People',String(x.mem.length)],['Paid',fmM(paid,x.cur)+' of '+fmM(grpTotal(x),x.cur)]])}</div>
    ${x.st!=='closed'?`<form id="mf2" class="card noprint" data-lock novalidate><h2>Add a person</h2>${fText('mn','Name','',{max:60})}${fPhone('mp','Phone (optional)','')}${fText('mq','Quantity','1',{type:'number',mode:'decimal'})}<button class="btn block">Add</button></form>`:''}
    <div class="card"><h2>Who pays what</h2>${x.mem.length?x.mem.map((m,i)=>`<div class="mrow"><div><b>${esc(m.n)}</b><small>${+m.q} ordered · owes ${fmM(due[i],x.cur)}${mn(m.paid,x.cur)>=due[i]?' · paid in full':''}</small></div><div class="field"><label class="sr-only" for="pp${i}">Paid by ${esc(m.n)}</label><input id="pp${i}" class="pp" type="number" inputmode="decimal" min="0" step="any" value="${m.paid||''}" data-i="${i}"></div><div class="mbtns noprint"><button type="button" class="btn ghost pd" data-i="${i}" aria-label="Mark ${esc(m.n)} as paid in full">Paid</button><button type="button" class="btn ghost rm" data-i="${i}" aria-label="Remove ${esc(m.n)}">Remove</button></div></div>`).join(''):'<p class="help">Add the people in this order.</p>'}${x.mem.length?'<div class="actions noprint"><button class="btn" id="sv">Save payments</button></div>':''}</div>
    <div class="card noprint">${fSelect('ss','Status',x.st,Object.entries(GRP_ST).map(([k,v])=>[k,v[0]]))}</div>
    ${x.mem.length?`<div class="actions noprint">${waBtn(this.msg(x,due),'','Share the breakdown on WhatsApp')}</div>`:''}`},
  msg(x,due){return `${x.title}\n`+x.mem.map((m,i)=>`${m.n}: ${fmM(due[i],x.cur)}${mn(m.paid,x.cur)>=due[i]?' (paid)':''}`).join('\n')+`\nTotal ${fmM(grpTotal(x),x.cur)}`},
  bind(x,ctx,again){
    submit('#mf2',async()=>{const n=val('mn');if(!n)return bad('#mn','Enter a name.');const q=Number(val('mq'));if(!(q>=0))return bad('#mq','Enter the quantity, 0 or more.');
      if(x.mem.length>=200)return note('A group order can have up to 200 people.');await ModStore.save('groups',{...x,mem:[...x.mem,{n,ph:val('mp'),q,paid:0}]});again()});
    tap('#sv',async()=>{const mem=x.mem.map(m=>({...m}));let bad_=null;$$('.pp').forEach(i=>{const v=i.value===''?0:Number(i.value);if(!Number.isFinite(v)||v<0)bad_=i;else mem[+i.dataset.i].paid=v});if(bad_)return bad(bad_,'Enter an amount, 0 or more.');await ModStore.save('groups',{...x,mem});note('Saved');again()});
    $$('.pd').forEach(b=>b.onclick=async()=>{const mem=x.mem.map(m=>({...m})),i=+b.dataset.i;mem[i].paid=mj(grpDue(x)[i],x.cur);b.disabled=true;try{await ModStore.save('groups',{...x,mem});again()}catch(z){fail(z);b.disabled=false}});
    $$('.rm').forEach(b=>b.onclick=async()=>{const i=+b.dataset.i;if(!await ask({title:`Remove ${x.mem[i].n}?`,body:'Their share is spread across the others.',ok:'Remove',danger:true}))return;await ModStore.save('groups',{...x,mem:x.mem.filter((_,j)=>j!==i)});again()});
    const s=$('#ss');if(s)s.onchange=async()=>{try{await ModStore.save('groups',{...x,st:s.value});again()}catch(z){fail(z);s.value=x.st}}},
  csv:{head:['Order','Status','Currency','Bill','Delivery fee','Person','Phone','Quantity','Owes','Paid'],rows:x=>{const due=grpDue(x);return x.mem.map((m,i)=>[x.title,GRP_ST[x.st][0],x.cur,x.total,x.fee,m.n,m.ph,m.q,mj(due[i],x.cur),m.paid])}}};
