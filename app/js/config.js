/* Deployment settings. This file is the only place to edit before publishing.
   mode          'supabase' for a live app. 'local' keeps everything on one device: for trying the screens, not for real sales.
   url, anonKey  Your Supabase project URL and its public anon key (both are safe to publish).
   errorEndpoint Optional https address that receives crash reports (js/monitor.js). Leave empty to send nothing.
   supportEmail  Optional contact address shown on the Terms and privacy page.
   After changing url or errorEndpoint, add that host to connect-src in index.html, _headers and vercel.json.
   Run  node tools/predeploy.js  to check these settings. */
window.DEALPIN={mode:'supabase',testingBypassAuth:false,url:'https://kvydbbfcjouxlskmhvif.supabase.co',anonKey:'sb_publishable_zNvWQkubtygld1KdBdciWA_vTp-XIaj',errorEndpoint:'',supportEmail:'dealpin.net@gmail.com'};
