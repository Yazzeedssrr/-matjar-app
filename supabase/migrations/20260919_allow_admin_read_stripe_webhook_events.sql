-- Admins may inspect Stripe webhook delivery results; clients cannot insert/update/delete.

create policy stripe_webhook_events_admin_read
on public.stripe_webhook_events
for select
to authenticated
using (private.is_admin());
