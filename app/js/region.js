/* Regional formatting. Defaults come from the browser; the person can change country and currency in Settings.
   Table rows: country code : calling code : default currency (ISO 3166 / E.164 / ISO 4217). */
const COUNTRY_DATA=`AF:93:AFN AL:355:ALL DZ:213:DZD AD:376:EUR AO:244:AOA AG:1268:XCD AR:54:ARS AM:374:AMD AU:61:AUD AT:43:EUR AZ:994:AZN BS:1242:BSD BH:973:BHD BD:880:BDT BB:1246:BBD BY:375:BYN BE:32:EUR BZ:501:BZD BJ:229:XOF BT:975:BTN BO:591:BOB BA:387:BAM BW:267:BWP BR:55:BRL BN:673:BND BG:359:EUR BF:226:XOF BI:257:BIF KH:855:KHR CM:237:XAF CA:1:CAD CV:238:CVE CF:236:XAF TD:235:XAF CL:56:CLP CN:86:CNY CO:57:COP KM:269:KMF CG:242:XAF CD:243:CDF CR:506:CRC CI:225:XOF HR:385:EUR CU:53:CUP CY:357:EUR CZ:420:CZK DK:45:DKK DJ:253:DJF DM:1767:XCD DO:1809:DOP EC:593:USD EG:20:EGP SV:503:USD GQ:240:XAF ER:291:ERN EE:372:EUR SZ:268:SZL ET:251:ETB FJ:679:FJD FI:358:EUR FR:33:EUR GA:241:XAF GM:220:GMD GE:995:GEL DE:49:EUR GH:233:GHS GR:30:EUR GD:1473:XCD GT:502:GTQ GN:224:GNF GW:245:XOF GY:592:GYD HT:509:HTG HN:504:HNL HK:852:HKD HU:36:HUF IS:354:ISK IN:91:INR ID:62:IDR IR:98:IRR IQ:964:IQD IE:353:EUR IL:972:ILS IT:39:EUR JM:1876:JMD JP:81:JPY JO:962:JOD KZ:7:KZT KE:254:KES KI:686:AUD KW:965:KWD KG:996:KGS LA:856:LAK LV:371:EUR LB:961:LBP LS:266:LSL LR:231:LRD LY:218:LYD LI:423:CHF LT:370:EUR LU:352:EUR MO:853:MOP MG:261:MGA MW:265:MWK MY:60:MYR MV:960:MVR ML:223:XOF MT:356:EUR MH:692:USD MR:222:MRU MU:230:MUR MX:52:MXN FM:691:USD MD:373:MDL MC:377:EUR MN:976:MNT ME:382:EUR MA:212:MAD MZ:258:MZN MM:95:MMK NA:264:NAD NR:674:AUD NP:977:NPR NL:31:EUR NZ:64:NZD NI:505:NIO NE:227:XOF NG:234:NGN MK:389:MKD NO:47:NOK OM:968:OMR PK:92:PKR PW:680:USD PA:507:PAB PG:675:PGK PY:595:PYG PE:51:PEN PH:63:PHP PL:48:PLN PT:351:EUR QA:974:QAR RO:40:RON RU:7:RUB RW:250:RWF KN:1869:XCD LC:1758:XCD VC:1784:XCD WS:685:WST SM:378:EUR ST:239:STN SA:966:SAR SN:221:XOF RS:381:RSD SC:248:SCR SL:232:SLE SG:65:SGD SK:421:EUR SI:386:EUR SB:677:SBD SO:252:SOS ZA:27:ZAR KR:82:KRW SS:211:SSP ES:34:EUR LK:94:LKR SD:249:SDG SR:597:SRD SE:46:SEK CH:41:CHF SY:963:SYP TW:886:TWD TJ:992:TJS TZ:255:TZS TH:66:THB TL:670:USD TG:228:XOF TO:676:TOP TT:1868:TTD TN:216:TND TR:90:TRY TM:993:TMT TV:688:AUD UG:256:UGX UA:380:UAH AE:971:AED GB:44:GBP US:1:USD UY:598:UYU UZ:998:UZS VU:678:VUV VE:58:VES VN:84:VND YE:967:YER ZM:260:ZMW ZW:263:ZWG`;
const BROWSER_LANG=(navigator.language||'en-US').split('-')[0]||'en';
const regionName=(()=>{try{const d=new Intl.DisplayNames([navigator.language||'en'],{type:'region'});return c=>d.of(c)||c}catch{return c=>c}})();
const currencyName=(()=>{try{const d=new Intl.DisplayNames([navigator.language||'en'],{type:'currency'});return c=>{try{return d.of(c)||c}catch{return c}}}catch{return c=>c}})();
/* [code, name, calling code, default currency, locale] sorted by name */
const REGIONS=COUNTRY_DATA.split(' ').map(x=>{const[c,d,cur]=x.split(':');return[c,regionName(c),'+'+d,cur,BROWSER_LANG+'-'+c]}).sort((a,b)=>a[1].localeCompare(b[1]));
const detected=((navigator.language||'en-US').split('-')[1]||'').toUpperCase();
let REGION=(()=>{
  try{const x=JSON.parse(localStorage.getItem('dealpin.region'));if(x&&/^[A-Z]{2}$/.test(x.country)&&/^[A-Z]{3}$/.test(x.currency)&&x.dial&&x.locale)return x}catch{}
  const r=REGIONS.find(x=>x[0]===detected)||REGIONS.find(x=>x[0]==='US');
  return{country:r[0],dial:r[2],currency:r[3],locale:r[4]}})();
function saveRegion(){try{localStorage.setItem('dealpin.region',JSON.stringify(REGION))}catch{}}
function regionOptions(){return REGIONS.map(r=>`<option value="${r[0]}"${r[0]===REGION.country?' selected':''}>${r[1]} (${r[2]})</option>`).join('')}
/* All currencies the browser knows, with names. `pick` is the one to select. */
function currencyOptions(pick=REGION.currency){
  const codes=typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('currency'):[...new Set(REGIONS.map(r=>r[3]))];
  const all=[...new Set([...codes,pick])].sort();
  return all.map(c=>`<option value="${c}"${c===pick?' selected':''}>${c} · ${currencyName(c)}</option>`).join('')}
function setRegion(country,currency){
  const r=REGIONS.find(x=>x[0]===country);
  REGION={country:r?r[0]:REGION.country,dial:r?r[2]:REGION.dial,locale:r?r[4]:REGION.locale,currency:currency&&/^[A-Z]{3}$/.test(currency)?currency:(r?r[3]:REGION.currency)};saveRegion()}
/* Number of decimal places a currency uses (JPY 0, USD 2, KWD 3). */
function minorDigits(cur){try{return new Intl.NumberFormat('en',{style:'currency',currency:cur}).resolvedOptions().maximumFractionDigits}catch{return 2}}
function roundMoney(v,cur){const k=10**minorDigits(cur);return Math.round(Number(v)*k)/k}
function money(n,cur){
  const c=cur&&/^[A-Z]{3}$/.test(cur)?cur:REGION.currency;
  try{return new Intl.NumberFormat(REGION.locale,{style:'currency',currency:c}).format(Number(n)||0)}
  catch{return c+' '+new Intl.NumberFormat().format(Number(n)||0)}}
function when(t){const d=new Date(t);if(isNaN(d))return '';return d.toLocaleString(REGION.locale,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}
/* Digits for wa.me and tel links. A number starting with + or 00 is already international; otherwise the selected calling code is added. */
function tel(p){
  let n=String(p||'').trim().replace(/[^\d+]/g,'');
  if(n.startsWith('+'))return n.replace(/\D/g,'');
  n=n.replace(/\D/g,'');const dial=REGION.dial.replace('+','');
  if(n.startsWith('00'))return n.slice(2);
  if(n.startsWith(dial)&&n.length>=dial.length+7)return n;
  if(n.startsWith('0'))n=n.slice(1);
  return dial+n}
