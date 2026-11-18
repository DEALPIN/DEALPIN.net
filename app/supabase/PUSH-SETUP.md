# Push notifications: setup (once)

You do these steps. The app and database code is already in the zip. Keep the private key and the cron secret out of any file.

1. **Make the key pair** (on any computer with Node, or ask anyone who has it):
   `npx web-push generate-vapid-keys`
   You get a public key and a private key.

2. **Paste the public key into the app.** Open `app/js/push.js` and set `VAPID_PUBLIC_KEY` to the public key. Publish a new version. The public key is safe to share.

3. **Run the database step.** In the Supabase SQL editor, run `app/supabase/setup/15-push.sql`.

4. **Store the secrets in Supabase** (Supabase CLI, or the dashboard under Edge Functions → Secrets):
   - `VAPID_PUBLIC_KEY` = the public key
   - `VAPID_PRIVATE_KEY` = the private key
   - `VAPID_SUBJECT` = `mailto:your-email@example.com`
   - `CRON_SECRET` = a long random text you make up (letters and numbers, 40 or more)

5. **Deploy the sender:** `supabase functions deploy send-push --no-verify-jwt`

6. **Schedule it every minute.** In the SQL editor, enable the `pg_cron` and `pg_net` extensions, then run (replace the two placeholders):

   ```sql
   select cron.schedule('dealpin-push', '* * * * *', $$
     select net.http_post(
       url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-push',
       headers := '{"x-cron-secret":"YOUR-CRON-SECRET","Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb
     );
   $$);
   ```

**Notes**
- iPhone sends notifications only to apps added to the Home Screen. The Settings card says so.
- Each seller turns notifications on once per device from Settings → Notifications.
- This is not tested end to end here. The sender runs on Supabase, which this workspace cannot reach. Check it after step 6: change a deal's status and confirm a notification arrives.
