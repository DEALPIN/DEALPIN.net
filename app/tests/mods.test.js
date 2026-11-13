// Tools: money maths, data rules and backup safety. Run from the dealpin folder: node tests/mods.test.js
const vm=require('vm'),fs=require('fs'),ls={},assert=require('assert');
const sb={TextEncoder,crypto,Intl,console,Date,JSON,Math,Number,String,Array,Object,navigator:{language:'en-US'},localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>ls[k]=v,removeItem:k=>delete ls[k]},DEALPIN:{mode:'local'}};
vm.createContext(sb);
for(const f of ['region','mods-core'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+f+'.js','utf8'),sb);
vm.runInContext('this.X={LocalModStore,ModStore,Calc,mn,mj,csvCell,toCsv,MOD_COLLECTIONS,roundMoney}',sb);
const {LocalModStore:S,ModStore,Calc:C,mn,mj,csvCell,toCsv}=sb.X;
let bad=0;const ck=(n,c)=>{console.log(c?'ok  ':'FAIL',n);if(!c){bad=1;process.exitCode=1}};
const sum=a=>a.reduce((x,y)=>x+y,0);
(async()=>{
 ck('Tools use the device adapter until the backend adapter exists',ModStore===S&&S.where==='device');
 // ---- group split: exact to the smallest coin, fair, deterministic
 for(const [cur,tot,fee,qs,mode] of [['USD',100,10,[1,1,1],'qty'],['USD',99.99,7.01,[3,2,5,1],'qty'],['USD',1000,0,[1,2],'equal'],['USD',0.05,0.01,[1,1,1,1,1,1,1],'qty'],['JPY',1000,100,[1,1,1],'equal'],['KWD',10.001,0.003,[2,3],'qty']]){
   const g={cur,total:tot,fee,split:mode,mem:qs.map(q=>({q}))},d=C.split(g);
   ck(`split adds up exactly (${cur} ${tot}+${fee}, ${qs.length} people)`,sum(d)===mn(tot,cur)+mn(fee,cur)&&d.every(x=>Number.isInteger(x)&&x>=0));
 }
 let okAll=true;for(let i=0;i<2000;i++){const cur=['USD','JPY','KWD','UGX','EUR'][i%5],k=1+Math.floor(Math.random()*9),g={cur,total:Math.round(Math.random()*1e6)/100,fee:Math.round(Math.random()*1e4)/100,split:i%2?'qty':'equal',mem:Array.from({length:k},()=>({q:Math.floor(Math.random()*6)}))};
   const d=C.split(g);if(sum(d)!==mn(g.total,cur)+mn(g.fee,cur)||d.some(x=>!Number.isInteger(x)||x<0))okAll=false}
 ck('split is exact for 2000 random group orders in 5 currencies (including 0 and 3 decimal currencies)',okAll);
 ck('split with nobody is empty',C.split({cur:'USD',total:5,fee:1,split:'qty',mem:[]}).length===0);
 ck('split by quantity: more items, bigger share',(()=>{const d=C.split({cur:'USD',total:100,fee:0,split:'qty',mem:[{q:1},{q:3}]});return d[0]===2500&&d[1]===7500})());
 ck('everyone with quantity 0 falls back to equal',(()=>{const d=C.split({cur:'USD',total:10,fee:0,split:'qty',mem:[{q:0},{q:0}]});return d[0]===500&&d[1]===500})());
 // ---- invoices
 const inv={cur:'USD',items:[{q:3,p:19.99},{q:1,p:0.1}],disc:5,tax:7.5,pay:[{amt:10}]},b=C.invoice(inv);
 ck('invoice maths in cents',b.sub===6007&&b.dc===500&&b.tx===Math.round(5507*7.5/100)&&b.tot===b.sub-b.dc+b.tx&&b.bal===b.tot-1000);
 ck('discount cannot exceed the subtotal',C.invoice({...inv,disc:99999}).tot===0);
 ck('0.1 + 0.2 style sums do not drift',C.invoice({cur:'USD',items:[{q:1,p:0.1},{q:1,p:0.2}],disc:0,tax:0,pay:[]}).tot===30);
 ck('quantity with decimals is exact to the cent',C.line({q:1.5,p:3.33},'USD')===500);
 ck('yen has no minor unit',C.invoice({cur:'JPY',items:[{q:3,p:1200}],disc:0,tax:10,pay:[]}).tot===3960);
 // ---- ledger and riders
 const l=C.ledger({cur:'USD',amt:100,pay:[{amt:33.33},{amt:33.33}]});ck('ledger balance has no float drift',l.bal===3334&&l.paid===6666);
 const j={st:'delivered',fee:5,cur:'USD'};
 ck('rider pay: flat in the same currency',C.earn(j,{kind:'flat',rate:2,cur:'USD'})===200);
 ck('rider pay: share of the fee',C.earn(j,{kind:'pct',rate:40,cur:'USD'})===200);
 ck('rider pay: a flat rate in another currency is not guessed',C.earn(j,{kind:'flat',rate:2,cur:'EUR'})===null);
 ck('rider pay: only delivered jobs earn',C.earn({...j,st:'failed'},{kind:'flat',rate:2,cur:'USD'})===0&&C.earn(j,null)===0);
 // ---- data rules (the shared contract), then Tools specifics
 await require('./contract-suite')(S,ck);
 const x=await S.save('jobs',{dname:'A',proof:'data:text/html;base64,PHNjcmlwdD4=',st:'delivered',pin:{lat:999,lng:0}});
 ck('only an image is accepted as proof, and an impossible map pin is dropped',x.proof===''&&x.pin===null);
 const y=await S.save('jobs',{dname:'B',proof:'data:image/jpeg;base64,AAAA',pin:{lat:'0.34761234',lng:32.5825},st:'bogus'});
 ck('a real photo and pin are kept, unknown status falls back',y.proof.startsWith('data:image/jpeg')&&y.pin.lat===0.347612&&y.st==='new');
 const k=await S.save('stock',{name:'Oil',qty:'2.0005',price:1.005,cur:'JPY'});
 ck('money is rounded to the currency, quantity to 3 places',k.price===1&&k.qty===2.001||k.qty===2);
 const z=await S.save('ledger',{who:'T',amt:12.3456,cur:'KWD',dir:'owed'});ck('a 3-decimal currency keeps 3 decimals',z.amt===12.346);
 ck('numbers are clamped',(await S.save('ledger',{who:'big',amt:1e30,cur:'USD'})).amt===1e12);
 for(let i=0;i<201;i++)await S.save('ledger',{who:'p'+i,amt:1,cur:'USD',pay:Array.from({length:201},()=>({amt:1}))}).catch(()=>0);
 ck('lists inside a record are capped',(await S.list('ledger')).every(r=>r.pay.length<=200));
 // ---- csv
 ck('spreadsheet export neutralises formulas',csvCell('=1+1')==="'=1+1"&&csvCell('+SUM(A1)')==="'+SUM(A1)"&&csvCell('@x')==="'@x"&&csvCell('-5')==="'-5"&&csvCell('a,b')==='"a,b"'&&csvCell('say "hi"')==='"say ""hi"""');
 ck('csv has a byte-order mark and CRLF lines',toCsv(['a','b'],[[1,'x']])==='﻿a,b\r\n1,x\r\n');
 // ---- storage trouble
 ls['dealpin.mods.v1']='{bad';ck('damaged storage reads as empty',(await S.list('ledger')).length===0);
 ls['dealpin.mods.v1']='[1,2]';ck('wrong-shaped storage reads as empty',(await S.list('ledger')).length===0);
 console.log(bad?'FAILED':'ok   tools data rules');
})();
