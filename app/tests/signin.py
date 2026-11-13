# Sign-in by email code and by phone code, against a fake Supabase. Run from the dealpin folder: python3 tests/signin.py
import subprocess,time,sys,json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8767'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
B='http://localhost:8767/index.html';U='https://fake.supabase.co'
def check(n,c):
    print('ok  ' if c else 'FAIL',n)
    if not c: check.bad=1
check.bad=0
try:
  with sync_playwright() as p:
    br=p.chromium.launch();ctx=br.new_context(viewport={'width':390,'height':844});pg=ctx.new_page();seen=[]
    ctx.route('**/js/config.js',lambda r:r.fulfill(body=f"window.DEALPIN={{mode:'supabase',url:'{U}',anonKey:'sb_publishable_test',errorEndpoint:'',supportEmail:''}};",content_type='application/javascript'))
    def api(r):
        q=r.request;b=q.post_data_json if q.post_data else {};seen.append((q.url.replace(U,''),b))
        if '/otp' in q.url:return r.fulfill(status=200,body='{}',content_type='application/json')
        if '/verify' in q.url:
            ok=b.get('token')=='123456'
            return r.fulfill(status=200 if ok else 403,body=json.dumps({'access_token':'a','refresh_token':'r','expires_in':3600,'user':{'id':'u1'}} if ok else {'msg':'Token has expired or is invalid'}),content_type='application/json')
        return r.fulfill(status=200,body='[]',content_type='application/json')
    ctx.route(U+'/**',api)
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(B+'#/signin');pg.wait_for_selector('#sp')
    check('phone is the first option',pg.locator('#sp').is_visible() and not pg.locator('#se').is_visible())
    pg.click('#sw');check('can switch to email',pg.locator('#se').is_visible() and not pg.locator('#sp').is_visible())
    pg.fill('#se','not-an-email');pg.click('#sf button.btn.block');check('a bad email is refused before any request',not any('/otp' in u for u,_ in seen) and pg.locator('[aria-invalid="true"]').count()==1)
    pg.fill('#se',' Me@Example.COM ');pg.click('#sf button.btn.block');pg.wait_for_selector('#sc')
    o=[b for u,b in seen if '/otp' in u][0];check('the email code request carries the lower-cased email only',o.get('email')=='me@example.com' and 'phone' not in o)
    pg.fill('#sc','000000');pg.click('#cf button.btn.block');pg.wait_for_timeout(500)
    check('a wrong code is refused and the page stays',pg.locator('#sc').is_visible())
    pg.fill('#sc','123456');pg.click('#cf button.btn.block');[pg.wait_for_timeout(200) for _ in range(25) if not pg.evaluate("!!localStorage.getItem('dealpin.session')")]
    v=[b for u,b in seen if '/verify' in u][-1];check('verify uses type email',v.get('type')=='email' and v.get('email')=='me@example.com')
    pg.evaluate("localStorage.clear()");pg.goto(B+'#/signin');pg.wait_for_selector('#sp');pg.fill('#sp','+256 700 000 001');pg.click('#sf button.btn.block');pg.wait_for_selector('#sc')
    o=[b for u,b in seen if '/otp' in u][-1];check('phone sign-in still sends an international number',o.get('phone')=='+256700000001' and 'email' not in o)
    # ---- Google (PKCE): start, then come back with a code
    import hashlib,base64
    from urllib.parse import urlparse,parse_qs
    def pkce(r):
        if 'grant_type=pkce' in r.request.url:
            seen.append((r.request.url.replace(U,''),r.request.post_data_json))
            return r.fulfill(status=200,body=json.dumps({'access_token':'g-token','refresh_token':'r','expires_in':3600,'user':{'id':'u2'}}),content_type='application/json')
        return api(r)
    ctx.unroute(U+'/**');ctx.route(U+'/**',pkce)
    ctx.route(U+'/auth/v1/authorize**',lambda r:r.fulfill(status=200,body='<html>google</html>',content_type='text/html'))
    pg.evaluate("localStorage.clear()");pg.goto(B+'#/signin');pg.reload();pg.wait_for_selector('#gg')
    pg.click('#gg');pg.wait_for_url('**/auth/v1/authorize**')
    q=parse_qs(urlparse(pg.url).query);ch=q['code_challenge'][0]
    check('Google start asks for PKCE and returns to this site',q['provider']==['google'] and q['code_challenge_method']==['s256'] and q['redirect_to'][0]=='http://localhost:8767/')
    pg.goto(B)  # same browser, back from Google
    v=pg.evaluate("JSON.parse(localStorage.getItem('dealpin.pkce')).v")
    check('the challenge is the SHA-256 of the stored verifier (base64url, no padding)',ch==base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).decode().rstrip('='))
    pg.goto('http://localhost:8767/index.html?code=abc123');[pg.wait_for_timeout(200) for _ in range(25) if not pg.evaluate("!!localStorage.getItem('dealpin.session')")]
    t=[b for u,b in seen if 'grant_type=pkce' in u][-1]
    check('the code is exchanged together with the verifier',t.get('auth_code')=='abc123' and t.get('code_verifier')==v)
    check('a real session is saved',pg.evaluate("JSON.parse(localStorage.getItem('dealpin.session')).access_token")=='g-token')
    check('the verifier is used once and removed',pg.evaluate("localStorage.getItem('dealpin.pkce')")is None)
    check('the code is removed from the address','code=' not in pg.url)
    pg.evaluate("localStorage.clear()");n=len([1 for u,_ in seen if 'grant_type=pkce' in u])
    pg.goto('http://localhost:8767/index.html?code=replayed');pg.wait_for_timeout(800)
    check('a code without a stored verifier is never exchanged',len([1 for u,_ in seen if 'grant_type=pkce' in u])==n and pg.evaluate("!localStorage.getItem('dealpin.session')"))
    pg.goto('http://localhost:8767/index.html?error=access_denied&error_description=Call+this+number');pg.wait_for_timeout(500)
    check('a crafted error text is not shown',"Call this number" not in pg.inner_text('body'))
    check('no page errors',errs==[] or print(errs))
    br.close()
finally: srv.terminate()
sys.exit(check.bad)
