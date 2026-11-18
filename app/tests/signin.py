# Sign-in on the app (email code and Google) and the website's Google return, against a fake Supabase.
# Run from the DEALPIN folder: python3 app/tests/signin.py
import subprocess, time, sys, json, hashlib, base64, os
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
H = 'http://localhost:8767'; APP = H + '/app/index.html'; SITE = H + '/index.html'; U = 'https://fake.supabase.co'
def check(n, c):
    print('ok  ' if c else 'FAIL', n)
    if not c: check.bad = 1
check.bad = 0
try:
  with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page(); seen = []
    ctx.route('**/js/config.js', lambda r: r.fulfill(body=f"window.DEALPIN={{mode:'supabase',url:'{U}',anonKey:'sb_publishable_test',errorEndpoint:'',supportEmail:''}};", content_type='application/javascript'))
    def api(r):
        q = r.request; b = q.post_data_json if q.post_data else {}; seen.append((q.url.replace(U, ''), b))
        if '/otp' in q.url: return r.fulfill(status=200, body='{}', content_type='application/json')
        if 'grant_type=pkce' in q.url:
            return r.fulfill(status=200, body=json.dumps({'access_token': 'g-token', 'refresh_token': 'r', 'expires_in': 3600, 'user': {'id': 'u2'}}), content_type='application/json')
        if '/verify' in q.url:
            ok = b.get('token') == '123456'
            return r.fulfill(status=200 if ok else 403, body=json.dumps({'access_token': 'a', 'refresh_token': 'r', 'expires_in': 3600, 'user': {'id': 'u1'}} if ok else {'msg': 'Token has expired or is invalid'}), content_type='application/json')
        return r.fulfill(status=200, body='[]', content_type='application/json')
    ctx.route(U + '/**', api)
    ctx.route(U + '/auth/v1/authorize**', lambda r: r.fulfill(status=200, body='<html>google</html>', content_type='text/html'))
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    # ---- app: email code only, no phone anywhere
    pg.goto(APP + '#/signin'); pg.wait_for_selector('#se')
    check('app sign-in has no phone field', pg.locator('#sp').count() == 0 and pg.locator('#sw').count() == 0)
    check('app sign-in does not mention SMS', 'sms' not in pg.inner_text('body').lower())
    pg.fill('#se', 'not-an-email'); pg.click('#sf button.btn.block')
    check('a bad email is refused before any request', not any('/otp' in u for u, _ in seen))
    pg.fill('#se', ' Me@Example.COM '); pg.click('#sf button.btn.block'); pg.wait_for_selector('#sc')
    o = [b for u, b in seen if '/otp' in u][-1]
    check('email code request carries the lower-cased email only', o.get('email') == 'me@example.com' and 'phone' not in o)
    pg.fill('#sc', '000000'); pg.click('#cf button.btn.block'); pg.wait_for_timeout(500)
    check('a wrong code is refused and the page stays', pg.locator('#sc').is_visible())
    pg.fill('#sc', '123456'); pg.click('#cf button.btn.block')
    [pg.wait_for_timeout(200) for _ in range(25) if not pg.evaluate("!!localStorage.getItem('dealpin.session')")]
    v = [b for u, b in seen if '/verify' in u][-1]
    check('verify uses type email', v.get('type') == 'email' and v.get('email') == 'me@example.com')
    # ---- app Google: starts with PKCE, chooser forced, returns to /app/
    pg.evaluate("localStorage.clear()"); pg.goto(APP + '#/signin'); pg.reload(); pg.wait_for_selector('#gg')
    pg.click('#gg'); pg.wait_for_url('**/auth/v1/authorize**')
    q = parse_qs(urlparse(pg.url).query); ch = q['code_challenge'][0]
    check('app Google start: PKCE, chooser, returns to /app/', q['provider'] == ['google'] and q['code_challenge_method'] == ['s256'] and q['redirect_to'][0] == H + '/app/' and q.get('prompt') == ['select_account'])
    pg.goto(APP + '#/signin'); v1 = pg.evaluate("JSON.parse(localStorage.getItem('dealpin.pkce')).v")
    check('challenge is the SHA-256 of the stored verifier', ch == base64.urlsafe_b64encode(hashlib.sha256(v1.encode()).digest()).decode().rstrip('='))
    pg.goto(APP + '?code=abc123')
    [pg.wait_for_timeout(200) for _ in range(25) if not pg.evaluate("!!localStorage.getItem('dealpin.session')")]
    t = [b for u, b in seen if 'grant_type=pkce' in u][-1]
    check('app exchanges the code with its verifier', t.get('auth_code') == 'abc123' and t.get('code_verifier') == v1)
    check('app saves a session and removes the verifier', pg.evaluate("localStorage.getItem('dealpin.pkce')") is None and pg.evaluate("!!localStorage.getItem('dealpin.session')"))
    # ---- website Google: chooser forced; a return to the website root is finished there and opens the app
    pg.evaluate("localStorage.clear()"); pg.goto(SITE + '#/signin'); pg.wait_for_selector('#a-g')
    pg.click('#a-g'); pg.wait_for_url('**/auth/v1/authorize**')
    q = parse_qs(urlparse(pg.url).query)
    check('website Google: chooser forced, returns to /app/', q.get('prompt') == ['select_account'] and q['redirect_to'][0] == H + '/app/')
    pg.goto(SITE + '#/signin'); v2 = pg.evaluate("JSON.parse(localStorage.getItem('dealpin.pkce')).v")
    pg.goto(SITE + '?code=site123')
    pg.wait_for_url('**/app/**', timeout=8000)
    t = [b for u, b in seen if 'grant_type=pkce' in u][-1]
    check('website return exchanges the code with its verifier', t.get('auth_code') == 'site123' and t.get('code_verifier') == v2)
    check('website return opens the app signed in', 'app/' in pg.url and pg.evaluate("!!localStorage.getItem('dealpin.session')"))
    # ---- a code without a stored verifier is never exchanged
    pg.evaluate("localStorage.clear()"); n = len([1 for u, _ in seen if 'grant_type=pkce' in u])
    pg.goto(SITE + '?code=replayed'); pg.wait_for_timeout(800)
    check('a code without a stored verifier is never exchanged', len([1 for u, _ in seen if 'grant_type=pkce' in u]) == n and pg.evaluate("!localStorage.getItem('dealpin.session')"))
    pg.goto(APP + '?error=access_denied&error_description=Call+this+number'); pg.wait_for_timeout(500)
    check('a crafted error text is not shown', "Call this number" not in pg.inner_text('body'))
    check('no page errors', errs == [] or print(errs))
    br.close()
finally:
    srv.terminate()
sys.exit(check.bad)
