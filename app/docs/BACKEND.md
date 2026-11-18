# Backend contract

## Live now (Supabase project already set up: schema.sql, storage.sql)
Deals, profiles, buyer/rider links, receipts, ratings, disputes, photos and voice notes run on Supabase.
All deal changes go through SQL functions (`seller_act`, `buyer_act`, `rider_act`); there is no UPDATE policy on deals.
The receipt secret lives in `private.app_secrets` (not reachable by the public API).

## Tools online (phase-five-tools-sync.sql, js/supabase-mods.js)
One table, `mod_records(owner, col, id, rev, at, up, doc)`, with row level security and no policies: nobody reads or writes it directly.
The app calls `mod_list`, `mod_get`, `mod_apply` (batch, all or nothing), `mod_export`, `mod_import` (replace, or merge for moving a phone's records online), `mod_files`, `mod_clear`.
Done on the server: ids made by the server, revision counting and stale-save refusal, field normalisation (mirrors `SP` in js/mods-core.js, kept equal by a 400-record comparison test),
money rules (ledger and invoice payments never exceed the total, no negative payment, stock never below 0, computed in the smallest unit like `Calc`), 5000 records per type, 200 operations per batch, per-account rate limits, proof photos only from the seller's own storage folder.
`js/supabase-mods.js` passes `tests/contract-suite.js` unchanged. If you add a field in `SP`, add it to `mod_spec` in the SQL (the comparison test fails until you do).

Deliveries: status, handover code and wrong-code count change only through `mod_act` (pickup, confirm, reset, viewed, fail, nocode, cancel, retry). The server makes the code, counts wrong codes (5 tries) and refuses impossible steps; a plain save keeps these fields as they are. The device adapter follows the same rules (`jobAct` in js/mods-core.js) and both pass the same contract tests.

## Not done yet in Tools
- Riders have no account or link into Tools: the seller enters the code the recipient gives. The seller's own screen can still see the code (it is how it is sent to the recipient); what the server prevents is a modified app skipping or forging the check.
- Restores (`mod_import`) are normalised but not checked against the money rules, so an old backup is never refused.
- A payment has no currency of its own, so mixed-currency sums cannot happen inside one record; sums across records are only on screens.
- No sharing links (ledger confirmation, invoice view); records are private to one seller.
- No live sync between two open devices: a screen shows what the server had when it loaded; a conflicting save is refused with a clear message.
