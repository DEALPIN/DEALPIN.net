# Dealpin release readiness — 1.2.1

## Implemented in this pass

- Removed the testing-mode/sign-in-disabled notice from the HTML shell and router.
- Kept the sign-in bypass enabled in local staging configuration.
- Added Settings language selection and shared Luganda/Kiswahili vocabulary for the app shell, seller dashboard, product catalogue and common actions.
- Improved Create dialog keyboard behavior, ARIA relationships, focus restoration and safe-area sizing.
- Added visible focus and narrow viewport layout safeguards.
- Updated application version and service-worker cache.

## Automated checks completed

- `node --check` for all application and JavaScript test files.
- `node tests/store.test.js`
- `node tests/region.test.js`
- `node tests/supabase-store.test.js`
- `node tests/mods.test.js`
- `node tests/frontend.test.js`

## External release gates — not certified here

1. Full browser automation at 320, 360, 390, 768, 1024 and 1440 CSS pixels, in portrait and landscape. Browser navigation is blocked in this execution environment, so Playwright could not complete.
2. Postgres/PGlite integration suite (`schema.test.mjs`, `requests.test.mjs`, `mods-online.test.mjs`, `verify.test.mjs`). The `@electric-sql/pglite` package could not be installed in this environment.
3. Native-speaker review of Luganda and Kiswahili. Current translations are a shared vocabulary and partial interface coverage, not complete localization.
4. Screen-reader and keyboard-only review with assistive technology on real devices.
5. Live Supabase staging: apply all migrations in order, run `supabase/verify.sql`, and test two-device deal, product, request, proof-photo, delivery and Tools flows.
6. Independent security and legal review. Terms remain a draft; Dealpin records payments but does not process or hold funds.

## Deployment configuration

`js/config.js` deliberately remains `mode:'local'` and `testingBypassAuth:true`. This preserves the requested authentication bypass. Local mode is device-only and is not suitable for multi-device production. Before a real launch, complete the staging checks, switch to Supabase mode, and make a deliberate authentication decision; `tools/predeploy.js` blocks a Supabase deployment while the bypass remains on.
