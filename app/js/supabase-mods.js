/* Online Tools data (RemoteModStore). Needs js/supabase-store.js. Same async methods as LocalModStore (js/mods-core.js)
   and passes the same tests/contract-suite.js. The server (supabase/phase-five-tools-sync.sql) makes every rule:
   it normalises the fields, counts revisions, refuses stale saves and caps the records. This file only asks.
   Proof photos are uploaded to Storage first and the record keeps the file path. */
const RemoteModStore=(()=>{
  const N=()=>SupabaseStore.net;
  const imageKeys=col=>{const sp=LocalModStore.SP[col]||[];return sp.filter(f=>f.t==='i').map(f=>f.k)};
  /* Uploads any picture still held as a data address and swaps in its storage path. A picture that cannot be uploaded is dropped. */
  const upload=async(col,obj,done,uid)=>{if(!obj||typeof obj!=='object')return obj;const out={...obj};
    for(const k of imageKeys(col)){const v=out[k];if(N().isData(v)){out[k]=/^data:image\/jpeg;/.test(v)?await N().put('s/'+uid,v):'';if(out[k])done.push(out[k])}}
    return out};
  const prepOps=async(ops,done)=>{const uid=await N().need();const out=[];
    for(const op of ops){if(op&&op.op==='save'&&op.obj)out.push({...op,obj:await upload(op.col,op.obj,done,uid)});else out.push(op)}return out};
  const tidy=ps=>{ps=(ps||[]).filter(Boolean);if(ps.length)N().removeFiles(ps).catch(()=>{})};   // best effort: a leftover file is harmless and is removed with the account
  const cols=()=>MOD_COLLECTIONS;
  return{
    where:'online',
    get SP(){return LocalModStore.SP},
    async list(col){await N().need();return N().rpc('mod_list',{p_col:col})},
    async get(col,id){await N().need();return N().rpc('mod_get',{p_col:col,p_id:String(id||'')})},
    async save(col,o){return(await this.batch([{op:'save',col,obj:o}]))[0]},
    async del(col,id){await this.batch([{op:'del',col,id}])},
    /* Several writes that succeed or fail together: [{op:'save',col,obj}|{op:'del',col,id}] */
    async batch(ops){if(!Array.isArray(ops))throw new Error('Unknown record type.');
      const done=[];let r;
      try{r=await N().rpc('mod_apply',{p_ops:await prepOps(ops,done)})}catch(e){tidy(done);throw e}
      tidy(r.gone);return r.items},
    async act(col,id,action,p){await N().need();const r=await N().rpc('mod_act',{p_col:col,p_id:String(id||''),p_action:action,p_payload:p||{}});return{record:r.item,ok:r.ok}},
    async export(){await N().need();return N().rpc('mod_export',{})},
    /* Replaces everything online. dry=true only checks the file. */
    async import(o,dry){
      if(o==null)return;if(typeof o!=='object'||Array.isArray(o))throw new Error('That file is not a Dealpin backup.');
      await N().need();if(dry){await N().rpc('mod_import',{p_data:o,p_dry:true,p_merge:false});return}
      const done=[],uid=await N().need(),before=await N().rpc('mod_files',{}),data={};
      try{for(const c of cols()){if(Array.isArray(o[c])){data[c]=[];for(const x of o[c])data[c].push(await upload(c,x,done,uid))}else if(o[c]!=null)data[c]=o[c]}
        await N().rpc('mod_import',{p_data:data,p_dry:false,p_merge:false})}catch(e){tidy(done);throw e}
      const keep=new Set(await N().rpc('mod_files',{}));tidy([...before,...done].filter(x=>!keep.has(x)))},
    /* Adds records from this device that are not online yet. Never removes or replaces anything. Returns how many were added. */
    async adopt(o){
      if(o==null||typeof o!=='object'||Array.isArray(o))return 0;
      const done=[],uid=await N().need(),data={};let r;
      try{for(const c of cols()){if(Array.isArray(o[c])){data[c]=[];for(const x of o[c])data[c].push(await upload(c,x,done,uid))}}
        r=await N().rpc('mod_import',{p_data:data,p_dry:false,p_merge:true})}catch(e){tidy(done);throw e}
      if(done.length){const keep=new Set(await N().rpc('mod_files',{}));tidy(done.filter(x=>!keep.has(x)))}   // photos of records that were skipped
      return r.count},
    /* Removes proof photos from Storage (used before the account is deleted: the records go with the account). */
    async purgeFiles(){await N().need();const f=await N().rpc('mod_files',{});if(f.length&&!await N().removeFiles(f))throw new Error('Could not remove your files. Nothing was deleted. Try again.')},
    async clear(){await N().need();tidy(await N().rpc('mod_clear',{}))}
  };
})();
