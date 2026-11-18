# DEALPIN

- `/` (index.html, site.css, site.js, assets/) is the marketing website. It is the first page people see.
- `/app/` is the Dealpin app (your DEALPIN2 build, unchanged, moved into this folder). Every "Open Dealpin" button points to `app/`.
- `_headers` (Netlify, Cloudflare Pages) and `vercel.json` carry the security headers and cache rules for both.

Deploy the whole folder over https. Run app commands from `app/`, for example `cd app && node tools/predeploy.js`.
The app's own README is `app/README.md`.

Website pages (src/): home, how, features, tools, people, trust, faq, install, about, contact, sellers, buyers, riders, explore, glossary, legal. After editing a page, run `node tools/build-site.js`.
