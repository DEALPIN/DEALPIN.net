# Dealpin release readiness — 1.33.0

## Implemented in this pass

- Added Business Autopilot UI for customers, sales opportunities, inventory, suppliers, tasks, automation rules, expenses, branches, staff records, operational insights and command-centre priorities.
- Added create, edit, delete and JSON export for business records.
- Added an append-only stock movement ledger, purchase-order receiving, unique stock reservations, release and fulfilment, plus indicative unit-cost valuation. Reserved quantity is protected from direct record edits.
- Added Supabase business workspaces, membership roles, workspace switching, branch-scoped membership, invitation links, server-side record authorization and audit history.
- Added internal workflow actions for new enquiries, due opportunity follow-ups and stock-reorder alerts. These create internal tasks; they do not send external customer messages.
- All Autopilot and enterprise workspace features shipped in this pass are available without paid gates or record-count quotas.
- Existing marketplace, deals, transaction payment recording between buyer and seller, product discovery and Trust Score are preserved.

## Automated checks completed

- JavaScript syntax checks across app scripts.
- `node tests/autopilot.test.js`
- `node tests/autopilot-store.test.js`
- `node tests/frontend.test.js`
- `node tests/store.test.js`
- `node tests/trust.test.js`
- `node tests/mods.test.js`
- `node tests/region.test.js`
- `node tests/supabase-store.test.js`

## External release gates — not certified here

1. Apply `supabase/setup/17-business-autopilot.sql` on a staging Supabase project and run `supabase/verify.sql`. The database migration has not been executed against the configured live project in this environment.
2. The PGlite/Postgres integration suite (`schema.test.mjs`, `requests.test.mjs`, `mods-online.test.mjs`, `verify.test.mjs`, and `admin-backend.test.mjs`) could not run because `@electric-sql/pglite` is not installed in this environment.
3. Full browser automation at 320, 360, 390, 768, 1024 and 1440 CSS pixels, in portrait and landscape, still requires real browser/device testing.
4. External SMS, email and WhatsApp delivery requires provider credentials, templates, consent controls and compliance review. This release does not claim those integrations are active.
5. Predictive AI advice requires a configured AI provider and secure server-side key. Current Insights uses transparent rules against stored records, not a simulated AI service.
6. Full accounting, payroll, tax filing, multi-line and partial purchase-order receiving, stock transfers, barcode scanning, FIFO/weighted-average costing, advanced forecasting, and transaction-linked stock automation need further dedicated workflows before being described as fully implemented.
7. Screen-reader, native-speaker localization, independent security and legal reviews remain external release gates.

## Data and deployment notes

- Local mode stores Autopilot data on the current device only. Supabase mode stores records in the authenticated workspace.
- Fresh database installation: use the updated `supabase/setup/00-ALL-IN-ONE.sql`, then run `supabase/setup/5-verify.sql`.
- Existing installation: back up production, run `supabase/setup/17-business-autopilot.sql`, then `supabase/setup/18-stock-ledger-purchasing.sql`, then `supabase/setup/19-stock-reservations-valuation.sql`, and finally run `supabase/verify.sql`.
- Team invitations are created by an owner/administrator and shared as a link. The invited user must sign in using the invited email address. Branch access is enforced by server-side membership checks.
- Dealpin records payment confirmations between buyers and sellers; it does not hold or process those funds.

## Business Autopilot stock operations checks

- Run `supabase/setup/18-stock-ledger-purchasing.sql` after `17-business-autopilot.sql`, then `supabase/setup/19-stock-reservations-valuation.sql` after step 18 on an existing project.
- Confirm `autopilot_stock_movements` has RLS enabled and no direct API table privileges.
- Confirm stock changes go through `autopilot_stock_move`, reject negative physical balances and record actor/time/reference.
- Confirm received purchase orders cannot be edited, deleted or received a second time.
- Confirm the migration backfills existing non-zero inventory as opening balances.
- Confirm reservations cannot exceed available stock, reservation references are unique, and reserved quantities cannot be changed through generic inventory editing.
- Confirm release restores availability and fulfilment atomically reduces both reserved and physical stock while creating a sale ledger movement.
- Treat inventory valuation as an estimate based on on-hand quantity × recorded unit cost; do not use it as a formal FIFO/weighted-average accounting statement.
- Run `supabase/verify.sql` and require every check to pass before production rollout.
- Validate in a staging Supabase project: the local adapter tests do not replace a real database/RLS integration test.


## Scale readiness update 1.33.0

- Added bounded `autopilot_list_page` reads (maximum 500 rows per server response) and updated the online client to consume pages while preserving the existing UI array contract.
- Added `dealpin_scale_probe()` for authenticated, business-data-free operational counts (active members, records and audit events).
- Added high-volume indexes for deals, products, product requests, tools records, Autopilot records/audit and stock reservations.
- Fixed the Vercel deployment header configuration so the JSON is valid and deployable.

### What this improves

This release reduces the risk of a single oversized Autopilot JSON response becoming a bottleneck as a workspace grows. It also improves common database sort/filter paths. It is not a claim that one Supabase project is automatically sized for millions of concurrent users. Production capacity still requires measured load testing, query-plan review, Supabase/infrastructure sizing, CDN strategy, rate limiting at the edge, and tested failover/rollback procedures.

### Required before a millions-of-users launch

1. Apply `supabase/setup/23-scale-readiness.sql` on staging, run `supabase/verify.sql`, then repeat against production after backup/change review.
2. Run real browser/device tests on low-end Android, iOS and desktop across slow/unstable networks.
3. Load-test authenticated reads/writes, public product pages, buyer/rider deal links and file uploads with realistic concurrency and data sizes.
4. Inspect PostgreSQL query plans and slow-query metrics at expected peak volume.
5. Configure infrastructure-level rate limiting/WAF/CDN and monitoring outside the browser.
6. Exercise backup restore, regional/provider outage, deploy rollback and incident-response procedures.
7. Obtain independent security testing and privacy/legal review before public mass distribution.
