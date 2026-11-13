# Dealpin 1.0 (frontend + Supabase backend)

Proof for chat sales. A seller makes a deal link, the buyer agrees on their phone, a rider confirms handover with a code,
and the buyer gets a signed receipt. Plain HTML, CSS and JavaScript. No build step. Installs as a PWA and runs in a WebView.

## What is in the box
- Deals: seller, buyer and rider links (separate secret tokens), receipts with a server-signed code, ratings, disputes, public seller page.
- Tools: deliveries and riders, ledger, invoices, stock, group orders. Synced online per seller in supabase mode, on this device in local mode. See docs/BACKEND.md.
- Business Autopilot: customer CRM, sales pipeline, inventory, purchase orders, stock movement ledger, suppliers, tasks, internal workflows, expenses, branches, team directory, branch-scoped invitations, operational insights and workspace audit. Every capability is available to all businesses.
- Sign-in: Google, email code, or phone SMS code. All three are in js/auth.js and the sign-in screen.
- Any country and currency. Amounts are stored in each currency's smallest unit. Buyer-facing flows support English, Luganda and Kiswahili; Settings includes a shared seller/Tools vocabulary. Seller/Tools translations are partial and require native-speaker review.
- Security: strict Content Security Policy (no inline scripts or styles), security headers (_headers, vercel.json), all deal changes
  made by server functions, row level security, rate limits, no secret keys in the app.

## Files
- index.html, css/, icons/, manifest.webmanifest, sw.js (offline shell), _headers, vercel.json
- js/config.js        the only file to edit before publishing: mode, project url, public key
- js/auth.js          session, Google (PKCE), email code, SMS code
- js/supabase-store.js, js/supabase-mods.js, js/store.js, js/mods-core.js, js/autopilot.js   online and on-device data layers
- js/mods-*.js        Tools
- supabase/schema.sql, storage.sql, phase-two to phase-five and setup/17-business-autopilot.sql, setup/18-stock-ledger-purchasing.sql and setup/19-stock-reservations-valuation.sql   database and file storage rules
- docs/BACKEND.md     what the backend must still do for Tools
- docs/AUTH.md        sign-in setup
- tools/predeploy.js  checks config before you publish
- tests/              see Tests

- Trust Score and Verified badge (free for every seller): computed by supabase/setup/16-trust.sql from real deal records; js/trust.js displays the same rules on Home, Seller Profile, buyer links, receipts, receipt verification, public seller pages and product pages. Explore ranks products by the seller trust score. There are no paid tiers, subscription pages, Pro checkout or feature paywalls. Existing buyer-to-seller payment recording is not a Dealpin fee or subscription payment.

## Setup, in order
1. Create a Supabase project (try a staging one first).
2. SQL editor: create the private secret table. The exact lines are in the header of supabase/schema.sql.
   (Supabase does not allow custom database settings, so the receipt secret lives in private.app_secrets.)
3. SQL editor (easiest: run supabase/setup/00-ALL-IN-ONE.sql, then setup/5-verify.sql; the rest of this line is the older manual way): run supabase/schema.sql, storage.sql, phase-two-products.sql, phase-three-requests.sql, phase-four-requests-online.sql, then phase-five-tools-sync.sql. If your phone editor cuts the paste off, run them in smaller pieces
   and make sure each piece ends where the file says; a half-pasted function fails with "unterminated dollar-quoted string".
3b. SQL editor: on an existing installation, run supabase/setup/16-trust.sql if not already applied, then run supabase/setup/17-business-autopilot.sql, supabase/setup/18-stock-ledger-purchasing.sql and supabase/setup/19-stock-reservations-valuation.sql. Paste supabase/verify.sql and run it. Every row must say true (the last row is ALL CHECKS PASSED), including the Trust Score checks. A false row names what is missing or too open. Run it again after any later SQL change. For high-volume workspaces, also apply `supabase/setup/23-scale-readiness.sql` and use the bounded Autopilot page API it installs. Back up production before applying any SQL update; do not rerun the all-in-one installer on a live database.
4. js/config.js: mode 'supabase', your project URL and the publishable (anon) key. Never put a secret or service_role key here.
5. Sign-in: follow docs/AUTH.md.
6. Host the folder over https (Cloudflare Pages/Workers, Netlify or Vercel). _headers and vercel.json carry the security headers.
7. Supabase, Authentication, URL Configuration: set Site URL and Redirect URLs to your hosted address.
8. Run `node tools/predeploy.js`.
9. Test one whole deal on two phones before sharing the link.

## Tests (run from this folder)
- node tests/store.test.js, trust.test.js, region.test.js, supabase-store.test.js, mods.test.js, autopilot.test.js, autopilot-store.test.js, frontend.test.js
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

## Business Autopilot (free for every business)
- Business Autopilot is included for every authenticated seller: customer CRM, sales opportunities/pipeline, inventory records and low-stock view, append-only stock movement ledger, supplier-linked purchase orders and receiving, suppliers, tasks, internal automation rules, expenses, branches, staff directory, team invitations, operational insights, command-centre dashboard and JSON export.
- There are no subscriptions, paid tiers, feature paywalls, billing screens, premium entitlements, record-count quotas or upgrade prompts in Dealpin. The Autopilot data model contains no billing or subscription tables.
- Online setup: run `supabase/setup/17-business-autopilot.sql` and then `supabase/setup/18-stock-ledger-purchasing.sql` after the existing setup (steps 1-16). New installations can use the updated `supabase/setup/00-ALL-IN-ONE.sql`, then run the existing verification scripts. Back up production and test the migration on staging first.
- Autopilot uses a private workspace, active membership roles, server-side RPC authorization and audit events. Team invitation links are created by an owner/administrator and must be shared with the intended email recipient; the recipient must sign in using that email to accept.
- Local mode stores Autopilot data only in that browser/device. Online mode stores it in the configured Supabase workspace. Use export to retain a portable JSON copy.
- Current automation actions create internal tasks, alerts and follow-up drafts. New-enquiry rules run when an opportunity is saved; due-opportunity and low-stock rules are checked when the business dashboard opens. They are not yet unattended scheduled background jobs. The interface does not claim to send SMS, WhatsApp or email automatically. External delivery requires a separately configured and verified provider, customer permission and applicable policy compliance. Predictive AI is not fabricated: the current Insights page uses transparent rules over recorded data; a real AI provider integration remains a separately configured capability.
- The current release provides business workspaces, branch records, staff directory and invitation-based membership. It does not yet implement full branch-level data partitioning, complete payroll/accounting, tax filing, supplier payment processing, external messaging delivery, or autonomous AI actions. Those require dedicated production workflows and integrations before being represented as complete.

## Business Autopilot phase 2

- `supabase/setup/18-stock-ledger-purchasing.sql` adds an append-only stock movement ledger, idempotent stock adjustments and purchase-order receiving. Run it after step 17 on an existing database. `supabase/setup/19-stock-reservations-valuation.sql` adds reservations, controlled fulfilment, release and indicative stock valuation; run it after step 18.
- Purchase orders are workspace records. Receiving an order updates physical stock and writes a stock receipt movement in one database transaction; a received order cannot be received again.
- Manual stock movements are validated server-side, reject negative physical stock and are attributed to the authenticated member. The ledger is available to authorized workspace roles only.
- All of these capabilities remain free and have no subscription or paid-feature gate.

## Daily Command Center

Dealpin now opens into a daily operating layer built entirely from the user’s real records. The Command Center answers what needs attention right now, links directly to the responsible record, groups work into urgent/today/next, remembers the last meaningful workspace, and maintains relationship memory from recorded buyers and CRM records. The Universal Inbox is derived from deals, payments, delivery state, CRM follow-ups, tasks, inventory, purchasing and reservations. No sample data is seeded.
