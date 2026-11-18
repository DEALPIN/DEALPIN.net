# Hardening audit in a real browser: injection attempts, strict policy, phone-size layout and touch targets,
# the "new version" prompt, and the error hook. Run from the dealpin folder:  python3 tests/audit.py
import subprocess,time,sys,shutil,tempfile,os,re,json
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def check(n,c,extra=''):
    print('ok  ' if c else 'FAIL',n,('' if c else extra))
    if not c: check.bad=1
check.bad=0
def serve(d,port):
    s=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--directory',d],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(.8);return s
def copy():
    d=tempfile.mkdtemp();t=os.path.join(d,'app')
    shutil.copytree(ROOT,t,ignore=shutil.ignore_patterns('node_modules','tests','.git'));return t
WATCH="window.__csp=[];addEventListener('securitypolicyviolation',e=>__csp.push(e.violatedDirective+' '+e.blockedURI))"
EVIL='<img src=x onerror="window.__x=1"><script>window.__x=2</script>'
app=copy();srv=serve(app,8771);B='http://localhost:8771/index.html'
try:
  with sync_playwright() as p:
    br=p.chromium.launch()
    # ------------------------------------------------ 1. injection attempts on every screen
    ctx=br.new_context(viewport={'width':390,'height':844});ctx.route('**/js/config.js',lambda r:r.fulfill(body="window.DEALPIN={mode:'local',url:'',anonKey:'',errorEndpoint:'',supportEmail:''};",content_type='application/javascript'));ctx.add_init_script(WATCH);pg=ctx.new_page();pg.on('dialog',lambda d:d.dismiss())
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'#/profile');pg.fill('#n','Shop '+EVIL[:30]);pg.fill('#pa','0772000000');pg.click('text=Save profile')
    pg.goto(B+'#/new');pg.fill('#t',EVIL);pg.fill('#p','85000');pg.fill('#x',EVIL);pg.click('button:has-text("Create deal link")')
    pg.wait_for_selector('input[readonly]');did=pg.url.split('/deal/')[1]
    deal=pg.evaluate("JSON.parse(localStorage.getItem('dealpin.v1')).deals[0]");bt,rt=deal['bt'],deal['rt']
    pg.goto(B+'#/d/'+bt);pg.fill('#n',EVIL);pg.fill('#ph','0701000000');pg.fill('#lm',EVIL);pg.click('button:has-text("Agree to this deal")');pg.wait_for_selector('text=You agreed')
    pages=['#/','#/deal/'+did,'#/d/'+bt,'#/g/'+rt,'#/r/'+did,'#/u/shop-img-src-x-onerror','#/settings','#/legal','#/verify','#/welcome','#/profile','#/new']
    inj=0
    for h in pages:
        pg.goto(B+h);pg.wait_for_timeout(250)
        inj+=pg.evaluate("document.querySelectorAll('main img[src=\"x\"], main script, main [onerror]').length")
    check('hostile text is shown as text on every screen (no injected elements)',inj==0,str(inj))
    check('no script ran',pg.evaluate('window.__x')is None)
    # backup files are untrusted: a made-up status is refused, hostile photo addresses are dropped
    bad={'seller':{'name':'x','handle':'x','phone':'','pay':''},'deals':[{'id':'zzzzzzzzzz','bt':'a'*32,'rt':'b'*32,'title':'t','price':1,'delivery':'Buyer collects','status':'created<img src=x onerror=1>','created':1,'events':[{'s':'created<b>','at':1}],'photos':[],'buyer':None,'code':None,'seller':{}}]}
    pg.goto(B+'#/settings');pg.set_input_files('#imf',files=[{'name':'b.json','mimeType':'application/json','buffer':json.dumps(bad).encode()}]);pg.wait_for_timeout(500)
    check('a backup with a made-up status is refused',pg.locator('dialog').count()==0 and pg.evaluate("JSON.parse(localStorage.getItem('dealpin.v1')).deals.every(d=>d.id!=='zzzzzzzzzz')"))
    ok_={'seller':{'name':'Kept','handle':'kept','phone':'','pay':''},'deals':[{'id':'yyyyyyyyyy','bt':'a'*32,'rt':'b'*32,'title':'<img src=x onerror=window.__x=3>','price':1,'currency':'USD','delivery':'Buyer collects','status':'created','created':1,'events':[{'s':'created','at':1}],'photos':['javascript:alert(1)','https://evil.example/x.jpg'],'buyer':None,'code':None,'seller':{'name':'s'}}]}
    pg.set_input_files('#imf',files=[{'name':'b.json','mimeType':'application/json','buffer':json.dumps(ok_).encode()}]);pg.wait_for_selector('dialog #mok');pg.click('dialog #mok');pg.wait_for_timeout(500)
    pg.goto(B+'#/deal/yyyyyyyyyy');pg.wait_for_timeout(400)
    check('outside photo addresses in a restored backup are dropped',pg.locator('main img').count()==0 and 'evil.example' not in pg.evaluate("localStorage.getItem('dealpin.v1')"))
    check('hostile title in a backup is shown as text',pg.locator('main img[src="x"]').count()==0 and pg.evaluate('window.__x')is None)
    # ------------------------------------------------ 2. the policy is really enforced
    pg.goto(B+'#/welcome')
    r=pg.evaluate("""()=>{setTimeout('window.__ev=1',10);let e1=false;
      const s=document.createElement('script');s.textContent='window.__inl=1';document.body.appendChild(s);
      const i=document.createElement('img');i.src='https://evil.example/p.gif';document.body.appendChild(i);
      return new Promise(res=>setTimeout(()=>res({ev:!window.__ev&&window.__csp.some(c=>c.startsWith('script-src')),inl:window.__inl||0,csp:window.__csp.slice()}),400))}""")
    check('code built from text (eval style) is blocked',r['ev'],str(r['csp']))
    check('an inline script is blocked',r['inl']==0)
    check('an image from another site is blocked',any('img-src' in c and 'evil.example' in c for c in r['csp']),str(r['csp']))
    check('the page has no inline handlers or inline styles',pg.evaluate("document.querySelectorAll('[onclick],[onchange],[onsubmit],[oninput],[style]').length")==0)
    check('no page errors',not errs,str(errs))
    ctx.close()
    # ------------------------------------------------ 3. phone-size layout and touch targets (fresh data)
    ctx=br.new_context(viewport={'width':390,'height':844},has_touch=True);ctx.route('**/js/config.js',lambda r:r.fulfill(body="window.DEALPIN={mode:'local',url:'',anonKey:'',errorEndpoint:'',supportEmail:''};",content_type='application/javascript'));pg=ctx.new_page();pg.on('dialog',lambda d:d.dismiss())
    pg.goto(B+'#/profile');pg.fill('#n','Test Seller Shop');pg.fill('#pa','0772000000');pg.click('text=Save profile')
    pg.goto(B+'#/new');pg.fill('#t','Red sneakers');pg.fill('#p','85000');pg.click('button:has-text("Create deal link")');pg.wait_for_selector('input[readonly]')
    did=pg.url.split('/deal/')[1];deal=pg.evaluate("JSON.parse(localStorage.getItem('dealpin.v1')).deals[0]");bt,rt=deal['bt'],deal['rt']
    pg.goto(B+'#/deal/'+did);pg.goto(B+'#/d/'+bt);pg.fill('#n','Sam');pg.fill('#ph','0701000000');pg.fill('#lm','Gate');pg.click('button:has-text("Agree to this deal")');pg.wait_for_selector('text=You agreed')
    JS="""()=>[...document.querySelectorAll('a[href],button,input:not([type=hidden]):not([hidden]),select,textarea,[role=button]')].filter(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return r.width>0&&r.height>0&&c.visibility!=='hidden'&&!e.closest('[hidden]')}).map(e=>({t:(e.id||e.textContent||e.tagName).trim().slice(0,28),w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)})).filter(x=>x.h<44||x.w<44)"""
    STRUCT="""()=>({sx:document.documentElement.scrollWidth>innerWidth+1,h1:document.querySelectorAll('h1').length,
      noalt:[...document.querySelectorAll('img:not([alt])')].length,
      nolabel:[...document.querySelectorAll('input:not([type=hidden]):not([hidden]):not([readonly]),select,textarea')].filter(e=>!(e.labels&&e.labels.length)&&!e.getAttribute('aria-label')).length})"""
    small={};struct={}
    for h in ['#/','#/new','#/profile','#/settings','#/legal','#/verify','#/welcome','#/deal/'+did,'#/d/'+bt,'#/g/'+rt,'#/r/'+did]:
        pg.goto(B+h);pg.wait_for_timeout(300);s=pg.evaluate(JS)
        if s:small[h.split('/')[1]+h[-3:]]=s
        st=pg.evaluate(STRUCT);struct[h]=st
    check('no screen scrolls sideways at phone width',not any(v['sx'] for v in struct.values()),str({k:v for k,v in struct.items() if v['sx']}))
    check('one main heading per screen',all(v['h1']==1 for v in struct.values()),str({k:v['h1'] for k,v in struct.items() if v['h1']!=1}))
    check('every image has a description',all(v['noalt']==0 for v in struct.values()))
    check('every form field has a label',all(v['nolabel']==0 for v in struct.values()),str({k:v['nolabel'] for k,v in struct.items() if v['nolabel']}))
    check('every button, link and field is at least 44 by 44 pixels',not small,json.dumps(small)[:900])
    # ------------------------------------------------ 3b. every width: nothing scrolls sideways, one navigation is visible
    for w,h_ in [(320,640),(390,844),(768,1024),(1024,768),(1440,900)]:
        pg.set_viewport_size({'width':w,'height':h_})
        ov=[]
        for hh in ['#/','#/new','#/profile','#/settings','#/deal/'+did,'#/d/'+bt,'#/r/'+did]:
            pg.goto(B+hh);pg.wait_for_timeout(250)
            if pg.evaluate("document.documentElement.scrollWidth>innerWidth+1"):ov.append(hh)
        check(f'no sideways scrolling at {w}px wide',not ov,str(ov))
    pg.set_viewport_size({'width':1440,'height':900});pg.goto(B+'#/');pg.wait_for_timeout(250)
    check('desktop shows the navigation under the header, not as a bottom bar',pg.evaluate("getComputedStyle(document.querySelector('#main-navigation')).position")=='sticky')
    pg.set_viewport_size({'width':390,'height':844});pg.goto(B+'#/');pg.wait_for_timeout(250)
    check('phone shows the navigation as a bottom bar',pg.evaluate("getComputedStyle(document.querySelector('#main-navigation')).position")=='fixed')
    pg.set_viewport_size({'width':1440,'height':900});pg.goto(B+'#/deal/'+did);pg.wait_for_timeout(250)
    check('the deal page uses two columns on a wide screen',pg.evaluate("getComputedStyle(document.querySelector('.split')).gridTemplateColumns.split(' ').length")==2)
    ctx.close()
    br.close()
finally: srv.terminate()

# ------------------------------------------------ 4. new-version prompt and 5. error hook (own copy: we change files while it runs)
app=copy();srv=serve(app,8772);B='http://localhost:8772/index.html'
ix=open(app+'/index.html').read().replace("connect-src 'self' https://*.supabase.co","connect-src 'self' https://*.supabase.co https://errors.example")
open(app+'/index.html','w').write(ix)
cfg=open(app+'/js/config.js').read().replace("mode:'supabase'","mode:'local'").replace("errorEndpoint:''","errorEndpoint:'https://errors.example/e'");open(app+'/js/config.js','w').write(cfg)
try:
  with sync_playwright() as p:
    br=p.chromium.launch();ctx=br.new_context();pg=ctx.new_page()
    posts=[];ctx.route('https://errors.example/**',lambda r:(posts.append(r.request.post_data),r.fulfill(status=204,body='')))
    nav=[];pg.on('framenavigated',lambda f:nav.append(f.url))
    pg.goto(B+'#/welcome');pg.wait_for_function("navigator.serviceWorker.controller||navigator.serviceWorker.ready.then(()=>true)");pg.wait_for_timeout(1200)
    n1=len(nav);pg.wait_for_timeout(1500)
    check('first visit shows no update banner and does not reload',pg.locator('#upd').count()==0 and len(nav)==n1)
    pg.reload();pg.wait_for_function("navigator.serviceWorker.controller");pg.wait_for_timeout(500)
    sw=open(app+'/sw.js').read();cur=int(re.search(r"dealpin-v(\d+)",sw).group(1));OLD,NEW='dealpin-v%d'%cur,'dealpin-v%d'%(cur+1);open(app+'/sw.js','w').write(sw.replace(OLD,NEW))
    pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.update())");pg.wait_for_selector('#upd',timeout=8000)
    check('a new version shows an Update prompt (nobody is reloaded without asking)',pg.locator('#upd button').count()==1)
    pg.wait_for_timeout(1000);check('the page did not reload by itself',pg.locator('#upd').count()==1)
    pg.click('#upd button');pg.wait_for_function("caches.keys().then(k=>k.includes('%s'))"%NEW+"",timeout=8000);pg.wait_for_timeout(1500)
    check('tapping Update switches to the new version',pg.evaluate("caches.keys().then(k=>k.includes('%s')&&!k.includes('%s'))"%(NEW,OLD)+"") and pg.locator('#upd').count()==0)
    # error hook
    pg.evaluate("setTimeout(()=>{throw new Error('boom for +256772123456 at #/d/'+'a1'.repeat(16))},10)");pg.wait_for_timeout(800)
    check('a crash is reported to the endpoint',len(posts)==1,str(posts))
    body=posts[0] if posts else ''
    check('the report holds no token, no phone number, no link',body and not re.search(r'[0-9a-f]{16,}|772123456',body) and '"kind":"error"' in body,body)
    pg.evaluate("setTimeout(()=>{throw new Error('boom for +256772123456 at #/d/'+'a1'.repeat(16))},10)");pg.wait_for_timeout(500)
    check('the same crash is reported only once',len(posts)==1)
    for i in range(8):pg.evaluate(f"setTimeout(()=>{{throw new Error('different {i}')}},5)");pg.wait_for_timeout(60)
    pg.wait_for_timeout(500);check('no more than 5 reports per visit',len(posts)<=5,str(len(posts)))
    br.close()
finally: srv.terminate()
sys.exit(check.bad)
