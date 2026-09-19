-- Production-hardening ledger for Stripe webhook delivery.
-- Keeps webhook processing idempotent without storing full Stripe payloads.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  checkout_session_id text,
  order_id uuid references public.orders(id) on delete set null,
  livemode boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

alter table public.stripe_webhook_events enable row level security;

revoke all on table public.stripe_webhook_events from anon, authenticated;

create index if not exists stripe_webhook_events_received_idx
  on public.stripe_webhook_events (received_at desc);

create index if not exists stripe_webhook_events_order_idx
  on public.stripe_webhook_events (order_id)
  where order_id is not null;
