# Dealpin 1.0 (frontend + Supabase backend)

Proof for chat sales. A seller makes a deal link, the buyer agrees on their phone, a rider confirms handover with a code,
and the buyer gets a signed receipt. Plain HTML, CSS and JavaScript. No build step. Installs as a PWA and runs in a WebView.

## What is in the box
- Deals: seller, buyer and rider links (separate secret tokens), receipts with a server-signed code, ratings, disputes, public seller page.
- Tools: deliveries and riders, ledger, invoices, stock, group orders. Synced online per seller in supabase mode, on this device in local mode. See docs/BACKEND.md.
- Sign-in: Google, email code, or phone SMS code. All three are in js/auth.js and the sign-in screen.
- Any country and currency. Amounts are stored in each currency's smallest unit. Buyer-facing flows support English, Luganda and Kiswahili; Settings includes a shared seller/Tools vocabulary. Seller/Tools translations are partial and require native-speaker review.
- Security: strict Content Security Policy (no inline scripts or styles), security headers (_headers, vercel.json), all deal changes
  made by server functions, row level security, rate limits, no secret keys in the app.

## Files
- index.html, css/, icons/, manifest.webmanifest, sw.js (offline shell), _headers, vercel.json
- js/config.js        the only file to edit before publishing: mode, project url, public key
- js/auth.js          session, Google (PKCE), email code, SMS code
- js/supabase-store.js, js/supabase-mods.js, js/store.js, js/mods-core.js   online and on-device data layers
- js/mods-*.js        Tools
- supabase/schema.sql, storage.sql, phase-two to phase-five   database and file storage rules
- docs/BACKEND.md     what the backend must still do for Tools
- docs/AUTH.md        sign-in setup
- tools/predeploy.js  checks config before you publish
- tests/              see Tests

## Setup, in order
1. Create a Supabase project (try a staging one first).
2. SQL editor: create the private secret table. The exact lines are in the header of supabase/schema.sql.
   (Supabase does not allow custom database settings, so the receipt secret lives in private.app_secrets.)
3. SQL editor (easiest: run supabase/setup/00-ALL-IN-ONE.sql, then setup/5-verify.sql; the rest of this line is the older manual way): run supabase/schema.sql, storage.sql, phase-two-products.sql, phase-three-requests.sql, phase-four-requests-online.sql, then phase-five-tools-sync.sql. If your phone editor cuts the paste off, run them in smaller pieces
   and make sure each piece ends where the file says; a half-pasted function fails with "unterminated dollar-quoted string".
3b. SQL editor: paste supabase/verify.sql and run it. Every row must say true (the last row is ALL CHECKS PASSED). A false row names what is missing or too open. Run it again after any later SQL change.
4. js/config.js: mode 'supabase', your project URL and the publishable (anon) key. Never put a secret or service_role key here.
5. Sign-in: follow docs/AUTH.md.
6. Host the folder over https (Cloudflare Pages/Workers, Netlify or Vercel). _headers and vercel.json carry the security headers.
7. Supabase, Authentication, URL Configuration: set Site URL and Redirect URLs to your hosted address.
8. Run `node tools/predeploy.js`.
9. Test one whole deal on two phones before sharing the link.

## Tests (run from this folder)
- node tests/store.test.js, region.test.js, supabase-store.test.js, mods.test.js, frontend.test.js
- npm i --no-save @electric-sql/pglite && node tests/schema.test.mjs && node tests/requests.test.mjs && node tests/mods-online.test.mjs && node tests/verify.test.mjs   (database rules on a real Postgres engine)
- python3 tests/flow.py, audit.py, tools.py, tools-online.py, signin.py, products.py   (browser tests; need playwright and chromium)

## Honest limits
- Not yet run end to end with real phones on a live project. The database rules were tested on a local Postgres engine with stand-ins
  for Supabase auth and storage. Storage uploads and Google sign-in are untested on real Supabase until you do the two-phone test.
- Tools sync has only run on a local Postgres engine (with stand-ins for Supabase auth and storage), never on a live project. Tools records are private to one seller: no sharing links, and the delivery handover code is still checked on the phone, not the server (docs/BACKEND.md).
- Dealpin records proof. It does not hold money and has no escrow. Keep wording to what is true.
- Seller and Tools localization is partial: common shell, dashboard, catalogue and action vocabulary is translated, while many feature-specific labels and longer operational messages still fall back to English. Luganda and Kiswahili copy needs native-speaker review.
- No independent screen-reader test, outside security review or legal review has been completed. The terms text is a draft for a lawyer to check. Browser automation must be run in a normal browser environment before release.
- Email codes need your own email sender (SMTP) for real use; Supabase's default sender is for testing only.
- Google sign-in does not work inside a plain WebView APK (Google blocks it). It works in browsers and the PWA. See docs/AUTH.md.
- SMS codes cost money per message and need a sender that works in your country.


## Phase One application shell

This update introduces the five-destination app shell: Home, Explore, Create, Deals and Products. Profile is accessed from the top-right header. The shell uses unified light/dark surfaces, safe-area-aware header and bottom navigation, a contextual Create sheet, and adaptive compact desktop navigation.

## Phase Two product management

- Seller catalogue with published, draft and paused filters, search, edit and delete.
- Product editor with name, description, category, price, currency, up to five resized photos, availability and listing status.
- Published/available listings appear in public Explore and receive a public share page (`#/p/<product-id>`).
- Product records are separate from deals. This phase does not add buyer purchase requests, negotiation, checkout, payment processing, inventory quantities or delivery integration.
- Local mode stores products on the current device only. Use Supabase mode for public cross-device product pages.
- Apply `supabase/phase-two-products.sql` after the existing `schema.sql` and `storage.sql` on a staging project, then test publishing and public access before deploying. Do not run a migration against a production project without a backup and review.

## Phase Four online purchase requests

- Apply `supabase/phase-four-requests-online.sql` last, after schema.sql, storage.sql, phase-two-products.sql and phase-three-requests.sql (staging first, with a backup).
- A buyer's status link is `#/request/<request id><private token>`. It is the only way for the buyer to check, answer a counter-offer or withdraw, because buyers have no account. Anyone with the link can see that request.
- The sign-in bypass is still on (`testingBypassAuth:true`, mode `local`). Before going live set mode to `supabase`, set `testingBypassAuth:false`, and run `node tools/predeploy.js`, which refuses a live config with the bypass on.
- Not verified on a live Supabase project: the new SQL ran on a local Postgres engine with stand-ins for Supabase auth and storage.


## Frontend hardening release 1.2.1
- The testing-mode notice is removed. The sign-in bypass remains enabled for local staging only.
- Settings includes the interface-language selector. Luganda and Kiswahili shared vocabulary is available across the shell and common seller/catalogue actions; feature-specific wording may remain English.
- The Create dialog traps keyboard focus, supports Escape, restores focus, exposes its expanded state and respects safe areas.
- Keyboard focus and narrow-screen overflow safeguards have been strengthened.
- The local config intentionally remains `mode:'local'` with `testingBypassAuth:true`; do not treat this as a live multi-device deployment.
