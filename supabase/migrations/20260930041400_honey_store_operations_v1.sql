-- Applied as honey_store_operations_v1. Existing products, orders, users, images and payment settings are not changed.
create table if not exists public.store_ops_records (
 kind text not null check (kind in ('setup','supplier','supply','policy','fulfillment')),
 record_id text not null check (length(record_id) between 1 and 100),
 revision bigint not null default 1,
 data jsonb not null default '{}'::jsonb check (jsonb_typeof(data)='object'),
 updated_at timestamptz not null default now(), updated_by uuid,
 primary key(kind,record_id)
);
create table if not exists public.store_ops_history (
 id bigint generated always as identity primary key,
 kind text not null,record_id text not null,revision bigint not null,
 data jsonb not null,created_at timestamptz not null default now(),actor_id uuid,
 unique(kind,record_id,revision)
);
create table if not exists public.store_public_content (
 kind text not null check(kind in ('policy','contact','facts')),
 record_id text not null,source_revision bigint not null,
 data jsonb not null check(jsonb_typeof(data)='object'),
 published_at timestamptz not null default now(),primary key(kind,record_id)
);
alter table public.store_ops_records enable row level security;
alter table public.store_ops_history enable row level security;
alter table public.store_public_content enable row level security;
create policy store_ops_admin_read on public.store_ops_records for select to authenticated using ((select private.is_admin()));
create policy store_ops_history_admin_read on public.store_ops_history for select to authenticated using ((select private.is_admin()));
create policy store_content_public_read on public.store_public_content for select to anon,authenticated using (kind <> 'facts' or exists(select 1 from public.products p where p.id::text=record_id and p.status='active'));
revoke all on public.store_ops_records,public.store_ops_history,public.store_public_content from anon,authenticated;
grant select on public.store_ops_records,public.store_ops_history to authenticated;
grant select on public.store_public_content to anon,authenticated;

create or replace function public.admin_save_store_record(p_kind text,p_id text,p_data jsonb,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.store_ops_records%rowtype; s public.store_ops_records%rowtype; v_phase text;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_kind not in ('setup','supplier','supply','policy','fulfillment') or p_id is null or length(p_id) not between 1 and 100 or p_revision is null or p_revision<0 or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>65536 then raise exception 'INVALID_RECORD';end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k ~* '(password|secret|api.?key|access.?token)') then raise exception 'DO_NOT_STORE_CREDENTIALS';end if;
 if p_kind='setup' and p_id<>'primary' then raise exception 'INVALID_SETUP_ID';end if;
 if p_kind='policy' then
  if p_id not in ('about','shipping','returns','privacy','terms','contact') or jsonb_typeof(p_data->'texts') is distinct from 'object' then raise exception 'INVALID_POLICY';end if;
  if exists(select 1 from jsonb_each(p_data->'texts') x where x.key not in ('ar','en','es','fr','tr') or jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>10000) then raise exception 'INVALID_POLICY_TEXT';end if;
 end if;
 if p_kind='supplier' then
  if length(trim(coalesce(p_data->>'name','')))<2 then raise exception 'SUPPLIER_NAME_REQUIRED';end if;
  if p_data->>'status'='confirmed' and (length(trim(coalesce(p_data->>'agreement','')))<10 or length(trim(coalesce(p_data->>'shipping_terms','')))<10 or length(trim(coalesce(p_data->>'damage_terms','')))<10) then raise exception 'SUPPLIER_TERMS_REQUIRED';end if;
 end if;
 if p_kind='supply' then
  if not exists(select 1 from public.products where id::text=p_id) then raise exception 'PRODUCT_NOT_FOUND';end if;
  if coalesce(p_data->>'supplier_id','')<>'' and not exists(select 1 from public.store_ops_records where kind='supplier' and record_id=p_data->>'supplier_id') then raise exception 'SUPPLIER_NOT_FOUND';end if;
  if exists(select 1 from jsonb_each_text(p_data) x where x.key in ('unit_cost','supplier_shipping','other_cost','available_quantity','net_weight_g') and x.value<>'' and x.value !~ '^([0-9]{1,9})(\.[0-9]{1,2})?$') then raise exception 'INVALID_NONNEGATIVE_NUMBER';end if;
  if coalesce(p_data->>'available_quantity','')<>'' and p_data->>'available_quantity' !~ '^[0-9]{1,9}$' then raise exception 'QUANTITY_MUST_BE_INTEGER';end if;
  if p_data->>'reviewed'='true' and (coalesce(p_data->>'supplier_id','')='' or length(trim(coalesce(p_data->>'evidence','')))<10 or length(trim(coalesce(p_data->>'origin','')))<2 or length(trim(coalesce(p_data->>'ingredients','')))<2 or coalesce(p_data->>'net_weight_g','')='' or (p_data->>'net_weight_g')::numeric<=0) then raise exception 'PRODUCT_EVIDENCE_REQUIRED';end if;
 end if;
 if p_kind='fulfillment' then
  if not exists(select 1 from public.orders where id::text=p_id) then raise exception 'ORDER_NOT_FOUND';end if;
  v_phase=coalesce(p_data->>'phase','todo');
  if v_phase not in ('todo','contacted','ordered','dispatched','issue') then raise exception 'INVALID_FULFILLMENT_PHASE';end if;
  if v_phase in ('ordered','dispatched') then
   if not exists(select 1 from public.orders o where o.id::text=p_id and o.payment_status='paid' and o.payment_method='online' and exists(select 1 from public.stripe_webhook_events e where e.order_id=o.id and e.livemode=true) and not exists(select 1 from public.stripe_webhook_events e where e.order_id=o.id and e.livemode=false)) then raise exception 'LIVE_PAYMENT_NOT_VERIFIED';end if;
   if coalesce(p_data->>'supplier_reference','')='' then raise exception 'SUPPLIER_REFERENCE_REQUIRED';end if;
   if not exists(select 1 from public.store_ops_records where kind='supplier' and record_id=p_data->>'supplier_id' and data->>'status'='confirmed') then raise exception 'CONFIRMED_SUPPLIER_REQUIRED';end if;
  end if;
  if v_phase='dispatched' and (coalesce(p_data->>'tracking','')='' or coalesce(p_data->>'carrier','')='') then raise exception 'TRACKING_REQUIRED';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||':'||p_id,0));
 select * into r from public.store_ops_records where kind=p_kind and record_id=p_id for update;
 if found then
  if r.revision<>p_revision then
   if r.revision=p_revision+1 and r.data=p_data then return to_jsonb(r);end if;
   raise exception 'EDIT_CONFLICT_RELOAD';
  end if;
  if r.data=p_data then return to_jsonb(r);end if;
  update public.store_ops_records set revision=revision+1,data=p_data,updated_at=now(),updated_by=auth.uid() where kind=p_kind and record_id=p_id returning * into s;
 else
  if p_revision<>0 then raise exception 'EDIT_CONFLICT_RELOAD';end if;
  insert into public.store_ops_records(kind,record_id,data,updated_by) values(p_kind,p_id,p_data,auth.uid()) returning * into s;
 end if;
 insert into public.store_ops_history(kind,record_id,revision,data,actor_id) values(s.kind,s.record_id,s.revision,s.data,auth.uid());
 return to_jsonb(s);
end;$$;
revoke all on function public.admin_save_store_record(text,text,jsonb,bigint) from public,anon;
grant execute on function public.admin_save_store_record(text,text,jsonb,bigint) to authenticated;

create or replace function public.admin_publish_store_record(p_kind text,p_id text,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.store_ops_records%rowtype;v_data jsonb;v_kind text;res public.store_public_content%rowtype;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 select * into r from public.store_ops_records where kind=p_kind and record_id=p_id for update;
 if not found or p_revision is null or r.revision<>p_revision then raise exception 'EDIT_CONFLICT_RELOAD';end if;
 if r.data->>'approved' is distinct from 'true' then raise exception 'OWNER_APPROVAL_REQUIRED';end if;
 if p_kind='policy' then
  if length(trim(coalesce(r.data#>>'{texts,ar}','')))<30 or length(trim(coalesce(r.data#>>'{texts,en}','')))<30 then raise exception 'ARABIC_AND_ENGLISH_POLICY_REQUIRED';end if;
  if r.data::text ~ '(\[TODO\]|\[أكمل\])' then raise exception 'UNFINISHED_POLICY';end if;
  v_kind='policy';v_data=jsonb_build_object('texts',r.data->'texts');
 elsif p_kind='setup' and p_id='primary' then
  if length(trim(coalesce(r.data->>'merchant_name','')))<2 or coalesce(r.data->>'support_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'PUBLIC_CONTACT_REQUIRED';end if;
  v_kind='contact';v_data=jsonb_build_object('merchant_name',r.data->>'merchant_name','support_email',r.data->>'support_email','support_phone',coalesce(r.data->>'support_phone',''),'service_area',coalesce(r.data->>'service_area',''),'contact_hours',coalesce(r.data->>'contact_hours',''));
 elsif p_kind='supply' then
  if r.data->>'reviewed' is distinct from 'true' or not exists(select 1 from public.store_ops_records s where s.kind='supplier' and s.record_id=r.data->>'supplier_id' and s.data->>'status'='confirmed') then raise exception 'REVIEWED_PRODUCT_AND_SUPPLIER_REQUIRED';end if;
  v_kind='facts';v_data=jsonb_build_object('origin',r.data->>'origin','net_weight_g',r.data->>'net_weight_g','ingredients',r.data->>'ingredients','storage',coalesce(r.data->>'storage',''),'packer',coalesce(r.data->>'packer',''),'honey_type',coalesce(r.data->>'honey_type',''),'allergens',coalesce(r.data->>'allergens',''),'dispatch_window',coalesce(r.data->>'dispatch_window',''));
 else raise exception 'PRIVATE_RECORD_CANNOT_BE_PUBLISHED';end if;
 insert into public.store_public_content(kind,record_id,source_revision,data) values(v_kind,p_id,r.revision,v_data)
 on conflict(kind,record_id) do update set source_revision=excluded.source_revision,data=excluded.data,published_at=now() returning * into res;
 return to_jsonb(res);
end;$$;
revoke all on function public.admin_publish_store_record(text,text,bigint) from public,anon;
grant execute on function public.admin_publish_store_record(text,text,bigint) to authenticated;

create or replace function public.admin_unpublish_store_content(p_kind text,p_id text,p_revision bigint)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 delete from public.store_public_content where kind=p_kind and record_id=p_id and source_revision=p_revision;
 if not found then raise exception 'EDIT_CONFLICT_RELOAD';end if;
 return true;
end;$$;
revoke all on function public.admin_unpublish_store_content(text,text,bigint) from public,anon;
grant execute on function public.admin_unpublish_store_content(text,text,bigint) to authenticated;
