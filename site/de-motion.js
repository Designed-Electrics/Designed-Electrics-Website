/* Designed Electrics — shared motion system.
   One vocabulary used by every page: scroll-driven reveal, a drawn rule,
   a cinematic mask wipe, a hard grid snap, and a cursor-tracking crosshair. */

const EASE = 'cubic-bezier(.16,1,.3,1)';
const E = [0.16, 1, 0.3, 1];
export const MOTION_URL = 'https://cdn.jsdelivr.net/npm/motion@11.18.2/+esm';
let FM = null;
const loadFM = () => (window.__deFM ||= import(MOTION_URL).then(m => (FM = m)).catch(() => null));
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || undefined;

// One animation call for every interaction: Motion (Framer Motion's engine)
// when loaded, a plain CSS transition otherwise.
function tw(el, kf, o = {}) {
  if (!el) return;
  if (FM) return FM.animate(el, kf, { duration: 0.35, ease: E, ...o });
  const d = o.duration ?? 0.35, delay = o.delay ?? 0;
  el.style.transition = `all ${d}s ${EASE} ${delay}s`;
  const tf = [];
  for (const [k, v] of Object.entries(kf)) {
    const val = Array.isArray(v) ? v[v.length - 1] : v;
    if (k === 'x') tf.push(`translateX(${val}px)`);
    else if (k === 'y') tf.push(`translateY(${val}px)`);
    else if (k === 'scale') tf.push(`scale(${val})`);
    else el.style[k] = val;
  }
  if (tf.length) el.style.transform = tf.join(' ');
  return { finished: new Promise(r => setTimeout(r, (d + delay) * 1000)) };
}

export function initMotion(root, opts = {}) {
  if (!root) return () => {};
  const level = opts.level || 'full';
  const wantCross = false; // crosshair cursor removed 07/11/2026 at Liam's request
  const cleanups = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };
  const scale = level === 'subtle' ? 0.5 : 1;

  /* ── reveal (Motion) ───────────────────────────────────── */
  // Pages start with reveals held (html[data-de-fm="wait"], set in <helmet>).
  // Motion then fades/staggers each element in as it scrolls into view. If
  // Motion can't load, the hold lifts and de-reveal.css plays instead.
  const html = document.documentElement;
  const els = Array.from(root.querySelectorAll('[data-r]'));
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dead = false;
  cleanups.push(() => { dead = true; });
  const K = {
    up:   { opacity: [0, 1], y: [30 * scale, 0] },
    snap: { opacity: [0, 1], y: [14 * scale, 0] },
    mask: { clipPath: ['inset(0 101% -12% 0)', 'inset(0 -10% -12% 0)'] },
    draw: { scaleX: [0, 1] },
  };
  const DUR = { up: 0.7, snap: 0.34, mask: 0.85, draw: 0.8 };
  const STEP = { up: 0.08, snap: 0.055, mask: 0.09, draw: 0.08 };
  const firstSec = root.querySelector('[data-de-sec]');
  const clear = (el) => { el.style.opacity = ''; el.style.transform = ''; el.style.clipPath = ''; };
  if (level === 'off' || reduce) {
    html.removeAttribute('data-de-fm');
    els.forEach(el => { el.style.animation = 'none'; clear(el); });
  } else {
    loadFM().then(M => {
      if (dead) return;
      if (!M || !M.inView) { html.removeAttribute('data-de-fm'); return; }
      els.forEach(el => {
        const t = K[el.getAttribute('data-r')] ? el.getAttribute('data-r') : 'up';
        const i = +el.getAttribute('data-r-i') || 0;
        const quick = firstSec && firstSec.contains(el);
        const dur = DUR[t] * (level === 'subtle' ? 0.5 : 1) * (quick ? 0.6 : 1);
        const delay = i * STEP[t] * (quick ? 0.5 : 1);
        if (t === 'mask') el.style.clipPath = K.mask.clipPath[0];
        else if (t === 'draw') { el.style.transformOrigin = 'left center'; el.style.transform = 'scaleX(0)'; }
        else { el.style.opacity = '0'; el.style.transform = `translateY(${K[t].y[0]}px)`; }
        // A fully clipped element has no visible area, so observe its parent.
        const target = t === 'mask' && el.parentElement ? el.parentElement : el;
        const stop = M.inView(target, () => {
          el.__deFired = true;
          M.animate(el, K[t], { duration: dur, delay, ease: E });
          // Safety net: settle on the natural (visible) state regardless.
          const s = setTimeout(() => clear(el), (dur + delay) * 1000 + 250);
          cleanups.push(() => clearTimeout(s));
        }, { amount: 0.12 });
        cleanups.push(stop);
      });
      html.setAttribute('data-de-fm', 'on');
      // Page-level safety net: anything in or above the viewport that is
      // still held hidden gets released, whatever the observer did.
      const sweep = () => els.forEach(el => {
        const hidden = el.style.opacity === '0' || /101%/.test(el.style.clipPath) || el.style.transform === 'scaleX(0)';
        if (hidden && !el.__deFired && el.getBoundingClientRect().top < window.innerHeight * 0.9) {
          if (el.__deSeen) clear(el); else el.__deSeen = true;
        }
      });
      const sw1 = setTimeout(sweep, 1500);
      const sw2 = setInterval(sweep, 1200);
      cleanups.push(() => { clearTimeout(sw1); clearInterval(sw2); });
    });
  }

  /* ── prefetch ───────────────────────────────────────────── */
  // Warm the next page as soon as intent shows (hover/touch/focus), and all
  // internal pages once idle, so clicks load from cache.
  const fetched = new Set();
  const warm = (href) => {
    if (!href || fetched.has(href)) return;
    fetched.add(href);
    const l = document.createElement('link');
    l.rel = 'prefetch'; l.href = href; l.as = 'document';
    document.head.appendChild(l);
  };
  const internal = () => Array.from(root.querySelectorAll('a[href$=".dc.html"]')).map(a => a.getAttribute('href'));
  const intent = (e) => { const a = e.target.closest && e.target.closest('a[href$=".dc.html"]'); if (a) warm(a.getAttribute('href')); };
  on(root, 'pointerover', intent, { passive: true });
  on(root, 'touchstart', intent, { passive: true });
  on(root, 'focusin', intent);
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 600));
  const idleId = idle(() => internal().forEach(warm));
  cleanups.push(() => { (window.cancelIdleCallback || clearTimeout)(idleId); });

  /* ── scroll ─────────────────────────────────────────────── */
  const bar = root.querySelector('[data-de-progress]');
  const nav = root.querySelector('[data-de-nav]');
  const mark = root.querySelector('[data-de-navmark]');
  const track = root.querySelector('[data-de-track]');
  const node = root.querySelector('[data-de-node]');
  const num = root.querySelector('[data-de-secnum]');
  const name = root.querySelector('[data-de-secname]');
  const secs = Array.from(root.querySelectorAll('[data-de-sec]'));
  const drifts = Array.from(root.querySelectorAll('[data-de-drift]'));
  let sraf = 0;

  const tick = () => {
    sraf = 0;
    const y = window.scrollY || 0;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    if (bar) bar.style.width = (Math.min(1, y / max) * 100).toFixed(2) + '%';

    if (nav && mark) {
      const tight = y > 60;
      nav.style.padding = tight ? '8px clamp(16px, 4vw, 56px)' : '14px clamp(16px, 4vw, 56px)';
      mark.style.width = tight ? '41px' : '56px';
      mark.style.height = tight ? '34px' : '46px';
      mark.style.backgroundSize = tight ? '87px auto' : '117px auto';
      mark.style.backgroundPosition = tight ? '-23px -1px' : '-31px -1px';
    }

    if (level !== 'off') {
      drifts.forEach(d => {
        const k = parseFloat(d.getAttribute('data-de-drift')) || 0.05;
        d.style.transform = `translateY(${(-y * k * scale).toFixed(1)}px)`;
      });
    }

    if (track && track.parentElement) {
      const r = track.parentElement.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (window.innerHeight * 0.78 - r.top) / Math.max(1, r.height * 0.85)));
      track.style.width = (p * 100).toFixed(1) + '%';
      if (node) node.style.left = (p * 100).toFixed(1) + '%';
    }

    if (num && name && secs.length) {
      // Before layout settles every section measures top 0; writing then would
      // latch the LAST section into the readout.
      const measured = secs.some(s => s.getBoundingClientRect().top !== 0);
      if (measured) {
        let cur = secs[0];
        secs.forEach(s => { if (s.getBoundingClientRect().top <= window.innerHeight * 0.42) cur = s; });
        const label = cur.getAttribute('data-de-sec');
        if (name.textContent !== label) {
          num.textContent = String(secs.indexOf(cur) + 1).padStart(2, '0');
          name.textContent = label;
        }
      }
    }
  };
  on(window, 'scroll', tick, { passive: true });
  on(window, 'resize', tick);
  on(window, 'load', tick);
  tick();

  // Neither scroll events nor requestAnimationFrame fire in every preview host,
  // so a permanent timer — not the event listeners — is the primary driver for
  // everything that depends on scroll position or late layout.
  const loop = setInterval(tick, 140);
  cleanups.push(() => clearInterval(loop));

  /* ── cursor ─────────────────────────────────────────────── */
  const cx = root.querySelector('[data-de-cross="x"]');
  const cy = root.querySelector('[data-de-cross="y"]');
  if (!wantCross && cx && cy) cx.style.display = cy.style.display = 'none';
  const tilts = Array.from(root.querySelectorAll('[data-de-tilt]'));
  tilts.forEach(t => { t.style.transition = `transform .5s ${EASE}`; });
  let praf = 0, mx = 0, my = 0;
  const ptick = () => {
    praf = 0;
    if (wantCross && cx && cy) {
      cx.style.opacity = '1'; cy.style.opacity = '1';
      cx.style.transform = `translateY(${my}px)`;
      cy.style.transform = `translateX(${mx}px)`;
    }
    if (level !== 'off') {
      tilts.forEach(t => {
        const r = t.getBoundingClientRect();
        const dx = (mx - (r.left + r.width / 2)) / Math.max(1, r.width);
        const dy = (my - (r.top + r.height / 2)) / Math.max(1, r.height);
        const k = (Math.abs(dx) < 1.2 && Math.abs(dy) < 1.2) ? 6 * scale : 0;
        t.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
      });
    }
  };
  on(window, 'pointermove', (e) => { mx = e.clientX; my = e.clientY; ptick(); }, { passive: true });
  on(window, 'pointerleave', () => { if (cx && cy) { cx.style.opacity = '0'; cy.style.opacity = '0'; } });

  /* ── hover behaviours (Motion) ───────────────────────────── */
  const hoverOn = (el, enter, leave) => {
    on(el, 'pointerenter', enter); on(el, 'pointerleave', leave);
    on(el, 'focus', enter); on(el, 'blur', leave);
  };
  const spring = { type: 'spring', stiffness: 420, damping: 30 };
  Array.from(root.querySelectorAll('[data-de-cell]')).forEach(cell => {
    cell.style.transition = 'none';
    const n = cell.querySelector('[data-de-cellnum]');
    if (n) n.style.transition = 'none';
    hoverOn(cell, () => {
      tw(cell, { backgroundColor: cssVar('--color-text'), color: cssVar('--color-bg'), y: -4 }, { duration: 0.28 });
      tw(n, { color: cssVar('--color-accent-500') }, { duration: 0.28 });
    }, () => {
      const bg = cell.getAttribute('data-de-cell-bg');
      tw(cell, { backgroundColor: bg ? cssVar(bg.replace(/^var\((.*)\)$/, '$1')) : cssVar('--color-bg'), color: cssVar('--color-text'), y: 0 }, { duration: 0.32 });
      tw(n, { color: cssVar('--color-accent') }, { duration: 0.32 });
    });
  });

  Array.from(root.querySelectorAll('.btn')).forEach(b => {
    hoverOn(b, () => tw(b, { y: -2 }, FM ? spring : {}), () => tw(b, { y: 0, scale: 1 }, FM ? spring : {}));
    on(b, 'pointerdown', () => tw(b, { scale: 0.97 }, { duration: 0.1 }));
    on(b, 'pointerup', () => tw(b, { scale: 1 }, FM ? spring : {}));
  });

  // Row links whose last child is an arrow: nudge the arrow on hover.
  Array.from(root.querySelectorAll('a[href$=".dc.html"]')).forEach(a => {
    if (a.classList.contains('btn') || a.hasAttribute('data-de-cell')) return;
    const arrow = a.lastElementChild;
    if (!arrow || arrow.textContent.trim() !== '→') return;
    arrow.style.transition = 'none';
    hoverOn(a, () => tw(arrow, { x: 8 }, FM ? spring : {}), () => tw(arrow, { x: 0 }, FM ? spring : {}));
  });

  Array.from(root.querySelectorAll('[data-de-kb]')).forEach(frame => {
    const inner = frame.firstElementChild;
    if (!inner) return;
    hoverOn(frame, () => tw(inner, { scale: 1.06 }, { duration: 1.1 }), () => tw(inner, { scale: 1 }, { duration: 1.1 }));
  });

  /* ── self-drawing wires ─────────────────────────────────── */
  const wires = Array.from(root.querySelectorAll('[data-de-wire]'));
  if (wires.length && level !== 'off') {
    wires.forEach((w, i) => {
      const len = w.getTotalLength ? w.getTotalLength() : 60;
      w.style.strokeDasharray = len;
      w.style.strokeDashoffset = len;
      w.style.transition = `stroke-dashoffset .7s ${EASE} ${180 + i * 110}ms`;
    });
    const wireT = setTimeout(() => wires.forEach(w => { w.style.strokeDashoffset = '0'; }), 30);
    cleanups.push(() => clearTimeout(wireT));
  }

  /* ── scope drop-downs (service pages) ────────────────────── */
  // Clicking a "What it covers" tile opens its scope panel directly under
  // that tile's row. One open at a time; panels live in a hidden stash.
  const sTiles = Array.from(root.querySelectorAll('[data-de-scope]'));
  const stash = root.querySelector('[data-de-scopes]');
  if (sTiles.length && stash) {
    const still = level === 'off' || reduce;
    const sp = {};
    Array.from(stash.children).forEach(p => { sp[p.getAttribute('data-de-scope-panel')] = p; });
    const panelOf = (t) => t && sp[t.getAttribute('data-de-scope')];
    const rowEnd = (tile) => { let last = tile; sTiles.forEach(t => { if (Math.abs(t.offsetTop - tile.offsetTop) < 4) last = t; }); return last; };
    const place = (tile, p) => { const end = rowEnd(tile); if (end.nextElementSibling !== p) end.after(p); };
    let cur = null;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    cleanups.push(() => timers.forEach(clearTimeout));
    const grow = (p, from) => {
      p.style.height = 'auto';
      const to = p.offsetHeight;
      if (still) return;
      p.style.height = from + 'px'; void p.offsetHeight;
      tw(p, { height: to + 'px' }, { duration: 0.55 });
      later(() => { if (p.parentElement !== stash) p.style.height = 'auto'; }, 600);
      const items = Array.from(p.querySelectorAll('[data-de-si]'));
      items.forEach((el, i) => {
        el.style.transition = 'none'; el.style.opacity = '0'; el.style.transform = 'translateY(12px)'; void el.offsetHeight;
        tw(el, { opacity: 1, y: 0 }, { duration: 0.45, delay: 0.08 + i * 0.03 });
      });
    };
    const shrink = (p) => {
      if (still) { stash.appendChild(p); return; }
      p.style.height = p.offsetHeight + 'px'; void p.offsetHeight;
      tw(p, { height: '0px' }, { duration: 0.4 });
      later(() => { if (!cur || panelOf(cur) !== p) { stash.appendChild(p); p.style.height = ''; } }, 430);
    };
    const reveal = (tile) => {
      const r = tile.getBoundingClientRect();
      if (r.top < 80) window.scrollTo({ top: window.scrollY + r.top - 100, behavior: still ? 'auto' : 'smooth' });
      else later(() => {
        const p = panelOf(tile); if (!p) return;
        const pb = p.getBoundingClientRect().bottom, tt = tile.getBoundingClientRect().top;
        if (pb > window.innerHeight) window.scrollBy({ top: Math.min(pb - window.innerHeight + 24, tt - 90), behavior: still ? 'auto' : 'smooth' });
      }, still ? 0 : 580);
    };
    const toggle = (tile) => {
      const p = panelOf(tile); if (!p) return;
      const prev = cur, pp = panelOf(prev);
      if (prev === tile) { tile.setAttribute('aria-expanded', 'false'); cur = null; shrink(p); return; }
      if (prev) prev.setAttribute('aria-expanded', 'false');
      tile.setAttribute('aria-expanded', 'true'); cur = tile;
      if (pp && rowEnd(prev) === rowEnd(tile)) {
        const h = pp.offsetHeight; stash.appendChild(pp); pp.style.height = '';
        place(tile, p); grow(p, h);
      } else {
        if (pp) shrink(pp);
        place(tile, p); grow(p, 0);
      }
      reveal(tile);
    };
    sTiles.forEach(tile => {
      on(tile, 'click', () => toggle(tile));
      on(tile, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(tile); } });
    });
    Object.values(sp).forEach(p => {
      const x = p.querySelector('[data-de-scope-close]');
      if (x) on(x, 'click', () => { const t = cur; if (t) { toggle(t); t.focus({ preventScroll: true }); } });
    });
    on(document, 'keydown', (e) => { if (e.key === 'Escape' && cur) toggle(cur); });
    on(window, 'resize', () => { if (cur) place(cur, panelOf(cur)); }, { passive: true });
  }

  /* ── accordion rows (services page) ─────────────────────── */
  Array.from(root.querySelectorAll('[data-de-row]')).forEach(row => {
    const panel = row.querySelector('[data-de-panel]');
    const head = row.querySelector('[data-de-head]');
    const plus = row.querySelector('[data-de-plus]');
    if (!panel || !head) return;
    panel.style.overflow = 'hidden';
    panel.style.height = '0px';
    panel.style.opacity = '0';
    panel.style.transition = `height .55s ${EASE}, opacity .4s ${EASE}`;
    if (plus) plus.style.transition = `transform .45s ${EASE}`;
    let open = false;
    const set = (v) => {
      open = v;
      panel.style.height = v ? panel.scrollHeight + 'px' : '0px';
      panel.style.opacity = v ? '1' : '0';
      if (plus) plus.style.transform = v ? 'rotate(45deg)' : 'rotate(0deg)';
      row.style.background = v ? 'var(--color-surface)' : 'transparent';
      head.setAttribute('aria-expanded', String(v));
    };
    set(false);
    on(head, 'click', () => set(!open));
    on(window, 'resize', () => { if (open) panel.style.height = panel.scrollHeight + 'px'; });
  });

  /* ── quote form: rules fill as fields are answered ──────── */
  const form = root.querySelector('[data-de-form]');
  if (form) {
    const meter = root.querySelector('[data-de-meter]');
    const pcts = Array.from(root.querySelectorAll('[data-de-pct]'));
    const fields = Array.from(form.querySelectorAll('[data-de-required]'));
    const gauge = () => {
      const done = fields.filter(f => (f.type === 'checkbox' || f.type === 'radio')
        ? form.querySelectorAll(`[name="${f.name}"]:checked`).length > 0
        : String(f.value || '').trim().length > 1).length;
      const p = fields.length ? done / fields.length : 0;
      if (meter) tw(meter, { width: (p * 100).toFixed(0) + '%' }, { duration: 0.5 });
      pcts.forEach(el => { el.textContent = Math.round(p * 100) + '%'; });
    };
    if (meter) meter.style.transition = 'none';
    on(form, 'input', gauge); on(form, 'change', gauge);
    gauge();

    const chips = Array.from(form.querySelectorAll('label.seg-opt'));
    const paint = () => chips.forEach(c => {
      const inp = c.querySelector('input');
      const isOn = inp && inp.checked;
      tw(c, { backgroundColor: cssVar(isOn ? '--color-text' : '--color-bg'), color: cssVar(isOn ? '--color-bg' : '--color-text') }, { duration: 0.18 });
    });
    on(form, 'change', paint);
    paint();

    on(form, 'submit', (e) => {
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
      ].join('\n');
      const subject = 'Quote request: ' + (val('suburb') || 'website') + ' (' + (val('need') || 'general') + ')';
      window.location.href = 'mailto:liam@designedelectrics.com.au?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      const top = form.getBoundingClientRect().top + window.scrollY - 140;
      tw(form, { opacity: 0, y: -12 }, { duration: 0.3 });
      setTimeout(() => {
        form.style.display = 'none';
        ok.style.display = 'block';
        tw(ok, { opacity: [0, 1], y: [24, 0] }, { duration: 0.6 });
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }, 300);
    });
  }

  /* ── work filter ──────────────────────────────────────────── */
  const filters = Array.from(root.querySelectorAll('[data-de-filter]'));
  if (filters.length) {
    const items = Array.from(root.querySelectorAll('[data-de-item]'));
    const timers = [];
    const apply = (key) => {
      timers.splice(0).forEach(clearTimeout);
      filters.forEach(b => {
        const active = b.getAttribute('data-de-filter') === key;
        b.style.background = active ? 'var(--color-text)' : 'transparent';
        b.style.color = active ? 'var(--color-bg)' : 'var(--color-text)';
        b.setAttribute('aria-pressed', String(active));
      });
      let shown = 0;
      items.forEach((it) => {
        const show = key === 'all' || (it.getAttribute('data-de-item') || '').split(' ').includes(key);
        if (show) {
          const wasHidden = it.style.display === 'none';
          it.style.display = '';
          tw(it, { opacity: wasHidden ? [0, 1] : 1, scale: wasHidden ? [0.94, 1] : 1 }, { duration: 0.45, delay: (shown++) * 0.04 });
        } else if (it.style.display !== 'none') {
          tw(it, { opacity: 0, scale: 0.94 }, { duration: 0.28 });
          timers.push(setTimeout(() => { it.style.display = 'none'; }, 300));
        }
      });
    };
    filters.forEach(b => on(b, 'click', () => apply(b.getAttribute('data-de-filter'))));
    cleanups.push(() => timers.splice(0).forEach(clearTimeout));
    apply('all');
  }

  /* ── hero photo drop bridge ─────────────────────────────── */
  root.querySelectorAll('[data-de-herodrop]').forEach(sec => {
    const slot = sec.querySelector('image-slot');
    if (!slot) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(type => {
      on(sec, type, e => {
        if (e.target && e.target.closest && e.target.closest('image-slot')) return;
        e.preventDefault();
        slot.dispatchEvent(new DragEvent(type, {
          bubbles: false, cancelable: true, dataTransfer: e.dataTransfer,
        }));
      });
    });
  });

  return () => cleanups.forEach(f => f());
}
