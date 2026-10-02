import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
]);

function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").map((x) => x.trim().split("="));
  const timestamp = parts.find((x) => x[0] === "t")?.[1];
  const signatures = parts.filter((x) => x[0] === "v1").map((x) => x[1]);
  if (!timestamp || !signatures.length) return false;
  if (!/^\d+$/.test(timestamp) || !Number.isFinite(Number(timestamp)) || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = hex(new Uint8Array(sig));
  return signatures.some((s) => safeEqual(s, expected));
}

async function rest(url: string, serviceKey: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`supabase_rest_failed:${res.status}:${detail.slice(0, 500)}`);
  }
  return res;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    return new Response("server not configured", { status: 503 });
  }

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") || "";
  if (!(await verifyStripeSignature(payload, signature, webhookSecret))) {
    return new Response("invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  if (!SUPPORTED_EVENTS.has(event?.type)) {
    return new Response("ignored", { status: 200 });
  }

  const eventId = String(event?.id || "");
  if (!eventId) return new Response("missing event id", { status: 400 });

  try {
    const res = await rest(supabaseUrl, serviceKey, "rpc/process_stripe_checkout_event", {
      method: "POST",
      body: JSON.stringify({ p_event: event }),
    });
    const result = await res.json();
    return new Response(result === "duplicate" ? "duplicate" : "ok", { status: 200 });
  } catch (err) {
    console.error("webhook handling error", err);
    return new Response("webhook handling failed", { status: 500 });
  }

});
