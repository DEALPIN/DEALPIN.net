# Products, Explore and purchase requests in the browser, with the strict security policy on. Run: python3 tests/products.py
import subprocess,time,sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8766'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
B='http://localhost:8766/index.html'
def check(n,c):
    print('ok  ' if c else 'FAIL',n)
    if not c: check.bad=1
check.bad=0
try:
    with sync_playwright() as p:
        br=p.chromium.launch();ctx=br.new_context()
        ctx.route('**/js/config.js',lambda r:r.fulfill(body="window.DEALPIN={mode:'local',testingBypassAuth:true,url:'',anonKey:'',errorEndpoint:'',supportEmail:''};",content_type='application/javascript'))
        pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
        pg.goto(B+'#/profile');pg.fill('#n','Test Seller Shop');pg.click('text=Save profile');pg.wait_for_selector('text=Hello')
        pg.goto(B+'#/explore');pg.wait_for_selector('text=No published products yet')
        check('Explore starts empty with no sample products',pg.locator('.product-card').count()==0)
        for t,c,pr,st in [('Alpha bag','Bags','20','published'),('Beta shoe','Shoes','10','published'),('Gamma hat','Hats','30','draft')]:
            pg.goto(B+'#/product/new');pg.fill('#pt',t);pg.fill('#pc',c);pg.fill('#pp',pr);pg.select_option('#pstatus',st);pg.click('button:has-text("Save product")');pg.wait_for_selector('text=Edit product')
        pg.goto(B+'#/product/new');pg.wait_for_selector('#pt')
        check('product form has no placeholder text',pg.evaluate("()=>['#pt','#pd','#pc'].every(s=>!document.querySelector(s).getAttribute('placeholder'))"))
        pg.goto(B+'#/explore');pg.wait_for_selector('.product-card')
        check('only published products appear',pg.locator('.product-card').count()==2)
        check('categories come from real listings',pg.locator('[data-cat]').count()==3)
        pg.click('[data-cat="Shoes"]');check('category filter works',pg.locator('.product-card').count()==1 and 'Beta shoe' in pg.inner_text('#explore-grid'))
        pg.click('[data-cat=""]');pg.select_option('#explore-sort','price-low')
        check('price sort works',pg.locator('.product-card h2').first.inner_text()=='Beta shoe')
        pg.fill('#explore-search','zzz');check('no-match state',pg.locator('text=No products match').count()==1)
        pg.fill('#explore-search','');pg.click('.product-card h2 a >> nth=0')
        pg.wait_for_selector('#product-request-form')
        pg.fill('#buyer-name','Ann');pg.fill('#buyer-phone','+15551234567');pg.fill('#request-qty','0')
        pg.click('button:has-text("Send purchase request")')
        check('quantity 0 is refused, not turned into 1',pg.locator('text=REQUEST SENT').count()==0)
        pg.fill('#request-qty','2');pg.click('button:has-text("Send purchase request")');pg.wait_for_selector('text=Request submitted')
        pg.click('text=View request status');pg.wait_for_selector('#buyer-withdraw')
        check('buyer can see a withdraw option while pending',pg.locator('#buyer-withdraw').count()==1)
        pg.goto(B+'#/products');pg.wait_for_selector('[data-req-counter]');pg.click('[data-req-counter]')
        pg.fill('#mi','8');pg.click('#mok');pg.wait_for_selector('text=Waiting for buyer to respond')
        req=pg.evaluate("JSON.parse(localStorage.getItem('dealpin.v1')).requests[0].id")
        pg.goto(B+'#/request/'+req);pg.wait_for_selector('#buyer-accept-counter');pg.click('#buyer-accept-counter');pg.wait_for_selector('text=accepted')
        pg.goto(B+'#/products');pg.wait_for_selector('[data-req-convert]');pg.click('[data-req-convert]');pg.click('#mok');pg.wait_for_url('**#/deal/*')
        deal=pg.evaluate("JSON.parse(localStorage.getItem('dealpin.v1')).deals[0]")
        check('accepted counter converts to a deal priced offer x quantity (8 x 2)',deal['price']==16)
        check('no page or CSP errors during the whole flow',not errs)
        if errs: print(errs[:3])
        br.close()
finally:
    srv.terminate()
sys.exit(check.bad)
