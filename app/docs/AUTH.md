# Sign-in setup

The app offers three ways in. Turn on at least one in Supabase, Authentication, Sign In / Providers.

## Google (cheapest, no SMS or email sender needed)
How it works: the app starts the sign-in with a PKCE challenge, Google sends the person back to the site with a one-time `code`,
and the app swaps the code plus its private verifier for a session. No token appears in the address bar.
1. Google Cloud console: create a project, set up the OAuth consent screen (External), then Credentials, Create OAuth client ID, Web application.
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Supabase, Google provider: on, paste Client ID and Client secret. The secret lives only in Supabase.
4. Supabase, URL Configuration: Site URL = your hosted address (no trailing slash). Redirect URLs: the address and the address with `/**`.
5. While the Google consent screen is in Testing, only listed test users can sign in. Publish it before real users.
The app returns to `<origin>/`, so host it at the root of the domain.
**WebView / APK warning:** Google refuses sign-in inside an embedded WebView (error `disallowed_useragent`). Google sign-in works in a normal
browser and in the installed PWA. A WebView-wrapped APK must either open the sign-in in a Chrome Custom Tab and return through a deep link
to the same origin (the app keeps its one-time verifier in localStorage for 10 minutes for this), or use Google's native sign-in and
Supabase's `signInWithIdToken`. Until one of those is built and tested on a real phone, use email or SMS codes inside the APK.

## Email code
1. Providers, Email: on.
2. Edit the Magic Link and Confirm signup templates so the message contains the code `{{ .Token }}` and the link `{{ .ConfirmationURL }}`.
   The app asks for a PKCE link, so tapping the link returns to the site and signs in, but only in the same browser or app where the code was requested
   (otherwise the person types the code instead). Example body:
   `<p>Your Dealpin code: <b>{{ .Token }}</b></p><p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>`
3. Supabase's default sender: 2 emails an hour, team members only, and new free projects cannot edit templates. For real use add custom SMTP
   (Authentication, Emails, SMTP Settings). The sender address must be verified at your provider. A Gmail sender address is unreliable for delivery;
   use an address on a domain you own with SPF and DKIM set up.

## Phone SMS code
Providers, Phone: on, pick a provider and fill its credentials. Twilio trial accounts only text verified numbers, and Uganda needs a registered
alphanumeric sender ID for reliable delivery. For development use Supabase's "Test phone numbers and OTPs" (remove them before launch).

## Secrets
Only the project URL and the publishable key go in js/config.js. Secret keys, the JWT secret, Google's client secret, SMTP and SMS credentials
belong in Supabase or a server's private settings, never in files you upload. `node tools/predeploy.js` fails if a secret key appears in the app.
