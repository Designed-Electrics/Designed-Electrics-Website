# Designed Electrics website

The public website for Designed Electrics Pty Ltd at designedelectrics.com.au. Hosted on Cloudflare Pages, project `designed-electrics`.

## Layout

| Path | What it is |
|---|---|
| `site/` | The published website. Everything in here goes live, exactly as it sits. No build step. |
| `site/_headers` | Cloudflare headers. Keeps the pages.dev preview addresses out of search results. |
| `site/404.html` | Page shown for an address that does not exist. |
| `tools/` | The one-off scripts that cleaned the Claude Design handoff (03/11/2026). Kept for the record; not needed to deploy. |

## How it was made

Designed in Claude Design, then cleaned on 03/11/2026 before first deploy:

- Every empty picture box removed (hero shots, "From the job", "Recent work", the About photos), and the Work gallery page removed until real jobs and photos exist.
- Contact, insurance and service area filled from the Designed Electrics OS. Licence written EC16867.
- Invented trust lines removed. No reviews, client names or job history.
- Brand colour set to Designed Orange #F35402.
- The quote form opens a filled-in email to liam@designedelectrics.com.au. There is no form server yet.
- Clean addresses (`/services`, `/solar-battery`), page titles and descriptions, favicon, sitemap and robots.txt.

## Changing the site

Edit the files in `site/`, commit and push to `main`, then redeploy. The pages load React, Babel and Motion from unpkg and jsdelivr at runtime.

## Never put in this repo

Passwords, API keys or tokens. The repo is public.
