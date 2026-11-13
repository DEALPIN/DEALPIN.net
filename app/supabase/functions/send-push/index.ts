// Dealpin push sender. Runs on a schedule (see app/supabase/PUSH-SETUP.md). Sends queued seller messages to every subscribed device.
// Needs these secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET.
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const H = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' };

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const msgs = await (await fetch(
    `${SUPABASE_URL}/rest/v1/push_outbox?sent=eq.false&select=id,user_id,title,body,url&order=id.asc&limit=100`,
    { headers: H },
  )).json();

  let sent = 0, removed = 0;
  for (const m of msgs) {
    const subs = await (await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${m.user_id}&select=endpoint,p256dh,auth`,
      { headers: H },
    )).json();
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: m.title, body: m.body, url: m.url }),
          { TTL: 3600 },
        );
        sent++;
      } catch (e) {
        // The device unsubscribed or the push service no longer knows it: forget that device.
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`,
            { method: 'DELETE', headers: H });
          removed++;
        }
      }
    }
    await fetch(`${SUPABASE_URL}/rest/v1/push_outbox?id=eq.${m.id}`,
      { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ sent: true }) });
  }
  return Response.json({ messages: msgs.length, sent, removed });
});
