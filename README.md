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
- The quote form opened a filled-in email to liam@designedelectrics.com.au (replaced 16/11/2026, see below).
- Clean addresses (`/services`, `/solar-battery`), page titles and descriptions, favicon, sitemap and robots.txt.

## Quote form (from 16/11/2026)

The form on `/quote` posts to the Supabase Edge Function `website-enquiry` in the Jobflow project. Source: `supabase/functions/website-enquiry/index.ts` (not part of the published site).

- Each enquiry is saved to Jobflow as an inbound lead (`public.leads`, `lead_type = inbound`, `source = website`) with the full text in `public.lead_activities`.
- It is emailed to liam@designedelectrics.com.au through Resend, using the `RESEND_API_KEY` already set for the quote functions. The customer's email is the reply-to address.
- Bots are dropped quietly: a hidden honeypot field, a 3 second minimum fill time, and 5 enquiries an hour per sender.
- If the function cannot be reached, the page falls back to the old filled-in email, so an enquiry is never lost.
- Allowed origins: designedelectrics.com.au, www, and `*.designed-electrics.pages.dev` previews.

Deploy changes to the function with the Supabase CLI or MCP (`verify_jwt` off, it is a public form).

## Changing the site

Edit the files in `site/`, run `python3 tools/stamp.py`, then commit and push to `main`. Cloudflare deploys every push to `main` by itself, usually inside a minute.

`tools/stamp.py` tags the shared CSS and JS links with a fingerprint of each file. Browsers keep CSS and JS for 4 hours, so without a new tag a changed file is not seen until the old copy expires. The pages load React, Babel and Motion from unpkg and jsdelivr at runtime.

## Never put in this repo

Passwords, API keys or tokens. The repo is public.
