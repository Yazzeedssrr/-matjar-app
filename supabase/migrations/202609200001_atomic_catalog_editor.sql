-- Additive migration: no catalog rows or existing tables are removed.
-- Storage uploads happen first; all catalog rows commit atomically afterward.
create table if not exists private.catalog_save_receipts (
  request_id uuid primary key,
  actor_id uuid not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.catalog_save_receipts enable row level security;
revoke all on private.catalog_save_receipts from public, anon, authenticated;

create or replace function public.admin_save_product_v2(
  p_request_id uuid,
  p_product jsonb,
  p_variant jsonb,
  p_images jsonb default '[]'::jsonb,
  p_expected_product_updated_at timestamptz default null,
  p_expected_variant_updated_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_hash text;
  v_receipt private.catalog_save_receipts%rowtype;
  v_pid uuid;
  v_vid uuid;
  v_category uuid;
  v_old public.products%rowtype;
  v_old_variant public.product_variants%rowtype;
  v_product_exists boolean;
  v_variant_exists boolean;
  v_status public.product_status;
  v_name text;
  v_sku text;
  v_price numeric(12,2);
  v_compare numeric(12,2);
  v_cost numeric(12,2);
  v_stock integer;
  v_weight integer;
  v_image jsonb;
  v_image_id uuid;
  v_path text;
  v_url text;
  v_count integer;
  v_result jsonb;
begin
  if v_actor is null or not private.is_admin() then
    raise exception using errcode='42501', message='admin_required';
  end if;
  if p_request_id is null or jsonb_typeof(p_product) is distinct from 'object'
     or jsonb_typeof(p_variant) is distinct from 'object'
     or jsonb_typeof(p_images) is distinct from 'array' then
    raise exception 'invalid_request';
  end if;
  v_hash := md5(jsonb_build_array(p_product,p_variant,p_images,
    p_expected_product_updated_at,p_expected_variant_updated_at)::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into v_receipt from private.catalog_save_receipts where request_id=p_request_id;
  if found then
    if v_receipt.actor_id<>v_actor or v_receipt.request_hash<>v_hash then
      raise exception 'request_id_reused';
    end if;
    return v_receipt.result || jsonb_build_object('replayed',true);
  end if;

  v_pid := (p_product->>'id')::uuid;
  v_vid := (p_variant->>'id')::uuid;
  v_category := (p_product->>'category_id')::uuid;
  v_name := btrim(coalesce(p_product->>'name',''));
  v_sku := btrim(coalesce(p_variant->>'sku',''));
  if v_pid is null or v_vid is null or v_category is null
     or length(v_name) not between 2 and 200 or length(v_sku) not between 1 and 100 then
    raise exception 'required_product_fields';
  end if;
  if coalesce(p_product->>'status','') not in ('draft','active') then raise exception 'invalid_status'; end if;
  v_status := (p_product->>'status')::public.product_status;
  if coalesce(p_variant->>'price','') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
     or coalesce(p_variant->>'stock_quantity','') !~ '^[0-9]{1,7}$' then
    raise exception 'invalid_price_or_quantity';
  end if;
  v_price := (p_variant->>'price')::numeric;
  v_stock := (p_variant->>'stock_quantity')::integer;
  if v_price<=0 or v_stock>1000000 then raise exception 'invalid_price_or_quantity'; end if;
  if nullif(p_product->>'compare_at_price','') is not null then
    if (p_product->>'compare_at_price') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then raise exception 'invalid_compare_price'; end if;
    v_compare := (p_product->>'compare_at_price')::numeric;
    if v_compare<v_price then raise exception 'compare_price_below_price'; end if;
  end if;
  if nullif(p_variant->>'cost_price','') is not null then
    if (p_variant->>'cost_price') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then raise exception 'invalid_cost_price'; end if;
    v_cost := (p_variant->>'cost_price')::numeric;
  end if;
  if nullif(p_variant->>'weight_grams','') is not null then
    if (p_variant->>'weight_grams') !~ '^[0-9]{1,7}$' then raise exception 'invalid_weight'; end if;
    v_weight := (p_variant->>'weight_grams')::integer;
  end if;
  if length(coalesce(p_product->>'description',''))>10000
     or length(coalesce(p_product->>'brand',''))>100
     or length(coalesce(p_variant->>'title',''))>200
     or length(coalesce(p_variant->>'barcode',''))>100
     or jsonb_typeof(coalesce(p_product->'specifications','{}'::jsonb))<>'object'
     or octet_length(coalesce(p_product->'specifications','{}'::jsonb)::text)>16000 then
    raise exception 'invalid_product_details';
  end if;
  if not exists(select 1 from public.categories where id=v_category and is_active) then
    raise exception 'category_unavailable';
  end if;

  select * into v_old from public.products where id=v_pid for update;
  v_product_exists := found;
  if v_product_exists then
    if p_expected_product_updated_at is null or v_old.updated_at is distinct from p_expected_product_updated_at then
      raise exception using errcode='40001', message='product_changed_reload';
    end if;
  elsif p_expected_product_updated_at is not null then
    raise exception 'product_not_found';
  end if;
  select * into v_old_variant from public.product_variants where id=v_vid for update;
  v_variant_exists := found;
  if v_variant_exists then
    if v_old_variant.product_id<>v_pid then raise exception 'variant_product_mismatch'; end if;
    if p_expected_variant_updated_at is null or v_old_variant.updated_at is distinct from p_expected_variant_updated_at then
      raise exception using errcode='40001', message='inventory_changed_reload';
    end if;
  elsif p_expected_variant_updated_at is not null then
    raise exception 'variant_not_found';
  end if;
  if jsonb_array_length(p_images)>6 then raise exception 'too_many_images'; end if;
  select count(*) into v_count from public.product_images where product_id=v_pid;
  if v_count+jsonb_array_length(p_images)>12 then raise exception 'too_many_images'; end if;
  if v_status='active' and (v_count+jsonb_array_length(p_images)=0 or
     (v_stock=0 and not exists(select 1 from public.product_variants
       where product_id=v_pid and id<>v_vid and is_active and stock_quantity>0))) then
    raise exception 'publish_requires_image_and_stock';
  end if;
  for v_image in select value from jsonb_array_elements(p_images) loop
    v_image_id := (v_image->>'id')::uuid;
    v_path := v_image->>'path';
    if v_image_id is null or v_path is null
       or v_path !~ ('^products/'||v_pid::text||'/[0-9a-f-]{36}\.jpg$') then
      raise exception 'invalid_image_path';
    end if;
    if not exists(select 1 from storage.objects where bucket_id='product-images' and name=v_path) then
      raise exception 'image_upload_missing';
    end if;
    if exists(select 1 from public.product_images where id=v_image_id) then
      raise exception 'image_id_already_used';
    end if;
  end loop;

  if v_product_exists then
    update public.products set category_id=v_category,name=v_name,
      description=nullif(btrim(p_product->>'description'),''),brand=nullif(btrim(p_product->>'brand'),''),
      base_price=v_price,compare_at_price=v_compare,status=v_status,
      specifications=coalesce(v_old.specifications,'{}')||coalesce(p_product->'specifications','{}')
    where id=v_pid;
  else
    insert into public.products(id,category_id,name,slug,description,brand,base_price,compare_at_price,status,specifications)
    values(v_pid,v_category,v_name,'product-'||v_pid::text,nullif(btrim(p_product->>'description'),''),
      nullif(btrim(p_product->>'brand'),''),v_price,v_compare,v_status,coalesce(p_product->'specifications','{}'));
  end if;
  perform set_config('app.inventory_reason','catalog_editor',true);
  if v_variant_exists then
    update public.product_variants set sku=v_sku,title=coalesce(nullif(btrim(p_variant->>'title'),''),'Default'),
      price=v_price,stock_quantity=v_stock,barcode=nullif(btrim(p_variant->>'barcode'),''),weight_grams=v_weight,
      attributes=coalesce(v_old_variant.attributes,'{}')||coalesce(p_product->'specifications','{}')
    where id=v_vid;
  else
    insert into public.product_variants(id,product_id,sku,title,price,stock_quantity,barcode,weight_grams,attributes,is_active)
    values(v_vid,v_pid,v_sku,coalesce(nullif(btrim(p_variant->>'title'),''),'Default'),v_price,v_stock,
      nullif(btrim(p_variant->>'barcode'),''),v_weight,coalesce(p_product->'specifications','{}'),true);
  end if;
  -- Blank cost means "leave unchanged", never delete the previous cost.
  if v_cost is not null then
    insert into public.variant_costs(variant_id,cost_price) values(v_vid,v_cost)
      on conflict(variant_id) do update set cost_price=excluded.cost_price,updated_at=now();
    if (select count(*) from public.product_variants where product_id=v_pid)=1 then
      insert into public.product_costs(product_id,cost_price) values(v_pid,v_cost)
        on conflict(product_id) do update set cost_price=excluded.cost_price,updated_at=now();
    end if;
  end if;
  for v_image in select value from jsonb_array_elements(p_images) loop
    v_path := v_image->>'path';
    v_url := 'https://fskfwngswatbetgxkmei.supabase.co/storage/v1/object/public/product-images/'||v_path;
    insert into public.product_images(id,product_id,url,alt_text,sort_order)
    values((v_image->>'id')::uuid,v_pid,v_url,v_name,v_count);
    v_count := v_count+1;
  end loop;
  select jsonb_build_object('product_id',p.id,'variant_id',v.id,'product_updated_at',p.updated_at,
      'variant_updated_at',v.updated_at,'status',p.status,'replayed',false)
    into v_result from public.products p join public.product_variants v on v.product_id=p.id
    where p.id=v_pid and v.id=v_vid;
  insert into private.catalog_save_receipts(request_id,actor_id,request_hash,result)
    values(p_request_id,v_actor,v_hash,v_result);
  return v_result;
end;
$function$;
revoke all on function public.admin_save_product_v2(uuid,jsonb,jsonb,jsonb,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_save_product_v2(uuid,jsonb,jsonb,jsonb,timestamptz,timestamptz) to authenticated;
