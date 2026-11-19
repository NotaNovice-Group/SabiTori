# Landing page (`site/`)

A static page: `site/index.html`, `styles.css`, `main.js`, `img/`. No build step.

## Host it on Cloudflare Pages (owner, about 5 minutes)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, and pick
   `NotaNovice-Group/SabiTori` (Cloudflare's GitHub app works with a private repository too).
2. Build settings: Framework preset **None**, Build command **empty**, Build output directory **`site`**,
   Production branch **`main`**.
3. Save and deploy. Every push to `main` redeploys; pull requests get preview URLs. This does not use the GitHub
   Actions budget.
4. Optional: **Custom domains** → add the domain ([OWNER: domain]).

`site/_headers` sets security and cache headers on Cloudflare Pages.

Alternative without the dashboard link (needs a Cloudflare API token, kept out of the repository):
`npx wrangler pages deploy site --project-name sabitori`.

## Keep it true

Numbers on the page are copied from `docs/numbers.md` with their conditions; change both together. Screenshots in
`site/img/` come from the app (English, 390 x 844 at 2x); the demo video from `apps/app/bench/demo/record.mjs`
(scaled to 1280 px). Before sharing the page, make the repository public and publish a release, or the download
and GitHub links show "not found".
