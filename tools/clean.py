"""Clean the Designed Electrics Claude Design handoff for deployment on Cloudflare Pages.
Usage: python3 clean.py <src site dir> <out dir>"""
import re, sys, shutil, pathlib, json

SRC, OUT = map(pathlib.Path, sys.argv[1:3])
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir(parents=True)
DOMAIN = "https://designedelectrics.com.au"
PHONE, TEL, EMAIL = "0438 593 586", "tel:0438593586", "liam@designedelectrics.com.au"
AREA = "Perth Hills and Avon Valley. Mundaring to Northam, Toodyay and York."
INSURED = "Public liability insured to $20,000,000 with QBE"

PAGES = {  # source -> (output file, clean path, title, description)
 "Home.dc.html": ("index.html", "/", "Designed Electrics | Electrical, solar and battery, Perth Hills and Avon Valley",
   "Licensed electrical contractor EC16867. Solar and battery, EV chargers, hot water, generators, plumbing and gas. Perth Hills and Avon Valley, Mundaring to Northam, Toodyay and York."),
 "Services.dc.html": ("services.html", "/services", "Services | Designed Electrics", "Solar and battery, EV chargers, heat pump hot water, generators, new home builds, rural and farm, property maintenance, plumbing and gas."),
 "About.dc.html": ("about.html", "/about", "About | Designed Electrics", "Every job starts as a design. Licensed electrical contractor EC16867, Perth Hills and Avon Valley."),
 "Quote.dc.html": ("quote.html", "/quote", "Request a call back | Designed Electrics", "Tell us the site and what you need. We come back with an itemised quote."),
 "Solar-Battery.dc.html": ("solar-battery.html", "/solar-battery", "Solar and battery | Designed Electrics", "Solar and battery systems designed around your load. Perth Hills and Avon Valley."),
 "EV-Chargers.dc.html": ("ev-chargers.html", "/ev-chargers", "EV chargers | Designed Electrics", "Home and workplace EV charger installs, load managed, with the supply checked first."),
 "Generators.dc.html": ("generators.html", "/generators", "Generators | Designed Electrics", "Generator connection, changeover switching and standby power, sized against the loads you need."),
 "Hot-Water.dc.html": ("hot-water.html", "/hot-water", "Heat pump hot water | Designed Electrics", "Heat pump hot water installs, timed to run on your own solar generation."),
 "Maintenance.dc.html": ("maintenance.html", "/maintenance", "Property maintenance | Designed Electrics", "Electrical repairs, upgrades, safety switches and testing for homes and managed properties."),
 "New-Homes.dc.html": ("new-homes.html", "/new-homes", "New home builds | Designed Electrics", "Electrical fit-out and complete wire up for new homes, from slab to handover."),
 "Plumbing-Gas.dc.html": ("plumbing-gas.html", "/plumbing-gas", "Plumbing and gas | Designed Electrics", "Plumbing and gas fitting, done alongside the electrical in one visit."),
 "Rural-Farm.dc.html": ("rural-farm.html", "/rural-farm", "Rural and farm electrical | Designed Electrics", "Sheds, pumps, bores, long cable runs and off-grid power for rural and farm properties."),
}
DROPPED = {"Work.dc.html", "index.html"}
LINKMAP = {k: v[1] for k, v in PAGES.items()}

def remove_block(html, open_re, tag):
    """Remove every element whose opening tag matches open_re, balancing nested <tag>."""
    out, pos = [], 0
    rx = re.compile(open_re)
    tok = re.compile(rf"<{tag}\b|</{tag}>")
    while True:
        m = rx.search(html, pos)
        if not m: out.append(html[pos:]); break
        out.append(html[pos:m.start()])
        depth, i = 1, m.end()
        while depth:
            t = tok.search(html, i)
            if not t: raise ValueError(f"unbalanced {tag} at {m.start()}")
            depth += 1 if t.group().startswith(f"<{tag}") else -1
            i = t.end()
        # swallow trailing whitespace line
        j = i
        while j < len(html) and html[j] in " \t": j += 1
        if j < len(html) and html[j] == "\n": j += 1
        pos = j
    return "".join(out)

log = {}
def sub(html, pat, rep, page, label, flags=0, required=False):
    new, n = re.subn(pat, rep, html, flags=flags)
    if required and n == 0: raise SystemExit(f"{page}: expected '{label}' not found")
    if n: log.setdefault(page, []).append(f"{label} x{n}")
    return new

for src, (dst, path, title, desc) in PAGES.items():
    h = (SRC / src).read_text(encoding="utf-8")
    p = src
    # 1. empty picture boxes: hero shots, photo sections, image-slot runtime
    h = sub(h, r'<div data-de-heroshot="1"[^>]*>\s*<image-slot[^>]*></image-slot>\s*</div>\s*\n?', "", p, "hero picture box")
    for sec in ("Recent work", "From the job"):
        if f'data-de-sec="{sec}"' in h:
            h = remove_block(h, rf'<section[^>]*data-de-sec="{re.escape(sec)}"[^>]*>', "section"); log.setdefault(p, []).append(f"removed section {sec}")
    if src == "About.dc.html":
        h = remove_block(h, r'<section[^>]*data-de-sec="On site"[^>]*>', "section"); log.setdefault(p, []).append("removed section On site (photos)")
    h = sub(h, r'\s*<script src="\./image-slot\.js"></script>', "", p, "image-slot script")
    assert "<image-slot" not in h, f"{p}: image-slot left"
    # 2. work gallery links
    h = sub(h, r'<a href="Work\.dc\.html"[^>]*>.*?</a>\s*\n?', "", p, "work gallery link", flags=re.S)
    # 3. scope grids: wrap and stretch so no empty grey cells
    h = sub(h, r'display: grid; grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 240px\), 1fr\)\); gap: 2px; background: var\(--color-divider\);',
            'display: flex; flex-wrap: wrap; gap: 2px; background: var(--color-divider);', p, "scope grid to flex")
    h = sub(h, r'(data-de-scope="\d+" role="button"[^>]*?style=")', r'\1flex: 1 1 min(100%, 240px); ', p, "scope tile flex")
    # 4. contact facts from the OS
    h = sub(h, r'<span class="text-muted">Phone — to confirm</span>', f'<a href="{TEL}" style="color: inherit; text-decoration: none;">{PHONE}</a>', p, "footer phone")
    h = sub(h, r'<span class="text-muted">Email — to confirm</span>', f'<a href="mailto:{EMAIL}" style="color: inherit; text-decoration: none; overflow-wrap: anywhere;">{EMAIL}</a>', p, "footer email")
    h = sub(h, r'<span class="text-muted">Service area — to confirm</span>', f'<span>{AREA}</span>', p, "footer service area")
    h = sub(h, r'href="tel:0000000000"', f'href="{TEL}"', p, "cta tel")
    h = sub(h, r'Call — add your number', f'Call {PHONE}', p, "cta phone text")
    h = sub(h, r'(Insurance</span>)<span class="text-muted">To confirm</span>', rf'\1<span>{INSURED}</span>', p, "about insurance")
    h = sub(h, r'(Accreditations</span>)<span class="text-muted">To confirm</span>', r'\1<span>Clean Energy Council solar accreditation</span>', p, "about accreditation")
    h = sub(h, r'(Service area</span>)<span class="text-muted">To confirm</span>', rf'\1<span>{AREA}</span>', p, "about service area")
    h = sub(h, r'If it is urgent, call — the number goes live once you add it to the site\.', f'If it is urgent, call <a href="{TEL}" style="color: inherit;">{PHONE}</a>.', p, "quote urgent line")
    h = sub(h, r'fully licensed &amp; insured', INSURED, p, "insured line")
    h = sub(h, r'fully licensed & insured', INSURED, p, "insured line (raw)")
    h = sub(h, r'<span>Designed Electrics — Quality by design</span>', '<span>Designed Electrics Pty Ltd · ABN 69 683 069 490</span>', p, "footer legal entity")
    # 5. invented trust
    h = sub(h, r', and why builders keep calling us back for the next one\.', ' and why the boards are labelled.', p, "builders claim")
    h = sub(h, r'It is why our quotes hold, why the boards are labelled and why the boards are labelled\.', 'It is why our quotes hold and why the boards are labelled.', p, "builders claim tidy")
    # 6. licence format
    h = sub(h, r'EC 16867', 'EC16867', p, "EC16867 format")
    # 7. brand orange (Designed Orange #F35402) ramp
    ramp = {"": "#F35402", "-100": "#fff1e8", "-200": "#ffdcc6", "-300": "#ffb88c", "-400": "#ff8a47", "-500": "#F35402", "-600": "#c94402", "-700": "#9c3402", "-800": "#6e2502", "-900": "#401602"}
    for suf, val in ramp.items():
        h = re.sub(rf'(--color-accent(?:-2)?{suf}:\s*)#[0-9a-fA-F]{{6}};', rf'\g<1>{val};', h)
    h = sub(h, r'(aria-current="page" style="[^"]*?)color: var\(--color-accent\);', r'\1color: var(--color-accent-700);', p, "nav current label to accessible orange")
    # 8. hero video: real src and poster (raw template src made the browser request a missing file)
    h = sub(h, r'src="\{\{ heroVideoSrc \}\}"', 'src="assets/hero.mp4" poster="assets/hero-poster.jpg"', p, "hero video src")
    # 9. quote form: real fallback (email) instead of a fake "Received"
    if src == "Quote.dc.html":
        h = sub(h, r'<form data-de-form="1"', f'<form data-de-form="1" action="mailto:{EMAIL}?subject=Quote%20request%20from%20the%20website" method="post" enctype="text/plain"', p, "form mailto fallback", required=True)
        h = sub(h, r'● Received', '● One more step', p, "success label", required=True)
        h = sub(h, r'>That is with us\.<', '>Press send in your email.<', p, "success heading", required=True)
        h = sub(h, r'We will be in touch to confirm the details before we price it\. ', 'Your email app has opened with your details filled in. Press send and it comes straight to us. If it did not open, email <a href="mailto:' + EMAIL + '" style="color: inherit;">' + EMAIL + '</a>. ', p, "success copy", required=True)
    # 9b. em dashes, rewritten in context (OS rule: none anywhere)
    h = re.sub(r'(\d\d\.\d) — Scope of works', r'\1 · Scope of works', h)
    for a, b in [("About — EC", "About · EC"), ("Services — 01 to 08", "Services · 01 to 08"),
                 ("starts as a design — loads", "starts as a design: loads"), ("at handover — not chased up later", "at handover, not chased up later"),
                 ("sets — supply, install", "sets: supply, install"), ("commercial sites — town, rural and off-grid.", "commercial sites. Town, rural and off-grid."),
                 ("wired end to end — rough-in", "wired end to end: rough-in"),
                 ("that is normal — most of ours do, and it still", "that is normal, and it still")]:
        if a in h: h = h.replace(a, b); log.setdefault(p, []).append(f"emdash: {a[:30]}")
    # 10. alt text without em dashes
    h = h.replace('alt="Designed Electrics — Quality by Design — EC16867"', 'alt="Designed Electrics, Quality by Design, EC16867"')
    # 11. internal links to clean paths
    def relink(m):
        f, frag = m.group(1), m.group(2) or ""
        return f'href="{LINKMAP[f]}{frag}"' if f in LINKMAP else m.group(0)
    h = re.sub(r'href="([A-Za-z-]+\.dc\.html)(#[^"]*)?"', relink, h)
    assert ".dc.html" not in h, f"{p}: .dc.html link left: " + re.findall(r'.{40}\.dc\.html.{10}', h)[0]
    # 12. head: title, description, canonical, social, icons
    url = DOMAIN + path
    head = (f'<title>{title}</title>\n<meta name="description" content="{desc}">\n<link rel="canonical" href="{url}">\n'
            f'<meta property="og:type" content="website">\n<meta property="og:site_name" content="Designed Electrics">\n'
            f'<meta property="og:title" content="{title}">\n<meta property="og:description" content="{desc}">\n'
            f'<meta property="og:url" content="{url}">\n<meta property="og:image" content="{DOMAIN}/assets/og-image.jpg">\n'
            f'<meta name="theme-color" content="#18171C">\n<link rel="icon" href="/favicon.ico" sizes="32x32">\n'
            f'<link rel="icon" type="image/png" sizes="192x192" href="/assets/icon-192.png">\n<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">\n')
    h = sub(h, r'(<meta name="viewport"[^>]*>\n)', lambda m: m.group(1) + head, p, "head meta", required=True)
    h = h.replace("<html>", '<html lang="en-AU">', 1)
    # relative asset paths -> root absolute so clean URLs resolve the same everywhere
    h = re.sub(r'(src|href)="\./', r'\1="/', h)
    h = re.sub(r'(src|href)="(assets|_ds)/', r'\1="/\2/', h)
    h = re.sub(r'url\((assets)/', r'url(/\1/', h)
    h = h.replace('href="de-reveal.css', 'href="/de-reveal.css')
    h = h.replace("import('./de-motion.js')", "import('/de-motion.js')")
    (OUT / dst).write_text(h, encoding="utf-8")

# shared files
for f in ["support.js", "de-reveal.css"]:
    shutil.copy(SRC / f, OUT / f)
js = (SRC / "de-motion.js").read_text(encoding="utf-8")
old_submit = """    on(form, 'submit', (e) => {
      e.preventDefault();
      const ok = root.querySelector('[data-de-success]');
      if (!ok) return;"""
new_submit = """    on(form, 'submit', (e) => {
      e.preventDefault();
      const ok = root.querySelector('[data-de-success]');
      if (!ok) return;
      // Check every required field; mark the first gap and stop.
      const missing = fields.filter(f => (f.type === 'checkbox' || f.type === 'radio')
        ? form.querySelectorAll(`[name="${f.name}"]:checked`).length === 0
        : String(f.value || '').trim().length < 2);
      fields.forEach(f => { const box = f.closest('[data-de-field]') || f.closest('fieldset') || f.parentElement; if (box) box.removeAttribute('data-de-missing'); });
      let err = form.querySelector('[data-de-error]');
      if (missing.length) {
        missing.forEach(f => { const box = f.closest('[data-de-field]') || f.closest('fieldset') || f.parentElement; if (box) box.setAttribute('data-de-missing', '1'); });
        if (!err) {
          err = document.createElement('p'); err.setAttribute('data-de-error', '1'); err.setAttribute('role', 'alert');
          err.style.cssText = 'margin: 0 0 14px; font-weight: 700; color: var(--color-accent-700);';
          const btn = form.querySelector('[type="submit"]'); btn.parentElement.insertBefore(err, btn);
        }
        err.textContent = 'A few details are missing. Fill in the marked fields and send it again.';
        const first = missing[0]; if (first.focus) first.focus({ preventScroll: true });
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (err) err.remove();
      // No server behind the site yet: open a filled-in email to the business.
      const val = n => Array.from(form.querySelectorAll(`[name="${n}"]`)).filter(x => (x.type === 'checkbox' || x.type === 'radio') ? x.checked : true)
        .map(x => (x.type === 'checkbox' || x.type === 'radio') ? (x.parentElement.textContent || x.value).trim() : String(x.value || '').trim()).filter(Boolean).join(', ');
      const body = [
        'Needs: ' + val('need'), 'Property: ' + val('property'), 'Suburb: ' + val('suburb'), 'Timing: ' + val('timing'), '',
        'The job:', val('detail'), '', 'Name: ' + val('name'), 'Phone: ' + val('phone'), 'Email: ' + (val('email') || 'not given'),
      ].join('\\n');
      const subject = 'Quote request: ' + (val('suburb') || 'website') + ' (' + (val('need') || 'general') + ')';
      window.location.href = 'mailto:liam@designedelectrics.com.au?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);"""
assert old_submit in js, "submit handler changed"
js = js.replace(old_submit, new_submit)
(OUT / "de-motion.js").write_text(js, encoding="utf-8")
shutil.copytree(SRC / "_ds", OUT / "_ds", ignore=shutil.ignore_patterns("_ds_manifest.json", "_adherence.oxlintrc.json", "readme.md"))
(OUT / "assets").mkdir()
print(json.dumps(log, indent=1))
# style for fields flagged missing
with open(OUT / "de-reveal.css", "a", encoding="utf-8") as f:
    f.write("\n/* quote form: fields left empty on send */\n[data-de-missing] { outline: 2px solid var(--color-accent-700); outline-offset: 4px; }\n")
# robots, sitemap, headers, 404
(OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {DOMAIN}/sitemap.xml\n", encoding="utf-8")
urls = "".join(f"  <url><loc>{DOMAIN}{v[1]}</loc></url>\n" for v in PAGES.values())
(OUT / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n', encoding="utf-8")
(OUT / "_headers").write_text("""# Preview addresses on pages.dev stay out of search results; the real domain is indexed.
https://:project.pages.dev/*
  X-Robots-Tag: noindex
https://:version.:project.pages.dev/*
  X-Robots-Tag: noindex

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=604800
""", encoding="utf-8")
(OUT / "404.html").write_text("""<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | Designed Electrics</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.ico">
<style>body{margin:0;font-family:Archivo,system-ui,sans-serif;background:#f3f2f2;color:#201e1d;padding:clamp(24px,8vw,96px) 16px}
main{max-width:720px;margin:0 auto}h1{font-size:clamp(36px,7vw,72px);line-height:.95;text-transform:uppercase;margin:0 0 20px}
a.btn{display:inline-block;background:#F35402;color:#201e1d;font-weight:800;text-decoration:none;text-transform:uppercase;letter-spacing:.1em;font-size:14px;padding:16px 24px}
p{font-size:18px;margin:0 0 28px}</style></head>
<body><main><img src="/assets/logo-full.png" alt="Designed Electrics, Quality by Design, EC16867" style="width:200px;height:auto;mix-blend-mode:multiply;margin-bottom:32px">
<h1>That page is not here.</h1><p>It may have moved. Start from the home page, or call <a href="tel:0438593586" style="color:inherit">0438 593 586</a>.</p>
<a class="btn" href="/">Home page</a></main></body></html>
""", encoding="utf-8")
