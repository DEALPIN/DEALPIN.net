# Full deal, start to verified, with the strict security policy switched on. Run from the dealpin folder:
#   python3 tests/flow.py      (needs: pip install playwright; playwright install chromium)
import subprocess,time,sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8765'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
B='http://localhost:8765/index.html'
def check(n,c):
    print('ok  ' if c else 'FAIL',n)
    if not c: check.bad=1
check.bad=0
WATCH="window.__csp=[];addEventListener('securitypolicyviolation',e=>__csp.push(e.violatedDirective+' '+e.blockedURI))"
try:
    with sync_playwright() as p:
        br=p.chromium.launch();ctx=br.new_context();ctx.route('**/js/config.js',lambda r:r.fulfill(body="window.DEALPIN={mode:'local',url:'',anonKey:'',errorEndpoint:'',supportEmail:''};",content_type='application/javascript'));ctx.add_init_script(WATCH);pg=ctx.new_page();pg.on('dialog',lambda d:d.dismiss())
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
        pg.goto(B+'#/profile');pg.fill('#n','Test Seller Shop');pg.fill('#pa','0772000000');pg.click('text=Save profile')
        pg.goto(B+'#/new');pg.fill('#t','Red sneakers');pg.fill('#p','85000');pg.click('button:has-text("Create deal link")')
        pg.wait_for_selector('input[readonly]');did=pg.url.split('/deal/')[1]
        deal=pg.evaluate("JSON.parse(localStorage.getItem('dealpin.v1')).deals[0]");bt,rt=deal['bt'],deal['rt']
        pg.goto(B+'#/new');pg.fill('#t','Double tap');pg.fill('#p','10.5');pg.evaluate("()=>{const f=document.querySelector('#f');f.requestSubmit();f.requestSubmit();f.requestSubmit()}");pg.wait_for_selector('input[readonly]');pg.wait_for_timeout(300)
        check('submitting a form several times creates only one deal',pg.evaluate("JSON.parse(localStorage.getItem('dealpin.v1')).deals.length")==2)
        pg.goto(B+'#/deal/'+did)
        check('buyer link holds a long random token, not the deal id',pg.input_value('input[readonly]').endswith('#/d/'+bt) and len(bt)==32 and bt!=did)
        check('QR shown on new deal',pg.locator('.qr svg').count()==1)
        pg.goto(B+'#/d/'+did);pg.wait_for_selector('text=not available');check('the deal id alone does not open the buyer page',pg.locator('#n').count()==0)
        pg.goto(B+'#/g/'+bt);pg.wait_for_selector('text=not available');check('a buyer link does not open the rider page',True)
        pg2=ctx.new_page();pg2.goto(B+'#/d/'+bt);pg2.fill('#n','Sam');pg2.fill('#ph','0701000000');pg2.fill('#lm','Red gate');pg2.click('button:has-text("Agree to this deal")')
        pg2.wait_for_selector('text=You agreed');check('buyer sees seller payment number','0772000000' in pg2.content());pg2.close()
        pg.goto(B+'#/deal/'+did);pg.wait_for_selector('#sh',timeout=6000);check('seller page shows the agreed deal',True)
        check('the deal keeps its own currency and shows cents correctly',deal['currency']=='USD' and '$85,000.00' in pg.inner_text('main'))
        pg.click('#sh');pg.wait_for_selector('dialog #mok');pg.click('dialog #mok');pg.wait_for_selector('text=On the way')
        pg.goto(B+'#/deal/'+did);pg.wait_for_selector('#cr');check('seller page offers a separate rider link after shipping',True)
        pg.goto(B+'#/d/'+bt);pg.wait_for_selector('b.code');code=pg.inner_text('b.code')
        pg.goto(B+'#/g/'+rt);pg.wait_for_selector('#hc')
        check('rider page does not show the handover code',code not in pg.inner_text('main'))
        pg.fill('#hc','0000x');pg.click('text=Confirm handover');check('wrong handover code rejected',pg.locator('text=Handover confirmed').count()==0)
        pg.fill('#hc',code);pg.click('text=Confirm handover');pg.wait_for_selector('text=Handover confirmed')
        pg.goto(B+'#/d/'+bt);pg.click('#rv');pg.wait_for_selector('dialog #mok');pg.click('dialog #mok');pg.wait_for_selector('text=Verified')
        pg.click('.tab[data-n="5"]');pg.click('button:has-text("Send rating")');pg.wait_for_selector('text=Your rating')
        pg.goto(B+'#/r/'+did);pg.wait_for_selector('text=Receipt code');check('receipt has code and QR',pg.locator('.qr svg').count()==1)
        check('receipt hides the buyer phone and the handover code','0701000000' not in pg.content() and code not in pg.inner_text('main'))
        pg.goto(B+'#/u/test-seller-shop');check('public record shows rating','5 ★' in pg.content() or '5 ★' in pg.content())
        pg.goto(B+'#/settings');pg.wait_for_selector('text=Version 1.2.1');check('settings shows the new version',True)
        check('no page errors',not errs)
        check('no security policy violations on any page',pg.evaluate('window.__csp').__len__()==0)
        br.close()
finally: srv.terminate()
sys.exit(check.bad)
