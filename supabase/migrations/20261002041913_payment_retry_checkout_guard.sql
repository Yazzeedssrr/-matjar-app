-- Preserve the existing checkout implementation, adding a fail-closed server gate.
do $migration$
declare
  definition text;
  anchor text := 'if p_user_id is null then raise exception ''user required''; end if;';
begin
  definition := pg_get_functiondef('public.create_online_order_for_user(uuid,jsonb,text,text)'::regprocedure);
  if position(anchor in definition) = 0 then
    raise exception 'checkout definition changed; review required';
  end if;
  execute replace(definition, anchor, anchor || E'\n  if not coalesce((select checkout_enabled from public.store_settings where id=1),false) then raise exception ''checkout is disabled''; end if;');
end;
$migration$;

-- A single transaction covers the ledger, payment, order and inventory release.
-- Exceptions roll everything back, leaving failed events eligible for retry.
create or replace function public.process_stripe_checkout_event(p_event jsonb)
returns text language plpgsql security invoker set search_path = ''
as $function$
<<webhook>>
declare
  event_id text := p_event->>'id';
  event_type text := p_event->>'type';
  obj jsonb := p_event->'data'->'object';
  session_id text := obj->>'id';
  order_id uuid := coalesce(obj->'metadata'->>'order_id',obj->>'client_reference_id')::uuid;
  ledger public.stripe_webhook_events%rowtype;
  payment public.payments%rowtype;
  store_order public.orders%rowtype;
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then
    raise exception 'service role required';
  end if;
  if event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded',
                        'checkout.session.expired','checkout.session.async_payment_failed')
     or event_type is null or coalesce(event_id,'')='' or coalesce(session_id,'')='' or order_id is null then
    raise exception 'invalid checkout event';
  end if;
  insert into public.stripe_webhook_events(event_id,event_type,checkout_session_id,order_id,livemode)
  values(event_id,event_type,session_id,order_id,coalesce((p_event->>'livemode')::boolean,false))
  on conflict on constraint stripe_webhook_events_pkey do nothing;
  select * into strict ledger from public.stripe_webhook_events e where e.event_id=webhook.event_id for update;
  if ledger.processed_at is not null then return 'duplicate'; end if;
  if ledger.event_type<>event_type or ledger.checkout_session_id is distinct from session_id
     or ledger.order_id is distinct from order_id then raise exception 'event identity mismatch'; end if;

  -- Match lock ordering used by release_online_order; serialize different events for one order.
  select * into strict store_order from public.orders o where o.id=order_id for update;
  select * into strict payment from public.payments p where p.checkout_session_id=session_id for update;
  if payment.order_id<>order_id or payment.provider<>'stripe' or store_order.payment_method<>'online' then
    raise exception 'checkout order mismatch';
  end if;
  if event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded') then
    if obj->>'payment_status'='paid' then
      if (obj->>'amount_total')::numeric is distinct from round(payment.amount*100)
         or lower(obj->>'currency') is distinct from lower(payment.currency::text) then
        raise exception 'payment amount or currency mismatch';
      end if;
      if store_order.status='cancelled' and store_order.payment_status<>'paid' then
        raise exception 'payment received for released order; reconciliation required';
      end if;
      update public.payments p set status='paid',raw_status=coalesce(obj->>'status','complete'),
        provider_payment_id=obj->>'payment_intent',payment_intent_id=obj->>'payment_intent' where p.id=payment.id;
      update public.orders o set payment_status='paid',status='confirmed'
        where o.id=order_id and o.payment_status<>'paid';
    elsif event_type='checkout.session.async_payment_succeeded' then
      raise exception 'successful payment event is not paid';
    end if;
  elsif store_order.payment_status<>'paid' and payment.status<>'paid' then
    update public.payments p set status='failed',raw_status=case when event_type='checkout.session.expired' then 'expired' else 'failed' end
      where p.id=payment.id;
    perform public.release_online_order(order_id);
  end if;
  update public.stripe_webhook_events e set processed_at=now(),error=null where e.event_id=webhook.event_id;
  return 'ok';
end;
$function$;
revoke all on function public.process_stripe_checkout_event(jsonb) from public,anon,authenticated;
grant execute on function public.process_stripe_checkout_event(jsonb) to service_role;
