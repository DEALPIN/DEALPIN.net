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

## Step 6: profile photos and the first admin
1. SQL editor: run `app/supabase/setup/6-profile-and-admin.sql`. It adds the profile photo column and the admin tables.
2. Supabase, Authentication, Users, Add user: create YOUR admin login (email + strong password, tick Auto Confirm).
3. Edit the line `CHANGE-ME@example.com` at the bottom of `app/supabase/admin.sql` to that email, and run that file.

## Step 7: crash reports
1. SQL editor: run `app/supabase/setup/7-crash-reports.sql`. The app sends errors to this table. Each row is kept for 90 days.

## Step 8: admin console
1. SQL editor: run `app/supabase/setup/8-admin-console.sql` (after steps 6 and 7).
2. Open `https://YOUR-DOMAIN/admin/`, sign in, then scan the code with an authenticator app. A second step is required for every admin session.
3. The console covers: overview and trends, live activity (updates every 5 seconds), sellers, deals (read-only), products (pause and publish, with a reason), purchase requests, crash reports, the audit trail, admins, and system health.
4. Every change, every admin action and every view of personal data is written to the audit trail. Suspending a seller needs a reason and ends their sessions. Deals cannot be edited, so the verified record stays intact.
5. Run the database checks before going live: `cd app && npm i --no-save @electric-sql/pglite && node tests/admin-backend.test.mjs`.
6. The database is the real lock. Anyone who is not in the admins table, or who has no second factor, gets "Access denied" from every function. The console is marked not to be indexed.

## Website speed
The website is one small bundle (`js/site.js`) and the home page is pre-built into `index.html`. After you edit anything in `src/`, run `node tools/build-site.js` before deploying.
