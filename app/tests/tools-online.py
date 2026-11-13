# Online Tools screens in a real browser with the strict security policy on, against a pretend server. Run from the dealpin folder: python3 tests/tools-online.py
import subprocess,time,sys,json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8767'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
B='http://localhost:8767/index.html'
def check(n,c):
    print('ok  ' if c else 'FAIL',n)
    if not c: check.bad=1
check.bad=0
URL='https://abc.supabase.co'
try:
  with sync_playwright() as p:
    br=p.chromium.launch();ctx=br.new_context(viewport={'width':390,'height':844})
    ctx.route('**/js/config.js',lambda r:r.fulfill(body="window.DEALPIN={mode:'supabase',testingBypassAuth:true,url:'%s',anonKey:'sb_publishable_test',errorEndpoint:'',supportEmail:''};"%URL,content_type='application/javascript'))
    calls=[];online=[]
    def api(r):
        u=r.request.url.replace(URL,'');calls.append(u+' '+(r.request.post_data or ''))
        if u.startswith('/rest/v1/profiles'):return r.fulfill(json=[{'name':'Ann Shop','handle':'ann','phone':'','pay':''}])
        if u=='/rest/v1/rpc/mod_list':return r.fulfill(json=online)
        if u=='/rest/v1/rpc/mod_import':
            d=json.loads(r.request.post_data)['p_data'];return r.fulfill(json={'count':sum(len(v) for v in d.values())})
        if u=='/rest/v1/rpc/mod_files':return r.fulfill(json=[])
        return r.fulfill(json=None)
    ctx.route(URL+'/**',api)
    ctx.add_init_script("""localStorage.setItem('dealpin.session',JSON.stringify({access_token:'t',refresh_token:'r',expires_at:Date.now()+36e5,user:{id:'11111111-1111-1111-1111-111111111111'}}));
      if(!localStorage.getItem('dealpin.mods.v1'))localStorage.setItem('dealpin.mods.v1',JSON.stringify({v:1,ledger:[{id:'abcdefghij',at:1,up:1,rev:1,who:'Old friend',amt:20,cur:'USD',dir:'owed',phone:'',note:'',due:'',pay:[]}],stock:[{id:'abcdefghik',at:1,up:1,rev:1,name:'Soap',qty:3}]}));
      addEventListener('securitypolicyviolation',e=>(window.__csp=window.__csp||[]).push(e.violatedDirective+' '+e.blockedURI))""")
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'#/tools');pg.wait_for_selector('h1')
    check('Tools use the online adapter in supabase mode',pg.evaluate("ModStore.where")=='online')
    check('Tools home asks the server for its data',any(c.startswith('/rest/v1/rpc/mod_list') for c in calls))
    t=pg.inner_text('main')
    check('records still on the phone are offered for upload',pg.locator('#adopt').count()==1 and '2 records' in t)
    check('the old "device only" notice is gone',"Saved on this device only" not in t)
    calls.clear();pg.click('#adopt');pg.wait_for_selector('text=2 records uploaded')
    imp=[c for c in calls if c.startswith('/rest/v1/rpc/mod_import')]
    check('upload merges (never replaces) and sends the phone records',len(imp)==1 and '"p_merge":true' in imp[0] and 'Old friend' in imp[0])
    pg.wait_for_timeout(300)
    check('the phone copy is cleared and the card disappears',pg.evaluate("localStorage.getItem('dealpin.mods.v1')")is None and pg.locator('#adopt').count()==0)
    # the form saves through the server
    calls.clear();pg.goto(B+'#/m/ledger/new');pg.wait_for_selector('#mf')
    ids=pg.evaluate("[...document.querySelectorAll('#mf input,#mf select')].map(e=>e.id)")
    check('the ledger form opens',len(ids)>2)
    check('no security policy violations and no script errors',not pg.evaluate("window.__csp||[]") and not errs)
    pg.set_viewport_size({'width':1280,'height':800});pg.goto(B+'#/tools');pg.wait_for_selector('h1')
    check('desktop width: no sideways scrolling',pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    br.close()
finally:
  srv.terminate()
import sys;sys.exit(check.bad)
