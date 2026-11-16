// website-enquiry: receives the quote form from designedelectrics.com.au.
// Saves the enquiry as an inbound lead in Jobflow (public.leads + public.lead_activities)
// and emails it to the owner through Resend. Public endpoint (no login), so it validates
// everything, drops bots quietly (honeypot + minimum fill time) and limits each sender
// to 5 enquiries an hour.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGINS = [
  "https://designedelectrics.com.au",
  "https://www.designedelectrics.com.au",
];
const PREVIEW = /^https:\/\/([a-z0-9-]+\.)?designed-electrics\.pages\.dev$/;
const LOCAL = /^http:\/\/localhost:\d+$/;

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const ok = ORIGINS.includes(origin) || PREVIEW.test(origin) || LOCAL.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

// Form checkbox values mapped to the Jobflow service_fit vocabulary.
const NEED_TO_FIT: Record<string, string[]> = {
  solar: ["solar", "battery"], ev: ["general electrical"], hotwater: ["general electrical", "plumbing"],
  generator: ["general electrical"], newbuild: ["general electrical"], rural: ["general electrical"],
  switchboard: ["switchboard"], maintenance: ["general electrical"], plumbing: ["plumbing", "gas"], other: [],
};

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function perthStamp(d = new Date()) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Perth", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(d) + " AWST";
}

async function notify(subject: string, html: string, replyTo: string | null) {
  const key = Deno.env.get("RESEND_API_KEY");
  const owner = Deno.env.get("OWNER_EMAIL") ?? "liam@designedelectrics.com.au";
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };
  const from = Deno.env.get("ENQUIRY_FROM") ?? Deno.env.get("QUOTE_FROM") ?? "Designed Electrics <quotes@designedelectrics.com.au>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [owner], reply_to: replyTo ?? owner, subject, html }),
    });
    const body = await r.json().catch(() => ({}));
    return r.ok ? { sent: true, id: body.id } : { sent: false, status: r.status, body };
  } catch (e) {
    return { sent: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const raw = await req.text();
  if (raw.length > 20_000) return json(req, { error: "Too large" }, 413);
  let b: Record<string, unknown> = {};
  try { b = JSON.parse(raw || "{}"); } catch { return json(req, { error: "Bad request" }, 400); }

  // Bots: a filled honeypot or a form finished in under 3 seconds gets a quiet "ok" and is dropped.
  if (clean(b.website, 200) !== "" || Number(b.elapsed ?? 0) < 3000) return json(req, { ok: true });

  const name = clean(b.name, 120);
  const phone = clean(b.phone, 40);
  const email = clean(b.email, 200);
  const suburb = clean(b.suburb, 80);
  const detail = clean(b.detail, 4000);
  const property = clean(b.property, 60);
  const timing = clean(b.timing, 80);
  const needText = clean(b.needText, 300);
  const needs = Array.isArray(b.need) ? (b.need as unknown[]).map((x) => clean(x, 20)).filter((x) => x in NEED_TO_FIT) : [];

  if (name.length < 2) return json(req, { error: "Please enter your name.", field: "name" }, 400);
  if (phone.replace(/\D/g, "").length < 8) return json(req, { error: "Please enter a phone number we can call.", field: "phone" }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(req, { error: "That email address does not look right.", field: "email" }, 400);
  if (suburb.length < 2) return json(req, { error: "Please enter the site suburb.", field: "suburb" }, 400);
  if (detail.length < 2) return json(req, { error: "Please tell us about the job.", field: "detail" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const iph = ip ? (await sha256Hex("de-enquiry|" + ip)).slice(0, 16) : "noip";
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("lead_activities").select("id", { count: "exact", head: true })
      .eq("author_name", "Website form").gte("created_at", since).like("body", `%[src:${iph}]%`);
    if ((count ?? 0) >= 5) return json(req, { error: "We have already received several requests from you. Please call 0438 593 586.", field: "rate" }, 429);

    const { data: co, error: coErr } = await db.from("companies").select("id").order("created_at").limit(1).single();
    if (coErr || !co) throw new Error("company lookup failed: " + (coErr?.message ?? "none"));

    const fit = [...new Set(needs.flatMap((n) => NEED_TO_FIT[n]))];
    const lead = {
      company_id: co.id, business_name: name, contact_name: name, lead_type: "inbound", category: property || null,
      service_fit: fit, locality: suburb, phone, email: email || null, source: "website", why_fit: detail,
      notes: [needText && `Needs: ${needText}`, timing && `Timing: ${timing}`].filter(Boolean).join(". ") || null,
      stage: "new", email_consent: email ? "express" : "none", next_action: "Call back about website enquiry",
      next_action_due: new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(new Date()),
      checked_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(new Date()),
    };

    let leadId: string | null = null;
    let repeat = false;
    const ins = await db.from("leads").insert(lead).select("id").single();
    if (ins.error) {
      if (ins.error.code !== "23505") throw new Error("lead insert: " + ins.error.message);
      // Same name and suburb already on file: attach this enquiry to that lead instead of a duplicate.
      repeat = true;
      const { data: ex } = await db.from("leads").select("id, stage").eq("company_id", co.id).is("deleted_at", null)
        .ilike("business_name", name).ilike("locality", suburb).limit(1).maybeSingle();
      if (!ex) throw new Error("duplicate lead not found");
      leadId = ex.id;
      const upd: Record<string, unknown> = { next_action: lead.next_action, next_action_due: lead.next_action_due, phone };
      if (email) { upd.email = email; upd.email_consent = "express"; }
      if (["lost", "won"].includes(ex.stage)) upd.stage = "new";
      await db.from("leads").update(upd).eq("id", ex.id);
    } else {
      leadId = ins.data.id;
    }

    const bodyText = [
      `Website enquiry ${perthStamp()}`, needText && `Needs: ${needText}`, property && `Property: ${property}`,
      `Suburb: ${suburb}`, timing && `Timing: ${timing}`, `Name: ${name}`, `Phone: ${phone}`, `Email: ${email || "not given"}`,
      "", detail, "", `[src:${iph}]`,
    ].filter((x) => x !== "" && x !== false && x !== null).join("\n");
    await db.from("lead_activities").insert({ company_id: co.id, lead_id: leadId, kind: "note", body: bodyText, author_name: "Website form" });

    const rows: [string, string][] = [
      ["Needs", needText || "Not specified"], ["Property", property || "Not specified"], ["Suburb", suburb],
      ["Timing", timing || "Not specified"], ["Name", name], ["Phone", phone], ["Email", email || "Not given"],
      ["Received", perthStamp()],
    ];
    const tel = phone.replace(/[^\d+]/g, "");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#18171C">
  <div style="background:#18171C;padding:20px 24px;border-bottom:4px solid #F35402"><span style="color:#FFFFFF;font-weight:800;font-size:18px">Designed Electrics</span></div>
  <div style="padding:24px;border:1px solid #C9C8CD;border-top:0">
    <h2 style="margin:0 0 12px;font-size:20px">New website enquiry${repeat ? " (repeat enquiry)" : ""}</h2>
    <p style="margin:0 0 16px"><a href="tel:${esc(tel)}" style="background:#F35402;color:#FFFFFF;padding:10px 16px;text-decoration:none;font-weight:700">Call ${esc(name)}</a></p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">${rows.map(([k, v]) =>
      `<tr><td style="padding:6px 0;color:#424146;width:35%;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:700">${esc(v)}</td></tr>`).join("")}</table>
    <h3 style="margin:18px 0 6px;font-size:15px">The job</h3>
    <p style="margin:0;white-space:pre-wrap;font-size:14px">${esc(detail)}</p>
    <p style="margin:18px 0 0;font-size:12px;color:#7B7E86">Saved to Jobflow as an inbound lead.${email ? " Reply to this email to answer the customer directly." : ""}</p>
  </div></div>`;
    const mail = await notify(`Website enquiry: ${suburb} (${needText || "general"})`, html, email || null);
    if (!mail.sent) console.error("enquiry email not sent", JSON.stringify(mail));
    await db.from("lead_activities").insert({
      company_id: co.id, lead_id: leadId, kind: "note", author_name: "Website form",
      body: mail.sent ? "Enquiry emailed to owner." : `Enquiry email NOT sent: ${JSON.stringify(mail).slice(0, 300)}`,
    });

    return json(req, { ok: true });
  } catch (e) {
    console.error("website-enquiry", String(e));
    // The page falls back to a filled-in email when it gets an error without a field.
    return json(req, { error: "Server error" }, 500);
  }
});
