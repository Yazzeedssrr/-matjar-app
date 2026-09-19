
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "https://yazzeedssrr.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey) return json({ error: "stripe_not_configured" }, 503);
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "server_not_configured" }, 503);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: anonKey },
  });
  if (!userRes.ok) return json({ error: "invalid_session" }, 401);
  const user = await userRes.json();
  if (!user?.id) return json({ error: "invalid_session" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const address = body?.shipping_address;
  const notes = typeof body?.notes === "string" ? body.notes.slice(0, 1000) : null;
  const couponCode = typeof body?.coupon_code === "string" ? body.coupon_code.slice(0, 80) : null;

  if (!address?.recipient_name || !address?.phone || !address?.line1 || !address?.city) {
    return json({ error: "complete_shipping_address_required" }, 400);
  }

  const allowedOrigin = "https://yazzeedssrr.github.io";

  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/create_online_order_for_user`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_user_id: user.id,
      p_shipping_address: address,
      p_notes: notes,
      p_coupon_code: couponCode,
    }),
  });

  if (!rpcRes.ok) {
    const detail = await rpcRes.text();
    return json({ error: "order_creation_failed", detail }, 400);
  }
  const orderId = await rpcRes.json();

  try {
    const orderRes = await fetch(
      `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,order_number,total,currency`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!orderRes.ok) throw new Error("order_lookup_failed");
    const orders = await orderRes.json();
    const order = orders?.[0];
    if (!order) throw new Error("order_not_found");

    const amount = Math.round(Number(order.total) * 100);
    if (!Number.isFinite(amount) || amount < 50) throw new Error("invalid_order_total");

    const successUrl = `${allowedOrigin}/-matjar-app/app.html?payment=success&order_id=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${allowedOrigin}/-matjar-app/app.html?payment=cancelled&order_id=${encodeURIComponent(orderId)}`;
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", successUrl);
    form.set("cancel_url", cancelUrl);
    form.set("client_reference_id", String(orderId));
    form.set("metadata[order_id]", String(orderId));
    form.set("metadata[user_id]", String(user.id));
    form.set("payment_intent_data[metadata][order_id]", String(orderId));
    form.set("payment_intent_data[metadata][user_id]", String(user.id));
    if (user.email) form.set("customer_email", String(user.email));
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", String(order.currency || "USD").toLowerCase());
    form.set("line_items[0][price_data][unit_amount]", String(amount));
    form.set("line_items[0][price_data][product_data][name]", `MAKHRAJ Order MK-${String(order.order_number).padStart(6, "0")}`);
    form.set("line_items[0][price_data][product_data][description]", "Online order from MAKHRAJ");
    form.set("expires_at", String(Math.floor(Date.now() / 1000) + 1800));

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok || !session?.id || !session?.url) {
      throw new Error(session?.error?.message || "stripe_session_failed");
    }

    const payRes = await fetch(`${supabaseUrl}/rest/v1/payments`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        order_id: orderId,
        provider: "stripe",
        amount: Number(order.total),
        currency: order.currency || "USD",
        status: "unpaid",
        checkout_session_id: session.id,
        checkout_url: session.url,
        expires_at: new Date(Number(session.expires_at) * 1000).toISOString(),
        raw_status: session.status || "open",
      }),
    });
    if (!payRes.ok) throw new Error("payment_record_failed");

    return json({ checkout_url: session.url, order_id: orderId, session_id: session.id });
  } catch (err) {
    await fetch(`${supabaseUrl}/rest/v1/rpc/release_online_order`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_order_id: orderId }),
    }).catch(() => {});
    return json({ error: "checkout_creation_failed", detail: String(err?.message || err) }, 500);
  }
});
