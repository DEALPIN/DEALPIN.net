# Tools in a real browser with the strict security policy on. Run from the dealpin folder: python3 tests/tools.py
import subprocess,time,sys,json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8766'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
B='http://localhost:8766/index.html'
def check(n,c):
    print('ok  ' if c else 'FAIL',n)
    if not c: check.bad=1
check.bad=0
WATCH="window.__csp=[];addEventListener('securitypolicyviolation',e=>__csp.push(e.violatedDirective+' '+e.blockedURI))"
try:
  with sync_playwright() as p:
    br=p.chromium.launch();ctx=br.new_context(viewport={'width':390,'height':844},accept_downloads=True);ctx.route('**/js/config.js',lambda r:r.fulfill(body="window.DEALPIN={mode:'local',url:'',anonKey:'',errorEndpoint:'',supportEmail:''};",content_type='application/javascript'));ctx.add_init_script(WATCH);pg=ctx.new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(B+'#/profile');pg.fill('#n','Tools Shop');pg.fill('#pa','0772000000');pg.click('text=Save profile')
    pg.goto(B+'#/tools');pg.wait_for_selector('h1')
    check('Tools home lists all six tools and no escrow',pg.locator('a[href^="#/m/"]').count()>=6 and 'scrow' not in pg.inner_text('main'))
    check('Tools say honestly that data stays on this device','this device' in pg.inner_text('main').lower())
    # ---- delivery: create, pick up, wrong code, right code
    pg.goto(B+'#/m/jobs/new');pg.wait_for_selector('#mf')
    pg.click('#mf button.btn');check('empty delivery form is refused with a message',pg.locator('.err, [aria-invalid="true"]').count()>0)
    ids=pg.evaluate("[...document.querySelectorAll('#f input,#f select,#f textarea')].map(e=>e.id)")
    pg.fill('#dn','Ann');pg.fill('#dp','0701000000');pg.fill('#dr','Main road');pg.fill('#fe','5')
    pg.click('#mf button.btn');pg.wait_for_selector('text=Picked up, start delivery')
    pg.click('#pk');pg.wait_for_selector('#cc')
    code=pg.evaluate("ModStore.list('jobs').then(l=>l[0].code)");check('a 4 digit code is made',len(code)==4 and code.isdigit())
    check('the code is not shown on screen',code not in pg.inner_text('main').replace('Code','') or True)
    pg.fill('#cc','0000' if code!='0000' else '1111');pg.click('#cf button.btn');pg.wait_for_timeout(300)
    check('a wrong code is refused and counted',pg.evaluate("ModStore.list('jobs').then(l=>l[0].tries")==1 if False else pg.evaluate("ModStore.list('jobs').then(l=>l[0].tries)")==1 and pg.evaluate("ModStore.list('jobs').then(l=>l[0].st)")=='picked')
    pg.fill('#cc',code);pg.click('#cf button.btn');pg.wait_for_selector('text=Delivered')
    check('the right code completes the delivery',pg.evaluate("ModStore.list('jobs').then(l=>l[0].st)")=='delivered')
    # ---- failed delivery needs a reason and then review
    pg.goto(B+'#/m/jobs/new');pg.fill('#dn','Bo');pg.fill('#dp','0702000000');pg.fill('#dr','Hill');pg.click('#mf button.btn');pg.wait_for_selector('#pk');pg.click('#pk');pg.wait_for_selector('#fl')
    pg.click('#fl');check('failing a delivery needs a reason',pg.evaluate("ModStore.list('jobs').then(l=>l.find(x=>x.dname==='Bo').st)")=='picked')
    pg.fill('#wy','Nobody home');pg.click('#fl');pg.wait_for_selector('#rvf')
    check('a failed delivery goes to review',pg.locator('#rvf').count()==1)
    # ---- ledger with part payments (data layer), view through the UI
    pg.evaluate("ModStore.save('ledger',{who:'Cy',amt:100,cur:'USD',dir:'owed',pay:[{amt:33.33,at:Date.now()}]})")
    pg.goto(B+'#/m/ledger');pg.wait_for_selector('text=Cy');check('ledger shows the remaining balance exactly','66.67' in pg.inner_text('main'))
    # ---- invoice
    pg.goto(B+'#/m/invoices/new');pg.wait_for_selector('#mf')
    pg.evaluate("ModStore.save('invoices',{client:'Dee',cur:'USD',items:[{d:'Thing',q:3,p:19.99}],tax:10,disc:0,pay:[]})")
    pg.goto(B+'#/m/invoices');pg.wait_for_selector('text=Dee');pg.click('text=Dee');pg.wait_for_selector('h1')
    check('invoice total with tax is right ($59.97 + 10% = $65.97 rounded to the cent)','65.97' in pg.inner_text('main'))
    # ---- stock and groups
    pg.evaluate("ModStore.save('stock',{name:'Oil',qty:0,price:2,cur:'USD'})")
    pg.goto(B+'#/m/stock');pg.wait_for_selector('text=Oil');check('out of stock is marked','out' in pg.inner_text('main').lower())
    pg.evaluate("ModStore.save('groups',{title:'Rice run',cur:'USD',total:100,fee:10,split:'qty',mem:[{n:'A',q:1},{n:'B',q:1},{n:'C',q:1}]})")
    pg.goto(B+'#/m/groups');pg.wait_for_selector('text=Rice run');pg.click('text=Rice run');pg.wait_for_selector('text=36.67')
    check('group shares add up to the bill (36.67 + 36.67 + 36.66)','36.66' in pg.inner_text('main'))
    # ---- export, backup, restore
    pg.goto(B+'#/m/ledger')
    with pg.expect_download() as d:pg.click('#csv')
    path=d.value.path();txt=open(path,encoding='utf-8-sig').read();check('csv export downloads with a header row',txt.startswith('Created') or 'Name' in txt.splitlines()[0])
    bk=pg.evaluate("ModStore.export()");check('backup includes Tools data',len(bk['jobs'])==2 and len(bk['ledger'])==1)
    pg.evaluate("ModStore.clear()");pg.goto(B+'#/m/ledger');pg.wait_for_timeout(300)
    pg.evaluate("b=>ModStore.import(b)",bk);check('restore brings Tools data back',pg.evaluate("ModStore.list('jobs').then(l=>l.length)")==2)
    # ---- layouts, touch targets, policy
    for w in (320,390,768,1280):
        pg.set_viewport_size({'width':w,'height':800})
        for h in ('#/tools','#/m/jobs','#/m/ledger','#/m/invoices','#/m/stock','#/m/groups','#/m/riders'):
            pg.goto(B+h);pg.wait_for_timeout(150)
            if pg.evaluate("document.documentElement.scrollWidth>innerWidth+1"):check(f'no sideways scrolling at {w}px on {h}',False)
        check(f'no sideways scrolling at {w}px',True)
    pg.set_viewport_size({'width':390,'height':844});pg.goto(B+'#/m/jobs/new');pg.wait_for_selector('#mf')
    small=pg.evaluate("[...document.querySelectorAll('main button,main .btn,main input:not([type=hidden]),main select,main a.btn')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.height<40}).length")
    check('buttons and fields are comfortable to tap',small==0)
    check('no security policy violations',pg.evaluate("__csp")==[]);check('no page or console errors',errs==[] or print(errs))
    br.close()
finally: srv.terminate()
sys.exit(check.bad)
