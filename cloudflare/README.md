# Going live on www.highlightschicago.com/brands

The brand pages stay on their own Vercel app (brand-service-page.vercel.app, basePath `/brands`).
A Cloudflare Worker on the live domain forwards `/brands*` to it unchanged.

## Order (do not skip step 1)

1. **Vercel → Settings → Environment Variables (Production):** set `NEXT_SITE_URL` to
   `https://www.highlightschicago.com`, and `LEAD_WEBHOOK_URL` to the Zapier Catch Hook URL, then redeploy.
   Canonicals, the sitemap and Open Graph links then use the live domain. The vercel.app address
   stays noindex, because only requests carrying the Worker's `x-hc-proxy: brands` header are indexable.
   Without `LEAD_WEBHOOK_URL` the quote forms tell visitors their request did not send.
2. **Cloudflare → Workers & Pages → Create Worker** named `highlights-brand-pages`, paste `worker.js`, deploy.
   Or run `npx wrangler deploy` from this folder.
3. **Worker → Settings → Domains & Routes → Add route**, zone `highlightschicago.com`:
   - `www.highlightschicago.com/brands*` (required)
   - `www.highlightschicago.com/robots.txt` (optional: appends `Sitemap: https://www.highlightschicago.com/brands/sitemap.xml`)
   Failure mode: "Fail open" is fine for `/robots.txt`. For `/brands*` either works.
4. **Google Search Console:** submit `https://www.highlightschicago.com/brands/sitemap.xml`.

Nothing changes in Sanity. The webhook stays on `https://brand-service-page.vercel.app/api/revalidate`,
and the Studio stays at `https://brand-service-page.vercel.app/studio`. The Worker sends `/brands/studio`
there and blocks `/brands/api/*` on the live domain, except `/brands/api/lead`: the quote forms
post there, and the app passes each lead to Zapier (then Jobber).

## Check after going live

```bash
curl -sI https://www.highlightschicago.com/brands/nest/nest-video-doorbell-installation-repair | grep -iE "^(HTTP|x-robots-tag)"
```
Expected: `200`, and no `x-robots-tag` line.

```bash
curl -sI https://brand-service-page.vercel.app/brands/nest/nest-video-doorbell-installation-repair | grep -i x-robots-tag
```
Expected: `X-Robots-Tag: noindex, nofollow` (the vercel.app copy is never indexed).

```bash
curl -s https://www.highlightschicago.com/brands/sitemap.xml
```
Expected: only published pages and brands, all on www.highlightschicago.com.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "content-type: application/json" -d "{}" https://www.highlightschicago.com/brands/api/lead
```
Expected: `400` (the quote form endpoint is reachable and turns away an empty request; nothing is sent to Zapier).
A `404` means the deployed Worker is an older copy that blocks the form.
