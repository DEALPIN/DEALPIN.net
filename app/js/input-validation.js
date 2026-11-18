/* Dealpin input hardening: small, deterministic checks shared by online API callers. */
const DealpinInput=(()=>{
  const text=(v,max=100)=>{if(typeof v!=='string')throw new Error('Invalid input.');if(v.length>max)throw new Error('Input is too long.');return v};
  const id=(v,label='record')=>{text(String(v||''),128);if(!/^[A-Za-z0-9_-]+$/.test(String(v||'')))throw new Error(`Invalid ${label}.`);return String(v)};
  const uuid=(v,label='record')=>{if(v==null||v==='')return v;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v)))throw new Error(`Invalid ${label}.`);return String(v)};
  const money=(v,label='amount')=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e11||Math.round(n*1000)!==n*1000)throw new Error(`Enter a valid ${label}.`);return n};
  const currency=v=>{v=text(String(v||''),3).toUpperCase();if(!/^[A-Z]{3}$/.test(v))throw new Error('Enter a valid three-letter currency code.');return v};
  const json=(v,max=65536)=>{let s;try{s=JSON.stringify(v)}catch{throw new Error('Invalid data.')}if(s.length>max)throw new Error('The submitted data is too large.');return v};
  const action=v=>{v=text(String(v||''),40);if(!/^[a-z][a-z0-9_-]*$/.test(v))throw new Error('Invalid action.');return v};
  return Object.freeze({text,id,uuid,money,currency,json,action});
})();
