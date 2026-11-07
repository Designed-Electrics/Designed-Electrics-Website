"""Stamp shared CSS and JS references in every page with a short hash of the file's contents.
Browsers keep CSS and JS for hours, so a changed file needs a new address to be fetched at once.
Run from the repo root before every commit that changes a shared file: python3 tools/stamp.py"""
import hashlib, pathlib, re
SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
FILES = ["de-reveal.css", "de-motion.js", "support.js"] + [str(p.relative_to(SITE)) for p in SITE.glob("_ds/*/styles.css")] + [str(p.relative_to(SITE)) for p in SITE.glob("_ds/*/_ds_bundle.js")]
tags = {f: hashlib.sha256((SITE / f).read_bytes()).hexdigest()[:8] for f in FILES}
changed = 0
for page in SITE.glob("*.html"):
    h = page.read_text(encoding="utf-8"); orig = h
    for f, tag in tags.items():
        h = re.sub(rf'(["\'(]/{re.escape(f)})(\?v=[0-9a-zA-Z]+)?(["\')])', rf'\g<1>?v={tag}\g<3>', h)
    if h != orig: page.write_text(h, encoding="utf-8"); changed += 1
print(f"stamped {changed} pages:", tags)
