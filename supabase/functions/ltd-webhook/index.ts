// Lifetime deal fulfillment — Dodo webhook endpoint.
//
// Dodo -> this function -> public.ltd_fulfill() / public.ltd_reverse().
// It acts ONLY on products listed in public.ltd_tiers.dodo_product_id; every
// other payment is acknowledged and ignored, so it can share Dodo's event stream
// with dodo-webhook-handler, dodo-webhook (PostHog bridge) and referral without
// touching what they do.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   DODO_LTD_WEBHOOK_SECRET   the whsec_... of THIS endpoint in Dodo
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
//
// Deployed with verify_jwt = false: Dodo cannot send a Supabase JWT. The
// Standard Webhooks signature below is the authentication.
// See docs/ltd-campaign.md.

const POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_KEY = "phc_HqgzMyWAMtzH7K5j9CLw0dijB0I9W1VjPkkyzg9KOFG"; // public project key

const PAYING = new Set(["payment.succeeded"]);
const REVERSING: Record<string, string> = {
  "refund.succeeded": "refund",
  "dispute.opened": "dispute",
  "payment.cancelled": "refund",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("DODO_LTD_WEBHOOK_SECRET");
  // 503, not 401: until the secret is set, let Dodo keep retrying instead of
  // dropping a real payment on the floor.
  if (!secret) return json({ error: "DODO_LTD_WEBHOOK_SECRET not configured" }, 503);

  const raw = await req.text();
  const verified = await verifySignature(req, raw, secret);
  if (!verified.ok) return json({ error: verified.reason }, 401);

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return json({ error: "invalid json" }, 400); }
  const type: string = payload?.type || payload?.event_type || "";
  const data = payload?.data || {};

  if (REVERSING[type]) {
    const paymentId = data.payment_id;
    if (!paymentId) return json({ ok: true, ignored: "no payment_id" });
    const r = await rpc("ltd_reverse", { p_payment_id: paymentId, p_reason: REVERSING[type] });
    if (!r.ok) return json({ error: "reverse failed", detail: r.body }, 500);
    if (!r.body?.noop) {
      await capture(r.body?.user_token || "ltd_unmatched", "ltd_refunded", {
        payment_id: paymentId, reason: REVERSING[type], tier: r.body?.tier, dodo_event_type: type,
      });
    }
    return json({ ok: true, reversed: !r.body?.noop });
  }

  if (!PAYING.has(type)) return json({ ok: true, ignored: type || "unknown" });

  const paymentId = data.payment_id;
  const productId = data.product_cart?.[0]?.product_id || data.product_id || null;
  if (!paymentId || !productId) return json({ ok: true, ignored: "no payment_id or product" });

  const amount = typeof data.total_amount === "number" ? data.total_amount / 100 : null;
  const md = data.metadata || {};
  const r = await rpc("ltd_fulfill", {
    p_payment_id: paymentId,
    p_product_id: productId,
    p_amount_usd: amount,
    p_email: data.customer?.email || null,
    p_dodo_customer_id: data.customer?.customer_id || null,
    p_token: md.user_token || null,
    p_source: md.attribution_source || md.utm_source || null,
    p_campaign: md.attribution_campaign || md.utm_campaign || null,
  });
  // 500 makes Dodo retry; ltd_fulfill is idempotent on payment_id, so a retry is safe.
  if (!r.ok) return json({ error: "fulfill failed", detail: r.body }, 500);
  if (r.body?.ignored || r.body?.duplicate) return json(r.body);

  const matched = r.body?.status === "active";
  // An unmatched buyer gets their own PostHog person, keyed by payment, so
  // workflow 29 can email them their claim code without lumping every
  // unmatched buyer into one person.
  await capture(r.body?.user_token || `ltd_unmatched_${paymentId}`, matched ? "ltd_purchased" : "ltd_purchase_unmatched", {
    payment_id: paymentId,
    tier: r.body?.tier,
    monthly_credits: r.body?.monthly_credits,
    value: amount,
    revenue: amount,
    currency: data.currency || "USD",
    customer_email: data.customer?.email || null,
    attribution_source: md.attribution_source || md.utm_source || null,
    attribution_campaign: md.attribution_campaign || md.utm_campaign || null,
    claim_code: r.body?.claim_code || undefined,
    source: "ltd_webhook",
    ...(matched ? {} : { $set: { email: data.customer?.email || null } }),
  });
  return json({ ok: true, status: r.body?.status, tier: r.body?.tier });
});

async function rpc(fn: string, args: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { ok: res.ok, body };
}

async function capture(distinctId: string, event: string, properties: Record<string, unknown>) {
  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_KEY, event, distinct_id: distinctId, properties }),
    });
  } catch { /* analytics must never fail a payment */ }
}

// Standard Webhooks (what Dodo implements): HMAC-SHA256 over
// `${id}.${timestamp}.${body}`, base64, several "v1,<sig>" entries allowed.
async function verifySignature(req: Request, raw: string, secret: string) {
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return { ok: false, reason: "missing signature headers" };
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "timestamp outside tolerance" };

  const keyBytes = b64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  const expected = bytesToB64(mac);
  for (const part of sigHeader.split(" ")) {
    const sig = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
    if (safeEqual(sig, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function b64ToBytes(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
