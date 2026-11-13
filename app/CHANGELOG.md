## 1.33.4 — service worker dealpin-v69 (new slogan)

- New slogan everywhere: "Sell in chat. Prove every deal. Run your business." The browser title is now just "Dealpin".

## 1.33.3 — service worker dealpin-v68 (wording)

- Settings card "What Dealpin is" now describes what Dealpin does, in positive terms.

## 1.33.2 — service worker dealpin-v67 (navigation and greeting)

- Switching tabs while a screen is still loading no longer shows the old screen. Only the latest tap is drawn.
- Home greeting includes your first name, for example "Good evening, Sarah."

## 1.33.1 — service worker dealpin-v66 (repair pass)

- Home screen loads again (Daily Command read a missing default and failed).
- Bottom navigation: Inbox replaced by Explore. The Universal inbox stays on the bell at the top of the screen.
- Buyer counter-offer actions (accept, decline, withdraw) no longer fail validation.
- Trust bars render under the strict content security policy (no inline style attributes).
- SQL: the all-in-one bundle (00-ALL-IN-ONE.sql) is rebuilt from steps 1-4, 6-23 and FIX-permissions. Its autopilot step had an invalid FOREACH line, now fixed in 17-business-autopilot.sql.
- Tests updated to current versions and IDs; all 20 test files pass.


## Update 9 — Secrets, Configuration & Deployment Hardening
- Added deployment-time scans for packaged private-key/high-risk secret patterns.
- Added checks that production security headers are present in `_headers` and `vercel.json`.
- Added no-store caching for `app/js/config.js` so deployment configuration is not retained by intermediary caches.
- Added a deployment `.gitignore` for environment files and private keys.
- Added `SECURITY-DEPLOYMENT.md` with production secret, redirect, HTTPS and staging guidance.
# Changelog

## 1.33.0 — service worker dealpin-v64 — Daily Command Center and unified daily habit engine
- Replaced the seller Home experience with a Daily Command Center built from the workspace’s real records.
- Added the killer daily question: “What needs your attention?” with urgency-ranked work across deals, payments, deliveries, CRM follow-ups, tasks, inventory, purchasing and reservations.
- Added Universal Inbox with unread/read state, urgent/today/next grouping, direct action links and Activity history.
- Added “Continue where you left off” using the user’s last meaningful workspace route on that device; no sample or placeholder destination is created.
- Added a daily check-in streak and operating plan to make Dealpin a repeat daily workspace rather than a one-off transaction tool.
- Added Relationship Memory: customers are automatically assembled from recorded buyers and CRM records, with deal history, recorded value, open work and a relationship timeline.
- Connected existing Dealpin transaction, delivery, payment, inventory, purchasing, CRM, task and automation capabilities into one navigation and action loop instead of adding another isolated module.
- Added Universal Inbox navigation and promoted it to the header notification control.
- Added responsive Daily Command Center, Inbox and Relationship Memory UI for phone, tablet and desktop.
- No demo data, sample records, fake metrics, hardcoded customer information or paid gates were introduced.


## 1.32.0 — service worker dealpin-v61 — Stock reservations and valuation, free for everyone
- Added workspace-scoped stock reservations with unique references, available-quantity validation, release and fulfilment workflows.
- Fulfilment atomically releases reserved quantity, reduces physical stock and writes a sale movement to the stock ledger.
- Protected reserved quantities from direct record editing; changes must pass through the reservation workflow.
- Added indicative on-hand inventory valuation by recorded unit cost, with currency kept separate and the method clearly disclosed as an estimate (not FIFO or weighted-average accounting).
- Added Reservations workspace screen, exportable reservation records, Supabase RPCs and migration `supabase/setup/19-stock-reservations-valuation.sql`.
- All capabilities remain free, with no subscriptions, billing, paid gates or usage quotas.


## 1.31.0 — service worker dealpin-v60 — Stock ledger and purchasing, free for everyone
- Added an append-only, workspace-scoped stock movement ledger with server-side validation, idempotency protection, actor attribution and negative-stock prevention.
- Added purchase orders linked to suppliers and inventory items; receiving an order atomically updates stock, creates a stock receipt movement and prevents duplicate receipt.
- Added the Purchasing and Stock Ledger workspace screens, manual stock movement capture, export support and online Supabase RPC integration.
- Added migration `supabase/setup/18-stock-ledger-purchasing.sql` and expanded database verification.
- All Autopilot and enterprise capabilities remain free. No subscriptions, billing, paid gates, feature quotas or upgrade prompts.

## 1.30.0 — service worker dealpin-v59 — Business Autopilot, free for everyone
- Added Business Autopilot workspace: customer CRM, opportunity pipeline, inventory, suppliers, tasks, automation rules, expenses, branches, staff roster, operational insights and command-centre dashboard.
- Added JSON export, record editing/deletion, responsive workspace navigation and internal workflow setup.
- Added Supabase workspace, membership, role checks, audit history and invitation/acceptance RPCs in `supabase/setup/17-business-autopilot.sql`.
- All capabilities are free. No subscriptions, paid tiers, feature paywalls, billing, premium entitlements, quotas or upgrade prompts were introduced.
- Existing marketplace, deal records, payment recording between buyer and seller, Trust Score and Verified badge are preserved.
- External messaging and predictive AI are not represented as live integrations until providers are configured. Current insights are transparent rules over recorded data.

## 1.29.0 — service worker dealpin-v58 (free trust release hardening)

- All marketplace features in this release are available without a Dealpin subscription, Pro plan, premium tier or paywall. No subscription checkout or paid-plan entitlement is introduced.
- Seller Profile now uses the same server-calculated Trust Score and Verified badge as Home and public pages; deal-count totals can no longer be mistaken for a Verified seller status.
- Receipts show the complete trust line, including the honest new-seller state, and link directly to the seller's public record when a handle exists.
- Existing seller-to-buyer payment recording and confirmation remain unchanged; Dealpin does not collect or process the buyer's payment.
- Service worker cache bumped so returning devices can fetch the updated frontend.

## 1.28.0 — service worker dealpin-v57 (Trust Score, free for everyone)

- Trust Score out of 100 and a Verified seller badge, free for every seller. No payment, no plans, no subscription.
- Built by the database from real deals only: completed deals 25, buyer ratings 30, no disputes 25, shipping within 2 days 20. Nothing shows until a seller has 5 completed deals. Score 70 or more earns Verified.
- Shown on the buyer deal link, receipts, receipt check, public seller page and product pages. Explore now sorts "Most trusted first" by default.
- Home has a Trust Score card with progress and a copy/share link for the seller's shop page (#/u/handle).
- English, Luganda and Kiswahili text for the new screens (needs native-speaker review).
- Run app/supabase/setup/16-trust.sql in Supabase before deploying, then 5-verify.sql again. It is also at the end of 00-ALL-IN-ONE.sql.

## 1.27.1 — service worker dealpin-v56 (push key set)

- Push public key is set. Private key and cron secret are set in Supabase, not in the app.

## 1.27.0 — service worker dealpin-v55 (push notifications)

- Settings → Notifications: sellers turn on alerts for each device. Alerts arrive when a buyer agrees, ships, confirms receipt, disputes or a deal is cancelled.
- Needs setup: see app/supabase/PUSH-SETUP.md and run app/supabase/setup/15-push.sql.

## 1.26.0 — service worker dealpin-v54 (receipt image, product drafts)

- Receipts can be saved as a picture (PNG) with Save as image, drawn on the device.
- A new product being typed is kept on the device, like a new deal.

## 1.25.0 — service worker dealpin-v53 (drafts)

- A new deal being typed is kept on the device as you type. If the page reloads or the connection drops, it is filled back in.
- The draft is cleared when the deal link is created.

## 1.24.0 — service worker dealpin-v52 (lists with actions)

- Home numbers (Verified, In progress, Awaiting buyer, Disputed) open their deal list already filtered.
- Each deal row has Copy buyer link, and WhatsApp reminder for agreed and shipped deals.

## 1.23.0 — service worker dealpin-v51 (live updates, sign-out on maintenance and suspension)

- Every screen refreshes itself about every 8 seconds, without pulling down.
- The bell counts new announcements as well as deal changes.
- Taking the app down signs everyone out; suspended accounts are signed out and cannot save.
- Run app/supabase/setup/13-live-and-signout.sql in Supabase before deploying.

## 1.22.0 — service worker dealpin-v50 (maintenance mode)

- The owner can take the whole app down for an update. Everyone sees the message instead of the app, and the database refuses saves until it is back.
- Run app/supabase/setup/12-maintenance.sql in Supabase before deploying.

## 1.21.0 — service worker dealpin-v49 (announcements)

- Announcements from the owner appear at the top of Activity for every signed-in seller, live as soon as they are published.
- Run app/supabase/setup/10-announcements.sql in Supabase before deploying.

## 1.20.0 — service worker dealpin-v48 (phase 4 follow-up: activity inbox)

- New Activity screen: every change on your deals (created, agreed, shipped, received, disputed, cancelled, resolved), newest first, with a New tag on changes since you last opened it.
- Bell in the header shows the number of new changes. It is stored per device only, so it is a convenience, not a record.
- Push notifications still need a server to send them and are not in this release.
- index.html: adds the bell icon and link only. No script, style or security header change.

## 1.19.0 — service worker dealpin-v47 (phase 3, round 14: legal and terms)

- Links inside sentences (for example privacy policy and terms of service) no longer stretch the line spacing of the paragraph. The touch area stays at least 44px tall.
- No change to the terms text or contact details.

## 1.18.0 — service worker dealpin-v46 (phase 3, round 13: settings)

- Settings on tablets and desktop: cards flow into two columns by height, so short cards no longer leave empty gaps.
- Phones unchanged.
- No change to language, theme, region, backup or delete actions.

## 1.17.0 — service worker dealpin-v45 (phase 3, round 12: tools)

- Tools summary cards on phones: a third figure (for example Overdue or Invoices) spans the full row, so it no longer sits alone.
- The "Saved on this device only" note no longer shows a location pin.
- No change to ledger, invoice or stock figures.

## 1.16.0 — service worker dealpin-v44 (phase 3, round 11: explore)

- Desktop product grid (Explore and Products): cards keep a fixed width and sit at the start of the row, so a few products no longer spread across the whole page.
- Phone and tablet layouts unchanged.

## 1.15.0 — service worker dealpin-v43 (phase 3, round 10: public seller profile)

- Public seller profile: recent verified deals stay in one full-width column on desktop, so dates no longer wrap.
- Other pages with the centred layout (sign-in, receipts, buyer links) use the same single-column lists.
- No change to seller data or receipt links.

## 1.14.0 — service worker dealpin-v42 (phase 3, round 9: new deal and Create sheet)

- Desktop: the Deals tab no longer looks selected on the New deal screen. Only the Create button is highlighted there.
- Edit deal no longer highlights Home in the navigation.
- No change to deal creation, photos or the Create sheet.

## 1.13.0 — service worker dealpin-v41 (phase 3, round 8: rider check-in)

- Rider page: when the buyer has not shared a pin, landmark or voice note, the page says so and asks the rider to call to agree on the spot.
- No change to arrival, handover or location logic.

## 1.12.0 — service worker dealpin-v40 (phase 3, round 7: sign-in, welcome, receipt)

- Sign-in: on desktop the form lines up with the Dealpin brand line instead of sitting inset.
- Sign-in: "Use my email instead" is full width like the other sign-in buttons.
- Welcome and receipt screens reviewed on phone and desktop; no change needed.
- No change to sign-in logic, codes or data.

## 1.11.0 — service worker dealpin-v39 (phase 3, round 6: public product page)

- Public product page: on phones the photos are a swipeable carousel that snaps photo by photo.
- Desktop layout unchanged. No change to request logic or data.

## 1.10.0 — service worker dealpin-v38 (phase 3, round 5: product editor)

- Product editor: on phones the Save and Cancel buttons stay pinned above the bottom bar.
- No change to product logic, photos or data.
- Screen entrance animation no longer leaves a transform behind, so fixed bars and banners position correctly on every screen.

## 1.9.0 — service worker dealpin-v37 (phase 3, round 4: purchase requests)

- Seller request inbox: each request shows its status as a coloured edge (open, accepted, declined).
- Buyer request page: clearer status badge; request headers stack neatly on phones.
- No change to request logic or data.

## 1.8.0 — service worker dealpin-v36 (phase 3, round 3: products list)

- Product search and filters stay pinned while scrolling the catalogue.
- Each product card shows its status as a coloured top edge (published, paused, draft).
- No change to product logic or data.

## 1.7.0 — service worker dealpin-v35 (phase 3, round 2: deals list)

- Search and sort bar stays pinned while scrolling the deals list.
- Each deal row shows its status as a coloured edge (waiting, in progress, received, disputed, cancelled).
- Calmer empty states. No change to deal logic or data.

## 1.6.0 — service worker dealpin-v34 (phase 3, round 1: deal screen)

- Deal screen: on phones the deal's action buttons stay pinned above the bottom bar and scroll sideways, so the next step is always in reach. Desktop unchanged.
- No change to deal logic, Supabase calls or button handlers.

## 1.5.0 — service worker dealpin-v33

- Pull to refresh on every screen at the top: pull down to reload the current list.
- Offline banner appears when the connection drops and clears when it returns.
- Visual polish and CSP-safe motion (no inline style attributes).
- Product card titles and seller links have finger-sized tap areas (40px minimum).

## 1.4.0 — service worker dealpin-v32 (frontend redesign, v3)

- Full visual redesign of every app screen: one design system (css/styles.css) and one shell (css/app-shell.css), light and dark themes.
- Shell: phone bottom bar with raised Create button, tablet top bar, desktop side rail under a full-width header, refined create sheet.
- Home hero with a soft animated glow; route entrance animation; hover and press feedback; reduced-motion respected.
- WhatsApp actions are green, so reminders and shares are easy to find.
- Welcome page, how-it-works steps, product pages, buyer requests and tools restyled.
- Adaptive: larger touch targets on fingers, reduced transparency and higher contrast preferences supported.
- Explore keeps the navigation bar.
- Version 1.4.0. No changes to Supabase, the admin console, the public website, or config.

## 1.3.0 — service worker dealpin-v31

- Removed the prototype admin console from the public build.
- Deal pages: WhatsApp reminder button for agreed and shipped deals.
- Crash reports older than 90 days are removed on each insert (run the updated 7-crash-reports.sql).
- Website: six new pages and footer links (in the website folder).
- Deploy notes updated: the build is set to live mode; test-mode wording removed.
- New admin console at /admin/: overview, live activity, sellers, deals, products, requests, crash reports, audit trail, admins and system health. Requires an authenticator app. Backend: supabase/setup/8-admin-console.sql (run once), tested by tests/admin-backend.test.mjs.
- Admin access is checked in the database on every call, and every admin action and view of personal data is logged.

- Public product pages: "Share on WhatsApp" button sends the product title, price and page link. "Copy product link" is kept.
- Crash reporting on: errors go to the public.crash_reports table (run supabase/setup/7-crash-reports.sql once). Reports hold only the message, stack, page name, app version and browser, with IDs and numbers removed. The public key can insert only, and nobody can read rows through the API.
- Service worker cache bumped to dealpin-v30 so returning users load the new code.

# Changes in 1.2.1 — Frontend release hardening
- Removed the testing-mode/sign-in-disabled notice markup and its router behavior. The authentication bypass remains enabled in the local staging configuration.
- Added a persistent interface-language selector in Settings and shared Luganda/Kiswahili vocabulary for shell, seller dashboard, product catalogue and common actions. Existing buyer-facing translated flows remain intact. This is partial UI localization, not a certified complete translation; native-speaker review is required before public release.
- Improved the Create dialog: explicit control relationship, expanded state, Escape handling, keyboard focus containment, focus restoration and background scroll locking.
- Added visible keyboard focus, stronger narrow-screen layout safeguards, media/input width containment and safe-area-aware dialog sizing.
- Bumped the app version to 1.2.1 and service-worker cache to dealpin-v24.
- Expanded static release tests for the removed notice, language support and accessible dialog behavior.
- Browser automation, live Supabase, native-speaker, screen-reader and independent security/legal verification remain external release gates; this environment blocked browser navigation and could not install the PGlite dependency.

# Changes in 1.2 (Phase Five: online Tools)
- Tools (deliveries and riders, ledger, invoices, stock, group orders) now sync online in supabase mode: new `supabase/phase-five-tools-sync.sql` and `js/supabase-mods.js` (`RemoteModStore`). The same screens work on both adapters.
- Server rules: the table has no direct access; every read and write goes through functions that normalise each field (money in the currency's smallest unit, list caps, real dates and map pins), count revisions, refuse stale saves, cap records at 5000 per type, run a batch all or nothing, and limit requests per account.
- Delivery proof photos are uploaded to Storage (own folder only) and the record keeps the path. Replacing or deleting a record, a failed save or a restore removes the files it no longer uses. Deleting the account removes the records (cascade) and the photos.
- Records already on a phone are offered once for upload on the Tools screen ("Upload to my account"); nothing online is replaced.
- Device rules aligned with the server: a boolean, list or object typed into a text or number field now becomes empty or 0 (it used to become "true" or "[object Object]" or 1), and an impossible date such as 2024-02-30 is rejected.
- Money and stock rules are now enforced by the server on every save (overpaying a ledger entry or invoice, negative payments, stock below 0). A restore is not checked, so old backups still load.
- Delivery handover is now a server-checked state machine (`mod_act`, and `ModStore.act` on both adapters): the code is made server-side, wrong codes are counted (5 tries), impossible steps are refused, and a plain save can no longer change status, code or tries. Screens call `ModStore.act`.
- `supabase/verify.sql`: a read-only install check to paste into the SQL editor after setup (tables locked, functions open only to the right roles, bucket and storage rules present). `tests/verify.test.mjs` proves it passes a full install and flags missing or too-open pieces.
- New test: `tests/mods-online.test.mjs` runs the shared contract suite against the real SQL on Postgres, plus isolation, forged photo paths, limits, rate limit, account deletion and a 400-record comparison with the device rules.

# Changes in 1.1 (Phase Four)
- Online purchase requests: new `supabase/phase-four-requests-online.sql` (create, read, counter, accept, withdraw, convert) as narrow RPCs. Buyers need no account; each request has a private token inside its status link. Sellers read requests only through `seller_list_requests`, so tokens never reach the seller or the public.
- `SupabaseStore` now implements the request methods, so product pages no longer break in online mode.
- Buyers can withdraw a pending request. Deleting a product no longer blocks or erases its requests.
- Explore: category filters built from real listings, sorting, result count, "Show more" paging, honest empty states.
- Fixed: a quantity of 0 was silently treated as 1 in both stores.
- Removed example text from the product form.
- Fixed: dark-mode rule that could never match, system dark mode forcing light form controls, inline styles set from script, 42px header and desktop nav targets (now 44px).
- `tools/predeploy.js` fails a live (supabase) config while sign-in bypass is on, and warns in local mode.
- New tests: `tests/requests.test.mjs` (database), request cases in `tests/supabase-store.test.js`, `tests/products.py` (browser). Stale audit selectors and the hard-coded service-worker version in `tests/audit.py` were repaired.

# Changes in 1.0
- Rebuilt from the supplied beta: security hardening, any country and currency, validated money handling, accessible dialogs, offline outbox.
- Tools: deliveries and riders, ledger, invoices, stock, group orders (on device).
- Backend: receipt secret in a private table; schema runnable in pieces; pay detail limit 80 characters.
- Sign-in: Google (PKCE), email code and SMS code; clearer sign-in errors.
- tools/predeploy.js, docs/BACKEND.md, docs/AUTH.md, new tests (mods, tools, signin).


## Phase Two — Product management
- Added seller product catalogue, product editor, listing statuses, image uploads and public product pages.
- Added public Explore discovery for published and available listings.
- Added Supabase products schema/RLS/public detail function migration.
- Product listings remain separate from the existing deal lifecycle.


## Phase Three — buyer product requests
- Added purchase-request submission from public product pages.
- Added seller request inbox with accept, decline and counter-offer.
- Added buyer request-status page and counter-offer response actions.
- Added one-time conversion from accepted request into a separate Dealpin deal.
- Enabled temporary local testing mode with sign-in gate disabled; auth implementation retained.
- Added initial Supabase request schema for the later authenticated online rollout.


## 1.33.0 — Scale readiness
- Added bounded Autopilot pagination for large workspaces.
- Added scale probe and high-volume database indexes.
- Fixed invalid Vercel header JSON.
