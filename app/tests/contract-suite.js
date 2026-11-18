/* The rules every Tools data adapter must follow (ModStore). LocalModStore passes it today;
   the online adapter built in the backend round must pass the same suite unchanged.
   Usage: await require('./contract-suite')(adapter, ck)   where ck(name, condition) records a result. */
module.exports=async function(S,ck){
  const no=async f=>{try{await f();return null}catch(e){return e}};
  await S.clear();
  ck('contract: starts empty',(await S.list('ledger')).length===0&&(await S.get('ledger','abcdefghij'))===null);
  const a=await S.save('ledger',{who:'Ann',amt:50,cur:'USD',dir:'owed'});
  ck('contract: save returns a record with id, created, updated and rev 1',/^[a-z0-9]{10}$/.test(a.id)&&a.at>0&&a.up>=a.at&&a.rev===1);
  ck('contract: get returns what was saved',(await S.get('ledger',a.id)).who==='Ann');
  const b=await S.save('ledger',{...a,who:'Ann B'});
  ck('contract: saving with an id edits the record, keeps created, raises rev',b.id===a.id&&b.at===a.at&&b.rev===2&&(await S.list('ledger')).length===1);
  const stale=await no(()=>S.save('ledger',{...a,who:'Stale'}));
  ck('contract: saving an out-of-date copy is refused (conflict)',!!stale&&/changed/i.test(stale.message)&&(await S.get('ledger',a.id)).who==='Ann B');
  ck('contract: a client cannot choose the id of a new record',(await S.save('stock',{id:'../../etc',name:'x'})).id!=='../../etc');
  ck('contract: hostile input is normalised',await (async()=>{const x=await S.save('ledger',{who:'<b>'.repeat(60),amt:'abc',dir:'evil',cur:'usd',pay:'no',due:'tomorrow'});return x.who.length<=60&&x.amt===0&&x.dir==='owed'&&/^[A-Z]{3}$/.test(x.cur)&&x.pay.length===0&&x.due===''})());
  ck('contract: unknown record types are refused',!!(await no(()=>S.save('evil',{a:1}))));
  const l=await S.list('ledger');ck('contract: list is newest first',l.every((x,i)=>i===0||l[i-1].at>=x.at));
  // batch: all or nothing
  const before=(await S.list('stock')).length;
  const e=await no(()=>S.batch([{op:'save',col:'stock',obj:{name:'one'}},{op:'save',col:'nope',obj:{}}]));
  ck('contract: a failed batch changes nothing',!!e&&(await S.list('stock')).length===before);
  const ok=await S.batch([{op:'save',col:'stock',obj:{name:'two'}},{op:'save',col:'riders',obj:{name:'Rae'}}]);
  ck('contract: a good batch saves everything',ok.length===2&&(await S.list('riders')).length===1);
  await S.del('ledger',a.id);ck('contract: delete removes a record',(await S.get('ledger',a.id))===null);
  await S.del('ledger','zzzzzzzzzz');ck('contract: deleting something that is gone is not an error',true);
  // deliveries: status, handover code and wrong-code count change only through act()
  const jb=await S.save('jobs',{dname:'Dee',dphone:'0700000000',drop:'Main',st:'delivered',code:'1234',tries:0});
  ck('contract: a new delivery starts as new with no code, whatever the client sends',jb.st==='new'&&jb.code===''&&jb.tries===0);
  ck('contract: a delivery cannot be confirmed before pickup',!!(await no(()=>S.act('jobs',jb.id,'confirm',{code:'0000'}))));
  const pk=await S.act('jobs',jb.id,'pickup');
  ck('contract: pickup makes a 4 digit code on the server side and logs it',pk.ok&&pk.record.st==='picked'&&/^\d{4}$/.test(pk.record.code)&&pk.record.tries===0&&pk.record.ev.some(v=>v.s==='Picked up')&&pk.record.rev===jb.rev+1);
  const forged=await S.save('jobs',{...pk.record,st:'delivered',code:'0000',tries:0});
  ck('contract: a plain save cannot change status, code or tries',forged.st==='picked'&&forged.code===pk.record.code&&forged.tries===0);
  const wrong=pk.record.code==='0000'?'1111':'0000';
  let w1=await S.act('jobs',jb.id,'confirm',{code:wrong});
  ck('contract: a wrong code is refused and counted',!w1.ok&&w1.record.tries===1&&w1.record.st==='picked'&&w1.record.ev.some(v=>v.s==='Wrong code entered'));
  for(let i=0;i<4;i++)await S.act('jobs',jb.id,'confirm',{code:wrong});
  const locked=await no(()=>S.act('jobs',jb.id,'confirm',{code:pk.record.code}));
  ck('contract: after 5 wrong codes even the right code is refused',!!locked&&/wrong codes/i.test(locked.message)&&(await S.get('jobs',jb.id)).st==='picked');
  const rs=await S.act('jobs',jb.id,'reset');
  ck('contract: a reset makes a new code and clears the count',rs.record.tries===0&&/^\d{4}$/.test(rs.record.code));
  ck('contract: the right code delivers',(await S.act('jobs',jb.id,'confirm',{code:rs.record.code})).record.st==='delivered');
  ck('contract: a delivered job cannot be changed again',!!(await no(()=>S.act('jobs',jb.id,'pickup')))&&!!(await no(()=>S.act('jobs',jb.id,'fail',{why:'x'}))));
  const j2=await S.save('jobs',{dname:'Eve'});await S.act('jobs',j2.id,'pickup');
  ck('contract: failing or delivering without the code needs a reason',!!(await no(()=>S.act('jobs',j2.id,'fail',{why:'  '})))&&!!(await no(()=>S.act('jobs',j2.id,'nocode',{}))));
  const nc=await S.act('jobs',j2.id,'nocode',{why:'Phone off'});ck('contract: delivered without the code is recorded as such',nc.record.st==='delivered'&&nc.record.why==='No code: Phone off'&&nc.record.ev.some(v=>v.s==='Delivered without code'));
  const j3=await S.save('jobs',{dname:'Fay'});await S.act('jobs',j3.id,'pickup');const fl=await S.act('jobs',j3.id,'fail',{why:'Nobody home'});
  const rt=await S.act('jobs',j3.id,'retry');ck('contract: a failed delivery can be tried again',fl.record.st==='failed'&&rt.record.st==='new'&&rt.record.code===''&&rt.record.why==='');
  const j4=await S.save('jobs',{dname:'Gus'});const cn=await S.act('jobs',j4.id,'cancel',{why:'Changed mind'});ck('contract: a delivery can be cancelled with a reason',cn.record.st==='cancelled');
  ck('contract: unknown actions, records and types are refused',!!(await no(()=>S.act('jobs',j4.id,'teleport')))&&!!(await no(()=>S.act('jobs','zzzzzzzzzz','pickup')))&&!!(await no(()=>S.act('ledger',a.id,'pickup'))));
  ck('contract: the event log keeps at most 80 entries',await (async()=>{const j=await S.save('jobs',{dname:'Hal'});await S.act('jobs',j.id,'pickup');let r;for(let i=0;i<90;i++)r=await S.act('jobs',j.id,'viewed');return r.record.ev.length===80&&r.record.ev[79].s==='Code viewed'&&r.record.ev[0].s!=='Picked up'})());
  // export / import
  const ex=await S.export();
  ck('contract: export has a version and the records',ex.v>=1&&Array.isArray(ex.stock)&&ex.stock.length>=2);
  const snap=JSON.stringify((await S.list('stock')).map(x=>x.id).sort());
  await S.import({stock:[{name:'only'}],evil:[{a:1}]},true);
  ck('contract: a dry-run import changes nothing',JSON.stringify((await S.list('stock')).map(x=>x.id).sort())===snap);
  ck('contract: a malformed backup is refused',!!(await no(()=>S.import({ledger:'nope'},true)))&&!!(await no(()=>S.import([1],true))));
  await S.import(ex);
  ck('contract: import restores records with their ids',JSON.stringify((await S.list('stock')).map(x=>x.id).sort())===snap);
  await S.import({stock:[{name:'only'}],evil:[{a:1}]});
  ck('contract: import replaces everything and drops unknown types',(await S.list('stock')).length===1&&(await S.list('riders')).length===0&&!('evil' in (await S.export())));
  ck('contract: the adapter says where data lives',['device','online'].includes(S.where));
  await S.clear();ck('contract: clear removes everything',(await S.list('stock')).length===0);
};
