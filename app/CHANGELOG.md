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
