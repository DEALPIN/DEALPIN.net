# Deploying DEALPIN

1. Upload this whole folder to Cloudflare Pages, Netlify or Vercel (static site, no build command, output folder = this folder).
2. Website pages use `#/page` links, so no server rewrite rules are needed.
3. BEFORE real users: the app in `app/` still ships in test mode. Edit `app/js/config.js`: set `mode:'supabase'` and `testingBypassAuth:false`,
   follow `app/README.md` (SQL files, sign-in), then run `cd app && node tools/predeploy.js`. In test mode data stays on each person's own device.
4. In Supabase Authentication, set Site URL and Redirect URLs to `https://your-domain/app/`.
5. Optional: add your domain to `robots.txt` as a Sitemap line once you have one.

## Cloud mode is ON (Supabase)
Sign-in happens on the website (`#/signin`). After Google or an email code, people land in `/app/`.
Do these once in Supabase (project kvydbbfcjouxlskmhvif), details in `app/docs/AUTH.md`:
1. SQL editor: paste `app/supabase/setup/00-ALL-IN-ONE.sql` and run it, then paste `setup/5-verify.sql` (every row must say true). It is safe to run again. If your phone editor cuts the paste off, run `1-core.sql`, `2-products.sql`, `3-requests.sql`, `4-tools.sql` in that order instead.
2. Authentication > URL Configuration: Site URL `https://YOUR-DOMAIN`. Redirect URLs: `https://YOUR-DOMAIN/**`.
3. Providers: turn on Google (Client ID and secret from Google Cloud; its redirect URI is the Supabase callback) and Email.
4. Email templates must include `{{ .Token }}`. Add custom SMTP before launch, because Supabase's built-in sender is limited.
5. Publish the Google consent screen so everyone can sign in, then run `cd app && node tools/predeploy.js`.

## Step 6: profile photos and the super admin console
1. SQL editor: run `app/supabase/setup/6-profile-and-admin.sql`. It adds the profile photo column and the admin functions.
2. Supabase, Authentication, Users, Add user: create YOUR admin login (email + strong password, tick Auto Confirm). Use an email only you control.
3. Edit the line `CHANGE-ME@example.com` at the bottom of the same SQL file to that email and run the file again. That makes you the only admin.
4. Open `https://YOUR-DOMAIN/ops-q8m4x2/` and sign in with that email and password. The page is not linked anywhere, is hidden from search engines, and signs you out after 15 minutes idle.
   Rename the folder `ops-q8m4x2` to something private if you like, and change it in `_headers` and `vercel.json` too.
   The real lock is the database: anyone else who signs in gets "Sign-in failed", and the admin functions refuse them. Turn on MFA for your admin user in Supabase if you can.
5. Google profile photos need `https://lh3.googleusercontent.com` in img-src (already added to the app, `_headers` and `vercel.json`).

## Website speed
The website is one small bundle (`js/site.js`) and the home page is pre-built into `index.html`. After you edit anything in `src/`, run `node tools/build-site.js` before deploying.
