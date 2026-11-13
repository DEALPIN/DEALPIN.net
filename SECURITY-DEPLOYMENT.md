# DEALPIN production deployment safety

Before publishing:

1. Keep `app/js/config.js` limited to the public Supabase URL and publishable/anon key. Never place a service-role key, secret key, password, private key, or webhook secret in frontend files.
2. Run `cd app && node tools/predeploy.js`. Deployment should stop if obvious secret material, test bypasses, missing security headers, or private-key files are detected.
3. Keep `.env`, private keys, certificates, and local credentials outside the deployment archive.
4. Configure the production domain as the only intended Supabase Site URL/Redirect URL set. Remove staging/test redirect URLs before launch when they are no longer needed.
5. Serve the site only over HTTPS. HSTS is configured in `_headers` and `vercel.json`.
6. Treat the Supabase publishable/anon key as public. Database authorization must come from RLS/server-side policies, not from hiding the key.
7. Rotate any secret immediately if it has ever been committed to source control, sent to a client, or exposed in a public build.
8. Keep production and staging Supabase projects separate.

## Update 10 — Account & Session Security

The app now applies a client-side inactivity limit (12 hours) and an absolute local session lifetime (30 days). Expired local sessions are cleared before use. Session activity is refreshed periodically, and sign-out clears the OAuth PKCE verifier and pending redirect state in addition to revoking the Supabase local session when possible.

These client-side limits complement, rather than replace, the identity provider's token expiry and server-side authorization controls.
