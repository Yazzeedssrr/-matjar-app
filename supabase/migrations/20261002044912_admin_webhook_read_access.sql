-- The existing admin-only RLS policy remains mandatory.
do $check$
begin
  if not (select relrowsecurity from pg_class where oid='public.stripe_webhook_events'::regclass)
     or not exists(select 1 from pg_policies where schemaname='public' and tablename='stripe_webhook_events'
       and policyname='stripe_webhook_events_admin_read' and qual='private.is_admin()' and roles=array['authenticated']::name[]) then
    raise exception 'admin-only webhook policy required';
  end if;
end;
$check$;
-- Only the two fields used by the operations readiness/fulfillment view.
grant select(order_id,livemode) on public.stripe_webhook_events to authenticated;
