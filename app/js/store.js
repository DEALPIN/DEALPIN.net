/* LocalStore: everything stays in this browser. Same async methods as SupabaseStore (js/supabase-store.js).
   Seller methods work on a deal id. Buyer and rider methods work on a token from their own link, the same way the server does:
   a buyer link cannot act as a rider and a rider link cannot see the handover code.
   Needs js/constants.js. */
const LocalStore=(()=>{
  const K='dealpin.v1';
  const blank=()=>({seller:{name:'',handle:'',phone:'',pay:''},deals:[],products:[],requests:[]});
  const hex=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return [...a].map(b=>b.toString(16).padStart(2,'0')).join('')};
  const uid=()=>{let s='';while(s.length<10){const a=new Uint8Array(16);crypto.getRandomValues(a);for(const b of a)if(b<252&&s.length<10)s+=(b%36).toString(36)}return s};
  const read=()=>{
    let d=null;try{d=JSON.parse(localStorage.getItem(K))}catch{}
    if(!d||!d.seller||!Array.isArray(d.deals))d=blank();if(!Array.isArray(d.products))d.products=[];if(!Array.isArray(d.requests))d.requests=[];
    let ch=false;for(const x of d.deals)if(!x.bt){x.bt=hex(16);x.rt=hex(16);x.legacy=true;ch=true}   // deals made before round 7: old links keep working
    if(ch)try{localStorage.setItem(K,JSON.stringify(d))}catch{}
    return d};
  const write=d=>{try{localStorage.setItem(K,JSON.stringify(d))}catch{throw new Error('Storage is full. Delete old deals and try again.')}};
  const NOPE='That step is not allowed for this deal.';
  const no=()=>{throw new Error(NOPE)};
  const clean=(t,n)=>String(t==null?'':t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n);
  const rnd4=()=>String(1000+crypto.getRandomValues(new Uint32Array(1))[0]%9000);
  const hav=(a,b,c,d)=>{const r=x=>x*Math.PI/180,h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return Math.round(12742000*Math.asin(Math.sqrt(h)))};
  const num=(v,lo,hi)=>{const n=typeof v==='number'?v:/^-?\d{1,3}(\.\d+)?$/.test(String(v))?+v:NaN;return n>=lo&&n<=hi?n:null};
  const media=v=>{v=v?String(v):'';return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(v)||/^data:audio\/(?:webm|ogg|mp4);base64,[A-Za-z0-9+/]+=*$/.test(v)?v:null};
  const ALLPAY=[...PAYMENTS,...LEGACY_PAYMENTS];
  /* What a seller may write on a deal: item, price, currency, delivery, terms, photos. Same rules as check_terms() on the server. */
  const terms=f=>{
    const title=clean(f.title,80),price=Number(f.price),cur=String(f.currency||''),t=clean(f.terms,300);
    if(!title)throw new Error('Enter what you are selling (up to 80 characters).');
    if(!(price>0)||price>MAX_PRICE||Math.round(price*1000)/1000!==price)throw new Error('Enter a price above 0.');
    if(!/^[A-Z]{3}$/.test(cur))throw new Error('Pick a currency.');
    if(!DELIVERY.includes(f.delivery))throw new Error('Pick a delivery type.');
    const photos=(f.photos||[]).map(media).filter(Boolean).slice(0,MAX_PHOTOS);
    return{title,price,currency:cur,delivery:f.delivery,terms:t,photos}};
  const strip=d=>{const{bt,rt,legacy,...r}=d;return r};
  const pub=d=>({id:d.id,title:d.title,price:d.price,currency:d.currency,delivery:d.delivery,status:d.status,created:d.created,events:d.events,code:d.code||null,
    buyer:d.buyer?{name:d.buyer.name}:null,seller:{name:(d.seller||{}).name,handle:(d.seller||{}).handle},
    payment:d.payment?{method:d.payment.method,ok:!!d.payment.ok}:null,rating:d.rating?{stars:d.rating.stars}:null});
  const rider=d=>({id:d.id,title:d.title,status:d.status,delivery:d.delivery,
    buyer:d.buyer?{name:d.buyer.name,phone:d.buyer.phone,pin:d.buyer.pin,landmark:d.buyer.landmark,voice:d.buyer.voice}:null,
    arrival:d.arrival||null,handoverOk:!!d.handoverOk,needsHandover:!!d.handover});
  async function sign(d){
    if(!(window.crypto&&crypto.subtle))return 'UNSIGNED';
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([d.id,d.title,d.price,d.currency,d.buyer&&d.buyer.name,d.events])));
    const h=[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    return `${h.slice(0,4)}-${h.slice(4,8)}-${h.slice(8,12)}`;
  }
  const mine=(d,id)=>{const x=d.deals.find(y=>y.id===id);if(!x)throw new Error('Deal not found.');return x};
  const step=(x,st,ev)=>{x.status=st;x.events.push({s:ev||st,at:Date.now()})};
  const byBuyer=(d,t)=>d.deals.find(y=>y.bt===t||(y.legacy&&y.id===t));
  const byRider=(d,t)=>d.deals.find(y=>y.rt===t||(y.legacy&&y.id===t));
  /* A backup file is untrusted text: rebuild every deal from known fields and drop everything else. */
  const str=(v,n)=>typeof v==='string'?clean(v,n):'';
  const finite=(v,lo,hi,d=0)=>{const n=Number(v);return Number.isFinite(n)&&n>=lo&&n<=hi?n:d};
  const cleanDeal=x=>{
    if(!x||typeof x!=='object'||!/^\w{4,32}$/.test(String(x.id))||!STATUSES.includes(x.status)||!Array.isArray(x.events)||!(Number(x.price)>0))throw new Error('That file is not a Dealpin backup.');
    const o=x.buyer&&typeof x.buyer==='object'?x.buyer:null,p=o&&o.pin&&typeof o.pin==='object'?o.pin:null;
    const d={id:String(x.id),title:str(x.title,80),price:finite(x.price,0,MAX_PRICE),currency:/^[A-Z]{3}$/.test(x.currency)?x.currency:'',
      delivery:DELIVERY.includes(x.delivery)?x.delivery:DELIVERY[1],terms:str(x.terms,300),photos:(Array.isArray(x.photos)?x.photos:[]).map(media).filter(Boolean).slice(0,MAX_PHOTOS),
      status:x.status,created:finite(x.created,0,8.64e15,Date.now()),
      events:x.events.slice(0,60).filter(e=>e&&typeof e.s==='string').map(e=>({s:str(e.s,20),at:finite(e.at,0,8.64e15)})),
      seller:{name:str(x.seller&&x.seller.name,40),handle:/^[a-z0-9-]{1,24}$/.test(x.seller&&x.seller.handle)?x.seller.handle:'',phone:str(x.seller&&x.seller.phone,30),pay:str(x.seller&&x.seller.pay,80)},
      buyer:o?{name:str(o.name,60),phone:str(o.phone,20),landmark:str(o.landmark,200),voice:media(o.voice),pin:p?{lat:finite(p.lat,-90,90),lng:finite(p.lng,-180,180),acc:finite(p.acc,0,1e5)}:null}:null,
      code:/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(x.code)?x.code:null,
      bt:/^[0-9a-f]{32}$/.test(x.bt)?x.bt:hex(16),rt:/^[0-9a-f]{32}$/.test(x.rt)?x.rt:hex(16)};
    if(x.legacy)d.legacy=true;
    if(x.payment&&ALLPAY.includes(x.payment.method))d.payment={method:x.payment.method,ref:str(x.payment.ref,40),ok:!!x.payment.ok,at:finite(x.payment.at,0,8.64e15)};
    if(x.rating&&Number.isInteger(x.rating.stars)&&x.rating.stars>=1&&x.rating.stars<=5)d.rating={stars:x.rating.stars,text:str(x.rating.text,200)};
    if(x.dispute&&typeof x.dispute==='object')d.dispute={why:str(x.dispute.why,300),photo:media(x.dispute.photo),reply:str(x.dispute.reply,300)||undefined};
    if(x.arrival&&typeof x.arrival==='object')d.arrival={lat:finite(x.arrival.lat,-90,90),lng:finite(x.arrival.lng,-180,180),acc:finite(x.arrival.acc,0,1e5),dist:x.arrival.dist==null?null:finite(x.arrival.dist,0,2e7),at:finite(x.arrival.at,0,8.64e15)};
    d.parcel=str(x.parcel,60);d.handover=/^\d{4}$/.test(x.handover)?x.handover:'';d.handoverOk=!!x.handoverOk;
    return d};
  return{
    mode:'local',
    canDelete:()=>true,
    /* ---- seller */
    async getSeller(){return{...blank().seller,...read().seller}},
    async saveSeller(s){
      const name=clean(s.name,40),handle=clean(s.handle,24);
      if(!name)throw new Error('Enter your name or shop name.');
      if(!/^[a-z0-9-]{1,24}$/.test(handle))throw new Error('The profile link name can use lowercase letters, numbers and dashes only.');
      const d=read();d.seller={name,handle,phone:clean(s.phone,30),pay:clean(s.pay,80)};write(d)},
    async listProducts(){return read().products.slice().sort((a,b)=>b.updated-a.updated)},
    async getProduct(id){return read().products.find(x=>x.id===id)||null},
    async publicProduct(id){const d=read(),x=d.products.find(y=>y.id===id);return x&&x.status==='published'&&x.available?{...x,seller:{name:d.seller.name,handle:d.seller.handle}}:null},
    async listPublicProducts(){return read().products.filter(x=>x.status==='published'&&x.available).sort((a,b)=>b.updated-a.updated)},
    async saveProduct(f,id){const d=read(),old=id?d.products.find(x=>x.id===id):null;if(!d.seller.name)throw new Error('Set up your seller profile before publishing products.');if(id&&!old)throw new Error('Product not found.');
      const title=clean(f.title,100),description=clean(f.description,2000),category=clean(f.category,40),price=Number(f.price),currency=String(f.currency||''),status=['draft','published','paused'].includes(f.status)?f.status:'draft';
      if(!title)throw new Error('Enter a product name.');if(!(price>0)||price>MAX_PRICE||Math.round(price*1000)/1000!==price)throw new Error('Enter a valid price above 0.');if(!/^[A-Z]{3}$/.test(currency))throw new Error('Choose a currency.');
      const photos=(f.photos||[]).filter(x=>media(x)||/^s\//.test(x)).slice(0,5);const at=Date.now(),x={id:old?old.id:uid(),title,description,category,price,currency,photos,status,available:f.available!==false,created:old?old.created:at,updated:at};
      if(old)Object.assign(old,x);else d.products.push(x);write(d);return x},
    async deleteProduct(id){const d=read(),i=d.products.findIndex(x=>x.id===id);if(i<0)throw new Error('Product not found.');d.products.splice(i,1);write(d)},
    async createProductRequest(productId,f){
      const d=read(),p=d.products.find(x=>x.id===productId&&x.status==='published'&&x.available);
      if(!p)throw new Error('This product is no longer available.');
      const buyerName=clean(f.buyerName,60),phone=clean(f.phone,24),message=clean(f.message,600),qty=f.quantity===undefined||f.quantity===''?1:Number(f.quantity),offer=Number(f.offer||p.price);
      if(!buyerName)throw new Error('Enter your name.');
      if(!/^[0-9+() -]{5,24}$/.test(phone))throw new Error('Enter a valid contact number.');
      if(!Number.isInteger(qty)||qty<1||qty>999)throw new Error('Enter a quantity from 1 to 999.');
      if(!(offer>0)||offer>MAX_PRICE||Math.round(offer*1000)/1000!==offer||offer*qty>MAX_PRICE)throw new Error('Enter a valid offer price and quantity.');
      const at=Date.now(),r={id:uid(),productId:p.id,productTitle:p.title,productPrice:p.price,currency:p.currency,quantity:qty,offer,buyerName,phone,message,status:'pending',created:at,updated:at,history:[{status:'pending',at,message:'Request submitted'}],counter:null,dealId:null};
      d.requests=d.requests||[];d.requests.push(r);write(d);return{...r,ref:r.id};
    },
    async listProductRequests(){const d=read();return (d.requests||[]).slice().sort((a,b)=>b.updated-a.updated)},
    async getProductRequest(id){const d=read();return (d.requests||[]).find(x=>x.id===id)||null},
    async sellerRequestAction(id,action,payload={}){
      const d=read(),r=(d.requests||[]).find(x=>x.id===id);if(!r)throw new Error('Request not found.');
      if(!['pending','countered'].includes(r.status))throw new Error('This request is already closed.');
      const at=Date.now();
      if(action==='accept'){r.status='accepted';r.offer=r.counter&&r.counter.price||r.offer;r.counter=null;r.history.push({status:r.status,at,message:'Seller accepted the request'});}
      else if(action==='decline'){r.status='declined';r.history.push({status:r.status,at,message:clean(payload.message,300)||'Seller declined the request'});}
      else if(action==='counter'){const price=Number(payload.price),message=clean(payload.message,300);if(!(price>0)||price>MAX_PRICE||Math.round(price*1000)/1000!==price||price*r.quantity>MAX_PRICE)throw new Error('Enter a valid counter-offer.');r.counter={price,message,at};r.status='countered';r.history.push({status:r.status,at,message:message||'Seller made a counter-offer',price});}
      else if(action==='buyerAccept'&&r.status==='countered'){r.offer=r.counter.price;r.status='accepted';r.history.push({status:r.status,at,message:'Buyer accepted the counter-offer'});r.counter=null;}
      else if(action==='buyerWithdraw'){r.status='declined';r.history.push({status:r.status,at,message:'Buyer withdrew the request'});r.counter=null;}
      else if(action==='buyerDecline'&&r.status==='countered'){r.status='declined';r.history.push({status:r.status,at,message:'Buyer declined the counter-offer'});r.counter=null;}
      else throw new Error('That action is not available.');
      r.updated=at;write(d);return r;
    },
    async createDealFromRequest(id){
      const d=read(),r=(d.requests||[]).find(x=>x.id===id);if(!r||r.status!=='accepted')throw new Error('The request must be accepted before creating a deal.');if(r.dealId)throw new Error('A deal has already been created for this request.');
      const seller=d.seller;if(!seller.name)throw new Error('Set up the seller profile first.');
      const at=Date.now(),deal={id:uid(),bt:hex(16),rt:hex(16),title:r.productTitle,price:r.offer*r.quantity,currency:r.currency,delivery:DELIVERY[0],terms:`Created from product request ${r.id}. Quantity: ${r.quantity}. Buyer offer: ${r.offer} per item. ${r.message||''}`.slice(0,300),photos:[],seller:{name:seller.name,handle:seller.handle,phone:seller.phone||'',pay:seller.pay||''},status:'created',created:at,events:[{s:'created',at}],buyer:null,code:null,requestId:r.id};
      d.deals.push(deal);r.dealId=deal.id;r.status='converted';r.updated=at;r.history.push({status:'converted',at,message:'Converted into a Dealpin deal',dealId:deal.id});write(d);return deal;
    },
    async listDeals(){return read().deals.sort((a,b)=>b.created-a.created)},
    async getDeal(id){return read().deals.find(x=>x.id===id)||null},
    async createDeal(f){
      const d=read(),at=Date.now(),t=terms(f),s=d.seller;
      if(!s.name)throw new Error('Set up your seller profile first.');
      const deal={id:uid(),bt:hex(16),rt:hex(16),...t,seller:{name:s.name,handle:s.handle,phone:s.phone||'',pay:s.pay||''},status:'created',created:at,events:[{s:'created',at}],buyer:null,code:null};
      d.deals.push(deal);write(d);return deal;
    },
    async updateDeal(id,f){
      const d=read(),x=mine(d,id);
      if(x.status!=='created')throw new Error('Only deals waiting for a buyer can be edited.');
      Object.assign(x,terms(f));write(d);return x;
    },
    async ship(id,parcel=''){const d=read(),x=mine(d,id);if(x.status!=='agreed')no();
      x.parcel=clean(parcel,60);x.handover=x.delivery===DELIVERY[0]?rnd4():'';step(x,'shipped');write(d);return x},
    async cancel(id){const d=read(),x=mine(d,id);if(!['created','agreed'].includes(x.status))no();step(x,'cancelled');write(d);return x},
    async resolve(id){const d=read(),x=mine(d,id);if(x.status!=='disputed')no();step(x,'resolved');write(d);return x},
    async reply(id,text){const d=read(),x=mine(d,id),t=clean(text,300);
      if(x.status!=='disputed'||!x.dispute)no();if(!t)throw new Error('Write your reply first.');
      x.dispute.reply=t;x.events.push({s:'replied',at:Date.now()});write(d);return x},
    async confirmPayment(id){const d=read(),x=mine(d,id);
      if(!x.payment||x.payment.ok||!['agreed','shipped'].includes(x.status))no();
      x.payment.ok=true;x.events.push({s:'payok',at:Date.now()});write(d);return x},
    removeDeal(id){const d=read();d.deals=d.deals.filter(x=>x.id!==id);write(d)},
    /* ---- buyer (link token) */
    async buyerDeal(t){const x=byBuyer(read(),t);return x?strip(x):null},
    async buyerAct(t,action,pl={}){
      const d=read(),x=byBuyer(d,t);if(!x)throw new Error('Deal not found.');
      let st=x.status,ev=action;
      if(action==='agree'&&st==='created'){
        const b=pl.buyer||{},name=clean(b.name,60),phone=clean(b.phone,20),landmark=clean(b.landmark,200);
        if(!name||!phone)throw new Error('Enter your name and phone number.');
        if(!/^[0-9+() -]{5,20}$/.test(phone))throw new Error('Enter a valid phone number.');
        let pin=null;if(b.pin){const la=num(b.pin.lat,-90,90),lo=num(b.pin.lng,-180,180);if(la==null||lo==null)throw new Error('That location is not valid.');pin={lat:la,lng:lo,acc:Math.max(0,Math.min(1e5,Math.round(+b.pin.acc)||0))}}
        const voice=media(b.voice);
        if(x.delivery===DELIVERY[0]&&!pin&&!landmark&&!voice)throw new Error('Share your location or describe the place.');
        if(x.delivery===DELIVERY[2]&&!landmark)throw new Error('Enter the town and the bus park or courier office.');
        x.buyer={name,phone,pin,landmark,voice};st='agreed';ev='agreed';
      }else if(action==='paid'&&['agreed','shipped'].includes(st)&&!x.payment){
        const p=pl.payment||{};if(!PAYMENTS.includes(p.method))throw new Error('Pick how you paid.');
        x.payment={method:p.method,ref:clean(p.ref,40),ok:false,at:Date.now()};
      }else if(action==='receive'&&st==='shipped'){st='received';ev='received';
      }else if(action==='dispute'&&st==='shipped'){
        const p=pl.dispute||{},why=clean(p.why,300);if(!why)throw new Error('Please say what is wrong.');
        x.dispute={why,photo:media(p.photo)};st='disputed';ev='disputed';
      }else if(action==='rated'&&st==='received'&&!x.rating){
        const r=pl.rating||{},s=+r.stars;if(!(s>=1&&s<=5&&Number.isInteger(s)))throw new Error('Pick 1 to 5 stars.');
        x.rating={stars:s,text:clean(r.text,200)};
      }else no();
      step(x,st,ev);if(action==='receive')x.code=await sign(x);
      write(d);return strip(x);
    },
    /* ---- rider (link token) */
    async riderDeal(t){const x=byRider(read(),t);return x?rider(x):null},
    async riderAct(t,action,pl={}){
      const d=read(),x=byRider(d,t);if(!x)throw new Error('Deal not found.');
      if(x.status!=='shipped')no();
      if(action==='arrived'&&!x.arrival){
        const la=num(pl.arrival&&pl.arrival.lat,-90,90),lo=num(pl.arrival&&pl.arrival.lng,-180,180);
        if(la==null||lo==null)throw new Error('Your location is not valid.');
        const p=x.buyer&&x.buyer.pin;
        x.arrival={lat:la,lng:lo,acc:Math.max(0,Math.min(1e5,Math.round(+pl.arrival.acc)||0)),dist:p?hav(p.lat,p.lng,la,lo):null,at:Date.now()};
        x.events.push({s:'arrived',at:Date.now()});
      }else if(action==='handover'&&x.handover&&!x.handoverOk){
        if(x.handover!==String(pl.handoverCode||''))throw new Error('That code is not correct.');
        x.handoverOk=true;x.events.push({s:'handover',at:Date.now()});
      }else no();
      write(d);return rider(x);
    },
    /* ---- public */
    async getReceipt(id){const x=read().deals.find(y=>y.id===id);return x?pub(x):null},
    async publicSeller(h){const d=read();return d.seller.handle&&d.seller.handle===h?{seller:{name:d.seller.name,handle:d.seller.handle},deals:d.deals.filter(x=>['received','disputed','resolved'].includes(x.status)).sort((a,b)=>b.created-a.created).map(pub)}:null},
    async verify(c){const k=String(c||'').trim().toUpperCase();const x=k?read().deals.find(y=>y.code===k):null;return x?pub(x):null},
    /* ---- data on this device */
    stats(ds){
      const n=s=>ds.filter(d=>d.status===s).length;
      return{verified:n('received'),disputed:n('disputed'),active:n('created')+n('agreed')+n('shipped'),awaiting:n('created')};
    },
    /* Value of verified deals, per currency (amounts in different currencies are never added together). */
    value(ds){const m={};for(const d of ds)if(d.status==='received'&&d.currency)m[d.currency]=Math.round(((m[d.currency]||0)+Number(d.price))*1000)/1000;return m},
    rating(ds){const r=ds.filter(d=>d.rating).map(d=>d.rating.stars);return{n:r.length,avg:r.length?Math.round(r.reduce((a,b)=>a+b,0)/r.length*10)/10:0}},
    exportAll(){return read()},
    importAll(o,dry){   // dry=true only checks the file
      if(!o||typeof o!=='object'||!o.seller||typeof o.seller!=='object'||!Array.isArray(o.deals))throw new Error('That file is not a Dealpin backup.');
      const s=o.seller,handle=/^[a-z0-9-]{1,24}$/.test(s.handle)?s.handle:'';
      const out={seller:{name:str(s.name,40),handle,phone:str(s.phone,30),pay:str(s.pay,80)},deals:o.deals.slice(0,5000).map(cleanDeal)};
      if(!dry)write(out)},
    reset(){localStorage.removeItem(K)}
  };
})();
