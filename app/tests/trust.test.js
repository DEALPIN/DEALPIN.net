// node tests/trust.test.js  : the on-device Trust Score follows the same rules as supabase/setup/16-trust.sql
global.esc=s=>String(s);global.LANG='en';
const fs=require('fs');eval(fs.readFileSync(__dirname+'/../js/trust.js','utf8')+';global.Trust=Trust');
const ok=(n,c)=>{console.log(c?'ok  ':'FAIL',n);if(!c)process.exitCode=1};
const deal=(st,stars,ag,sh)=>({status:st,rating:stars?{stars}:undefined,events:[{s:'agreed',at:ag},{s:'shipped',at:sh}]});
ok('under 5 deals shows no score',Trust.compute([deal('received',5,0,1),deal('received',5,0,1)]).tier==='new');
ok('disputed deals do not count as completed',Trust.compute(Array(5).fill(deal('disputed',0,0,1))).tier==='new');
const good=Array(5).fill(deal('received',5,0,3600000)),a=Trust.compute(good);
ok('5 perfect deals score 78 (volume 2.5, ratings 30, no disputes 25, fast 20)',a.score===78&&a.tier==='trusted'&&a.verified);
const slow=Trust.compute(Array(5).fill(deal('received',5,0,9e8)));ok('slow shipping lowers the score',slow.score<a.score);
const bad=Trust.compute([...Array(5).fill(deal('received',3,0,1)),...Array(5).fill(deal('disputed',0,0,1))]);ok('disputes lower the score',bad.score<a.score&&bad.disputes===5);
ok('new seller line is not a score',!Trust.badge({tier:'new'}));
