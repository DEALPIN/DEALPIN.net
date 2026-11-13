/* Needs js/constants.js. Same async methods as LocalStore, backed by Supabase REST + SQL functions + Storage (see supabase/schema.sql and storage.sql).
   The server makes the rules: this file only asks. Photos and voice notes are uploaded to Storage and the deal keeps the file path. */
const SupabaseStore=(()=>{
  const C=()=>window.DEALPIN||{};
  const hex=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return [...a].map(b=>b.toString(16).padStart(2,'0')).join('')};
  const uid=()=>{let s='';while(s.length<10){const a=new Uint8Array(16);crypto.getRandomValues(a);for(const b of a)if(b<252&&s.length<10)s+=(b%36).toString(36)}return s};
  const enc=encodeURIComponent;
  /* Every request must go to the configured https origin and carry the public key: nothing else is ever contacted. */
  const inflight=new Map();
  const fetchE=async(u,o={})=>{let b,t;
    if(o.body&&typeof o.body==='string'&&o.body.length>262144)throw new Error('The submitted data is too large.');try{b=new URL(C().url);t=new URL(u)}catch{}
    if(!b||b.protocol!=='https:'||b.username||b.password||!C().anonKey||!t||t.origin!==b.origin)throw new Error('Online services are not securely configured.');
    const method=String(o.method||'GET').toUpperCase(),safe=method==='GET'||method==='HEAD';
    const run=async()=>{let last;for(let attempt=0;attempt<(safe?2:1);attempt++){
      const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);
      try{const res=await fetch(u,{...o,signal:o.signal||ac.signal});if(safe&&attempt===0&&res.status>=500){last=new Error('Temporary server error.');continue}return res;}
      catch(e){last=e;if(!safe||o.signal||attempt>0)break;}finally{clearTimeout(timer)}}
      if(last&&last.name==='AbortError')throw new Error('The request took too long. Check your connection and try again.');
      throw new Error('No connection. Check your internet and try again.');};
    if(!safe)return run();const key=u;if(inflight.has(key))return inflight.get(key);
    const promise=run().finally(()=>inflight.delete(key));inflight.set(key,promise);return promise;};
  const hdr=async(extra)=>{const t=await Auth.token();return{apikey:C().anonKey,...(t?{Authorization:'Bearer '+t}:/^eyJ/.test(C().anonKey)?{Authorization:'Bearer '+C().anonKey}:{}),...extra}};
  const call=async(p,o={})=>{
    const r=await fetchE(C().url+p,{...o,headers:await hdr({'Content-Type':'application/json',...(o.headers||{})})});
    const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch{}
    if(!r.ok){
      if(r.status===429)throw new Error('Too many requests. Wait a minute and try again.');
      if(r.status===401||r.status===403)throw new Error(Auth.signedIn()?'You cannot do that.':'Please sign in.');
      if(j&&j.code==='23505'&&/handle/.test(j.message||''))throw new Error('That profile link name is already taken. Choose another one.');
      if(r.status===404||(j&&/^(PGRST20\d|42P01|42883)$/.test(j.code||'')))throw new Error('This part of Dealpin is not set up on the server yet. The owner needs to run the SQL files in supabase/ (see README).');
      // Only messages written by our own SQL (error code P0001) are shown as they are. Anything else is a technical error.
      throw new Error(j&&j.code==='P0001'&&j.message?j.message:'Something went wrong. Try again.')}
    return j};
  const rpc=(f,a)=>call('/rest/v1/rpc/'+f,{method:'POST',body:JSON.stringify(a)});
  /* Signed-in seller's id. Renews the session first; says why when it cannot. */
  const need=async()=>{const t=await Auth.token();
    if(!t)throw new Error(Auth.signedIn()?'No connection. Check your internet and try again.':'Please sign in.');
    const s=Session.raw();if(!s||!s.user||!s.user.id)throw new Error('Please sign in.');return s.user.id};
  const merge=r=>({...r.doc,bt:r.buyer_token,rt:r.rider_token});
  const splitRef=ref=>{ref=String(ref||'');return /^[a-z0-9]{10}[0-9a-f]{32}$/.test(ref)?{id:ref.slice(0,10),token:ref.slice(10)}:null};
  /* ---- Storage */
  const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a'};
  const toBlob=u=>{const m=/^data:([^;,]+)[^,]*;base64,(.*)$/.exec(u||'');if(!m)throw new Error('That file cannot be uploaded.');
    const bin=atob(m[2]),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:m[1]})};
  const put=async(folder,u)=>{const b=toBlob(u),ext=EXT[b.type];if(!ext)throw new Error('This phone records a sound format Dealpin cannot save. Describe the place in writing.');
    const path=folder+'/'+hex(16)+'.'+ext;
    const r=await fetchE(C().url+'/storage/v1/object/deal-media/'+path,{method:'POST',headers:await hdr({'Content-Type':b.type,'x-upsert':'false'}),body:b});
    if(!r.ok)throw new Error(r.status===413?'That file is too large.':'Could not upload the file. Try again.');return path};
  const isData=v=>typeof v==='string'&&v.startsWith('data:');
  const keyOf=async t=>{if(!(crypto&&crypto.subtle))throw new Error('This browser cannot upload files securely.');
    const raw=new Uint8Array(t.match(/../g).map(h=>parseInt(h,16)));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(b=>b.toString(16).padStart(2,'0')).join('')};
  const upPhotos=async list=>{const uid_=await need();const out=[];for(const p of list||[])out.push(isData(p)?await put('s/'+uid_,p):p);return out};
  const mediaPaths=d=>[...(d.photos||[]),d.buyer&&d.buyer.voice,d.dispute&&d.dispute.photo].filter(x=>x&&!isData(x));
  /* Deletes uploaded files. Returns false when any batch failed. */
  const removeFiles=async ps=>{ps=[...new Set(ps||[])];let ok=true;for(let i=0;i<ps.length;i+=100){const r=await fetchE(C().url+'/storage/v1/object/deal-media',{method:'DELETE',headers:await hdr({'Content-Type':'application/json'}),body:JSON.stringify({prefixes:ps.slice(i,i+100)})});if(!r.ok)ok=false}return ok};
  const api={
    mode:'supabase',
    /* Shared with the Tools adapter (js/supabase-mods.js): same checks on every request. */
    net:{rpc,need,put,removeFiles,isData},
    canDelete:d=>['created','cancelled'].includes(d.status),
    /* ---- seller (signed in) */
    async savePushSubscription(s){return rpc('save_push_subscription',{p_endpoint:s.endpoint,p_p256dh:s.p256dh,p_auth:s.auth})},
    async deletePushSubscription(e){return rpc('delete_push_subscription',{p_endpoint:e})},
    async announcements(){return call('/rest/v1/announcements?select=id,title,body,pinned,created_at&order=pinned.desc,created_at.desc&limit=20')},
    async getSeller(){const u=await need();const r=await call('/rest/v1/profiles?id=eq.'+u+'&select=name,handle,phone,pay,avatar');return r&&r[0]||{name:'',handle:'',phone:'',pay:'',avatar:''}},
    async saveSeller(s){const u=await need();await call('/rest/v1/profiles',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:u,name:s.name,handle:s.handle,phone:s.phone||'',pay:s.pay||'',...(typeof s.avatar==='string'?{avatar:s.avatar}:{})})})},
    async uploadAvatar(d){const u=await need();return put('s/'+u,d)},
    async listProducts(){const u=await need();return call('/rest/v1/products?owner=eq.'+u+'&select=id,owner,title,description,category,price,currency,photos,status,available,created,updated&order=updated.desc')},
    async listPublicProducts(){const r=await fetchE(C().url+'/rest/v1/products?status=eq.published&available=eq.true&select=id,title,description,category,price,currency,photos,status,available,created,updated&order=updated.desc',{headers:{apikey:C().anonKey}});if(!r.ok)throw new Error(r.status===404?'This part of Dealpin is not set up on the server yet. The owner needs to run the SQL files in supabase/ (see README).':'Could not load products. Try again.');return r.json()},
    async getProduct(id){DealpinInput.id(id,'product id');const u=await need();const r=await call('/rest/v1/products?id=eq.'+enc(id)+'&owner=eq.'+u+'&select=*');return r&&r[0]||null},
    async publicProduct(id){return rpc('public_product',{p_id:id})},
    async saveProduct(f,id){const owner=await need(),seller=await api.getSeller();if(!seller.name)throw new Error('Set up your seller profile before publishing products.');const photos=await upPhotos(f.photos||[]),payload={owner,title:String(f.title||'').trim().slice(0,100),description:String(f.description||'').trim().slice(0,2000),category:String(f.category||'').trim().slice(0,40),price:Number(f.price),currency:f.currency,photos,status:f.status,available:f.available!==false,updated:new Date().toISOString()};
      if(!payload.title||!(payload.price>0)||payload.price>MAX_PRICE||!/^[A-Z]{3}$/.test(payload.currency)||!['draft','published','paused'].includes(payload.status))throw new Error('Check the product name, price, currency and status.');
      if(id){await call('/rest/v1/products?id=eq.'+enc(id)+'&owner=eq.'+enc(owner),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});return api.getProduct(id)}
      payload.id=uid();payload.created=new Date().toISOString();const r=await call('/rest/v1/products',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});return r&&r[0]||payload},
    async deleteProduct(id){await need();const p=await api.getProduct(id);if(!p)return;const paths=(p.photos||[]).filter(x=>/^s\/[0-9a-f-]{32,64}\/[0-9a-f]{32}\.(jpg|png|webp)$/.test(x));if(paths.length){const r=await fetchE(C().url+'/storage/v1/object/deal-media',{method:'DELETE',headers:await hdr({'Content-Type':'application/json'}),body:JSON.stringify({prefixes:paths})});if(!r.ok)throw new Error('Could not remove product photos. The product was not deleted. Try again.')}await call('/rest/v1/products?id=eq.'+enc(id),{method:'DELETE'})},
    async listDeals(){const u=await need();return (await call('/rest/v1/deals?owner=eq.'+u+'&select=doc,buyer_token,rider_token&order=created.desc')).map(merge)},
    async getDeal(id){const u=await need();const r=await call('/rest/v1/deals?id=eq.'+enc(id)+'&owner=eq.'+u+'&select=doc,buyer_token,rider_token');return r&&r[0]?merge(r[0]):null},
    async createDeal(f){DealpinInput.json(f);DealpinInput.text(String(f.title||''),80);DealpinInput.money(f.price,'price');DealpinInput.currency(f.currency);DealpinInput.text(String(f.delivery||''),60);DealpinInput.text(String(f.terms||''),300);
      const owner=await need(),at=Date.now(),bt=hex(16),rt=hex(16);
      const deal={id:uid(),title:f.title,price:f.price,currency:f.currency,delivery:f.delivery,terms:f.terms||'',photos:await upPhotos(f.photos),status:'created',created:at,events:[{s:'created',at}],buyer:null,code:null};
      await call('/rest/v1/deals',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:deal.id,owner,buyer_token:bt,rider_token:rt,status:'created',created:new Date(at).toISOString(),doc:deal})});
      return{...deal,bt,rt}},
    async updateDeal(id,f){DealpinInput.id(id,'deal id');DealpinInput.json(f);DealpinInput.text(String(f.title||''),80);DealpinInput.money(f.price,'price');DealpinInput.currency(f.currency);DealpinInput.text(String(f.delivery||''),60);DealpinInput.text(String(f.terms||''),300);await need();return rpc('seller_act',{p_id:id,p_action:'edit',p_payload:{title:f.title,price:f.price,currency:f.currency,delivery:f.delivery,terms:f.terms,photos:await upPhotos(f.photos)}})},
    async ship(id,parcel=''){DealpinInput.id(id,'deal id');DealpinInput.text(String(parcel||''),60);await need();return rpc('seller_act',{p_id:id,p_action:'ship',p_payload:{parcel}})},
    async cancel(id){DealpinInput.id(id,'deal id');await need();return rpc('seller_act',{p_id:id,p_action:'cancel'})},
    async resolve(id){DealpinInput.id(id,'deal id');await need();return rpc('seller_act',{p_id:id,p_action:'resolve'})},
    async reply(id,text){DealpinInput.id(id,'deal id');DealpinInput.text(String(text||''),300);await need();return rpc('seller_act',{p_id:id,p_action:'reply',p_payload:{reply:text}})},
    async confirmPayment(id){DealpinInput.id(id,'deal id');await need();return rpc('seller_act',{p_id:id,p_action:'payok'})},
    async removeDeal(id){DealpinInput.id(id,'deal id');await need();await call('/rest/v1/deals?id=eq.'+enc(id),{method:'DELETE'})},
    /* ---- purchase requests. The buyer's private token travels inside the link as one string: request id (10 characters) + token (32). */
    async createProductRequest(productId,f){
      DealpinInput.id(productId,'product id');DealpinInput.json(f);DealpinInput.text(String(f.buyerName||''),60);DealpinInput.text(String(f.phone||''),24);DealpinInput.text(String(f.message||''),600);
      const qty=f.quantity===undefined||f.quantity===''?1:Number(f.quantity),offer=Number(f.offer);
      if(!Number.isInteger(qty)||qty<1||qty>999)throw new Error('Enter a quantity from 1 to 999.');
      if(!(offer>0)||offer>MAX_PRICE)throw new Error('Enter a valid offer price and quantity.');
      const r=await rpc('create_product_request',{p_product_id:productId,p_name:f.buyerName||'',p_phone:f.phone||'',p_qty:qty,p_offer:offer,p_message:f.message||''});
      return{...r,ref:r.id+r.token}},
    async listProductRequests(){await need();return rpc('seller_list_requests',{})},
    async getProductRequest(ref){const k=splitRef(ref);if(!k)return null;const r=await rpc('buyer_get_request',{p_id:k.id,p_token:k.token});return r?{...r,ref:String(ref)}:null},
    async sellerRequestAction(ref,action,pl={}){
      DealpinInput.id(ref,'request id');DealpinInput.json(pl);
      const buyerMap={buyerAccept:'accept',buyerDecline:'decline',buyerWithdraw:'withdraw'};
      if(buyerMap[action]){const k=splitRef(ref);if(!k)throw new Error('This request could not be found.');return rpc('buyer_request_act',{p_token:k.token,p_id:k.id,p_action:buyerMap[action]})}
      DealpinInput.action(action);
      await need();const body={};
      if(action==='counter'){const price=Number(pl.price);if(!(price>0)||price>MAX_PRICE)throw new Error('Enter a valid counter-offer.');body.price=price;body.message=pl.message||''}
      if(action==='decline')body.message=pl.message||'';
      return rpc('seller_request_act',{p_id:ref,p_action:action,p_payload:body})},
    async createDealFromRequest(id){
      await need();const r=(await api.listProductRequests()).find(x=>x.id===id);
      if(!r||r.status!=='accepted')throw new Error('The request must be accepted before creating a deal.');
      const deal=await api.createDeal({title:r.productTitle,price:Math.round(r.offer*r.quantity*1000)/1000,currency:r.currency,delivery:DELIVERY[0],
        terms:`Created from product request ${r.id}. Quantity: ${r.quantity}. Buyer offer: ${r.offer} per item. ${r.message||''}`.slice(0,300),photos:[]});
      await rpc('seller_request_act',{p_id:id,p_action:'convert',p_payload:{deal_id:deal.id}});return deal},
    /* ---- buyer and rider (their link token; no account) */
    buyerDeal:t=>rpc('buyer_get_deal',{p_token:t}),
    riderDeal:t=>rpc('rider_get_deal',{p_token:t}),
    async buyerAct(t,action,pl={}){
      DealpinInput.text(String(t||''),128);DealpinInput.action(action);DealpinInput.json(pl);
      pl=JSON.parse(JSON.stringify(pl));
      const dir=()=>keyOf(t).then(k=>'b/'+k);
      if(pl.buyer&&isData(pl.buyer.voice))pl.buyer.voice=await put(await dir(),pl.buyer.voice);
      if(pl.dispute&&isData(pl.dispute.photo))pl.dispute.photo=await put(await dir(),pl.dispute.photo);
      return rpc('buyer_act',{p_token:t,p_action:action,p_payload:pl})},
    async riderAct(t,action,pl={}){DealpinInput.text(String(t||''),128);DealpinInput.action(action);DealpinInput.json(pl);const r=await rpc('rider_act',{p_token:t,p_action:action,p_payload:pl});if(r&&r.error)throw new Error(r.error);return r},
    /* ---- public */
    getReceipt:id=>rpc('public_receipt',{p_id:id}),
    publicSeller:h=>rpc('public_seller',{p_handle:h}),
    myTrust:()=>rpc('my_trust'),
    productTrust:ids=>ids.length?rpc('public_product_trust',{p_ids:ids.slice(0,60)}).catch(()=>({})):Promise.resolve({}),
    verify:c=>rpc('public_verify',{p_code:c}),
    /* ---- Business Autopilot: all capabilities are available to every authenticated workspace. */
    async autopilotList(type=null){
      if(type!=null)DealpinInput.text(String(type),40);await need();
      // Fetch bounded pages so a growing workspace never depends on one unbounded JSON response.
      // The returned value stays the same array shape used by the existing UI.
      const all=[];let offset=0;const pageSize=500;
      for(let page=0;page<100;page++){
        const r=await rpc('autopilot_list_page',{p_type:type,p_limit:pageSize,p_offset:offset});
        const items=Array.isArray(r?.items)?r.items:[];all.push(...items);
        if(!r?.has_more||items.length===0)break;offset+=items.length;
      }
      return all;
    },
    async autopilotSave(type,id,data,expectedUpdatedAt=null){DealpinInput.text(String(type||''),40);if(id)DealpinInput.uuid(id,'record id');DealpinInput.json(data);if(expectedUpdatedAt!=null)DealpinInput.text(String(expectedUpdatedAt),80);await need();return rpc('autopilot_save',{p_type:type,p_id:id,p_data:data,p_expected_updated_at:expectedUpdatedAt})},
    async autopilotRemove(type,id){DealpinInput.text(String(type||''),40);DealpinInput.uuid(id,'record id');await need();return rpc('autopilot_remove',{p_type:type,p_id:id})},
    async autopilotAudit(){await need();return rpc('autopilot_audit_list',{})},
    async autopilotBackup(){await need();return rpc('autopilot_backup',{})},
    async autopilotAuditExport(){await need();return rpc('autopilot_audit_export',{})},
    async autopilotInvite(email,role,branchId=null){DealpinInput.text(String(email||''),254);DealpinInput.text(String(role||''),40);if(branchId)DealpinInput.uuid(branchId,'branch id');await need();return rpc('autopilot_invite',{p_email:email,p_role:role,p_branch:branchId})},
    async autopilotAcceptInvite(token){DealpinInput.text(String(token||''),128);await need();return rpc('autopilot_accept_invite',{p_token:token})},
    async autopilotScaleProbe(){await need();return rpc('dealpin_scale_probe',{})},
    async autopilotWorkspace(){await need();return rpc('autopilot_workspace_info',{})},
    async autopilotWorkspaces(){await need();return rpc('autopilot_list_workspaces',{})},
    async autopilotSetWorkspace(id){DealpinInput.uuid(id,'workspace id');await need();return rpc('autopilot_set_workspace',{p_workspace:id})},
    async autopilotStockMovements(inventoryId=null){await need();return rpc('autopilot_stock_movements',{p_inventory_id:inventoryId})},
    async autopilotStockMove(data){DealpinInput.json(data);DealpinInput.uuid(data.inventory_id,'inventory id');DealpinInput.text(String(data.movement_type||''),40);DealpinInput.money(data.quantity,'quantity');if(data.unit_cost!=null)DealpinInput.money(data.unit_cost,'unit cost');DealpinInput.currency(data.currency||'USD');DealpinInput.text(String(data.reference||''),120);DealpinInput.text(String(data.note||''),500);await need();return rpc('autopilot_stock_move',{p_inventory_id:data.inventory_id,p_movement_type:data.movement_type,p_quantity:data.quantity,p_unit_cost:data.unit_cost??null,p_currency:data.currency||null,p_reference:data.reference||'',p_note:data.note||'',p_idempotency_key:data.idempotency_key})},
    async autopilotReceivePurchaseOrder(id){await need();return rpc('autopilot_receive_purchase_order',{p_order_id:id})},
    async autopilotStockReservations(){await need();return rpc('autopilot_stock_reservations_list',{})},
    async autopilotStockReserve(id,quantity,reference,note=''){DealpinInput.uuid(id,'inventory id');DealpinInput.money(quantity,'quantity');DealpinInput.text(String(reference||''),120);DealpinInput.text(String(note||''),500);await need();return rpc('autopilot_stock_reserve',{p_inventory_id:id,p_quantity:quantity,p_reference:reference,p_note:note})},
    async autopilotStockRelease(id){DealpinInput.uuid(id,'reservation id');await need();return rpc('autopilot_stock_release',{p_reservation_id:id})},
    async autopilotStockFulfill(id,reference=''){DealpinInput.uuid(id,'reservation id');DealpinInput.text(String(reference||''),120);await need();return rpc('autopilot_stock_fulfill',{p_reservation_id:id,p_reference:reference})},
    async autopilotStockValuation(){await need();return rpc('autopilot_stock_valuation',{})},
    /* ---- data */
    async exportAll(){return{seller:await api.getSeller(),deals:await api.listDeals(),products:await api.listProducts()}},
    importAll(){throw new Error('Restoring a backup is not available when your data is online.')},
    reset(){throw new Error('Use Delete my account to remove your online data.')},
    /* Deletes uploaded files, then the account, profile and every deal. Receipts for those deals stop working. */
    async deleteAccount(){
      await need();const ps=[...new Set((await api.listDeals()).flatMap(mediaPaths))];
      for(let i=0;i<ps.length;i+=100){const r=await fetchE(C().url+'/storage/v1/object/deal-media',{method:'DELETE',headers:await hdr({'Content-Type':'application/json'}),body:JSON.stringify({prefixes:ps.slice(i,i+100)})});
        if(!r.ok)throw new Error('Could not remove your files. Nothing was deleted. Try again.')}
      await rpc('delete_my_account',{});Session.clear()},
    stats:LocalStore.stats,value:LocalStore.value,rating:LocalStore.rating};
  return api;
})();
