# MAKHRAJ Stripe setup

Current backend project: Supabase `Makhraj` (`fskfwngswatbetgxkmei`).

## Deployed functions

- `create-stripe-checkout` — authenticated checkout creation
- `cancel-stripe-checkout` — authenticated cancellation for unpaid online orders
- `stripe-status` — authenticated readiness check
- `stripe-webhook` — public Stripe webhook endpoint with Stripe signature verification

Webhook endpoint:

`https://fskfwngswatbetgxkmei.supabase.co/functions/v1/stripe-webhook`

## Required Edge Function secrets

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Never put either secret in client-side JavaScript or commit their values to GitHub.

## Stripe Sandbox webhook events

Create a Webhook/Event Destination for **Your account** and select only:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `checkout.session.async_payment_failed`

After the destination is created, copy its signing secret into Supabase Edge Function Secrets as `STRIPE_WEBHOOK_SECRET`.

## Readiness

`stripe-status` should return:

- `secret_configured: true`
- `webhook_configured: true`
- `ready: true`
- `mode: "test"` while using Sandbox keys

Do not enable live payments until a complete Sandbox checkout has been tested end-to-end.

## Webhook durability

Webhook deliveries are recorded in `public.stripe_webhook_events` using Stripe event IDs as the primary key. This prevents Stripe retries from applying the same payment event twice. The full Stripe payload is intentionally not stored.
