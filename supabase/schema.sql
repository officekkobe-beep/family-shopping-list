create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  store_id uuid references public.stores(id) on delete restrict,
  memo text,
  is_selected boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_events (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  operation text not null,
  created_at timestamptz not null default now()
);

create schema if not exists private;

create table if not exists private.app_config (
  key text primary key,
  value text not null
);

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_store_id_idx on public.products(store_id);
create index if not exists products_selected_idx on public.products(is_selected);
create index if not exists products_sort_idx on public.products(category_id, sort_order, name);
create index if not exists categories_sort_idx on public.categories(sort_order, name);
create index if not exists stores_sort_idx on public.stores(sort_order, name);
create index if not exists shopping_events_created_at_idx on public.shopping_events(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create or replace function private.valid_family_share_key()
returns boolean
language sql
stable
security definer
set search_path = private
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-family-share-key',
    ''
  ) = (
    select value from private.app_config where key = 'family_share_key'
  )
  and length((
    select value from private.app_config where key = 'family_share_key'
  )) >= 32;
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on table private.app_config from public, anon, authenticated;
grant usage on schema private to anon;
grant execute on function private.valid_family_share_key() to anon;

alter table public.categories enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.shopping_events enable row level security;

drop policy if exists "family can read categories" on public.categories;
drop policy if exists "family can write categories" on public.categories;
drop policy if exists "family can insert categories" on public.categories;
drop policy if exists "family can update categories" on public.categories;
drop policy if exists "family can delete categories" on public.categories;
create policy "family can read categories" on public.categories
for select to anon
using (private.valid_family_share_key());

create policy "family can insert categories" on public.categories
for insert to anon
with check (private.valid_family_share_key());

create policy "family can update categories" on public.categories
for update to anon
using (private.valid_family_share_key())
with check (private.valid_family_share_key());

create policy "family can delete categories" on public.categories
for delete to anon
using (private.valid_family_share_key());

drop policy if exists "family can read stores" on public.stores;
drop policy if exists "family can write stores" on public.stores;
drop policy if exists "family can insert stores" on public.stores;
drop policy if exists "family can update stores" on public.stores;
drop policy if exists "family can delete stores" on public.stores;
create policy "family can read stores" on public.stores
for select to anon
using (private.valid_family_share_key());

create policy "family can insert stores" on public.stores
for insert to anon
with check (private.valid_family_share_key());

create policy "family can update stores" on public.stores
for update to anon
using (private.valid_family_share_key())
with check (private.valid_family_share_key());

create policy "family can delete stores" on public.stores
for delete to anon
using (private.valid_family_share_key());

drop policy if exists "family can read products" on public.products;
drop policy if exists "family can write products" on public.products;
drop policy if exists "family can insert products" on public.products;
drop policy if exists "family can update products" on public.products;
drop policy if exists "family can delete products" on public.products;
create policy "family can read products" on public.products
for select to anon
using (private.valid_family_share_key());

create policy "family can insert products" on public.products
for insert to anon
with check (private.valid_family_share_key());

create policy "family can update products" on public.products
for update to anon
using (private.valid_family_share_key())
with check (private.valid_family_share_key());

create policy "family can delete products" on public.products
for delete to anon
using (private.valid_family_share_key());

grant usage on schema public to anon;
grant select, insert, update, delete on public.categories to anon;
grant select, insert, update, delete on public.stores to anon;
grant select, insert, update, delete on public.products to anon;
grant select on public.shopping_events to anon;

drop policy if exists "anyone can receive empty shopping events" on public.shopping_events;
create policy "anyone can receive empty shopping events" on public.shopping_events
for select to anon
using (true);

create or replace function public.emit_shopping_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shopping_events(source_table, operation)
  values (tg_table_name, tg_op);
  return null;
end;
$$;

revoke all on function public.emit_shopping_event() from public, anon, authenticated;

drop trigger if exists categories_emit_shopping_event on public.categories;
create trigger categories_emit_shopping_event
after insert or update or delete on public.categories
for each statement execute function public.emit_shopping_event();

drop trigger if exists stores_emit_shopping_event on public.stores;
create trigger stores_emit_shopping_event
after insert or update or delete on public.stores
for each statement execute function public.emit_shopping_event();

drop trigger if exists products_emit_shopping_event on public.products;
create trigger products_emit_shopping_event
after insert or update or delete on public.products
for each statement execute function public.emit_shopping_event();

create or replace function public.replace_shopping_master(payload jsonb)
returns void
language plpgsql
set search_path = pg_temp, public, private
as $$
begin
  if not private.valid_family_share_key() then
    raise exception 'invalid share key';
  end if;

  if jsonb_typeof(payload -> 'categories') <> 'array'
    or jsonb_typeof(payload -> 'stores') <> 'array'
    or jsonb_typeof(payload -> 'products') <> 'array' then
    raise exception 'invalid payload';
  end if;

  create temporary table tmp_categories (
    name text primary key,
    sort_order integer not null,
    is_active boolean not null
  ) on commit drop;

  create temporary table tmp_stores (
    name text primary key,
    sort_order integer not null,
    is_active boolean not null
  ) on commit drop;

  create temporary table tmp_products (
    name text not null,
    category_name text not null,
    store_name text,
    memo text,
    is_selected boolean not null,
    sort_order integer not null
  ) on commit drop;

  insert into tmp_categories(name, sort_order, is_active)
  select trim(name), sort_order, coalesce(is_active, true)
  from jsonb_to_recordset(payload -> 'categories') as x(name text, sort_order integer, is_active boolean)
  where trim(coalesce(name, '')) <> ''
  on conflict (name) do update set sort_order = excluded.sort_order, is_active = excluded.is_active;

  insert into tmp_stores(name, sort_order, is_active)
  select trim(name), sort_order, coalesce(is_active, true)
  from jsonb_to_recordset(payload -> 'stores') as x(name text, sort_order integer, is_active boolean)
  where trim(coalesce(name, '')) <> ''
  on conflict (name) do update set sort_order = excluded.sort_order, is_active = excluded.is_active;

  insert into tmp_products(name, category_name, store_name, memo, is_selected, sort_order)
  select trim(name), trim(category_name), nullif(trim(coalesce(store_name, '')), ''), memo, coalesce(is_selected, false), sort_order
  from jsonb_to_recordset(payload -> 'products') as x(
    name text,
    category_name text,
    store_name text,
    memo text,
    is_selected boolean,
    sort_order integer
  )
  where trim(coalesce(name, '')) <> '' and trim(coalesce(category_name, '')) <> '';

  insert into tmp_categories(name, sort_order, is_active)
  select distinct category_name, 100000 + row_number() over(order by category_name), true
  from tmp_products
  where category_name not in (select name from tmp_categories)
  on conflict (name) do nothing;

  insert into tmp_stores(name, sort_order, is_active)
  select distinct store_name, 100000 + row_number() over(order by store_name), true
  from tmp_products
  where store_name is not null and store_name not in (select name from tmp_stores)
  on conflict (name) do nothing;

  delete from public.products where true;
  delete from public.categories where true;
  delete from public.stores where true;

  insert into public.categories(name, sort_order, is_active)
  select name, sort_order, is_active from tmp_categories order by sort_order, name;

  insert into public.stores(name, sort_order, is_active)
  select name, sort_order, is_active from tmp_stores order by sort_order, name;

  insert into public.products(name, category_id, store_id, memo, is_selected, sort_order)
  select p.name, c.id, s.id, nullif(p.memo, ''), p.is_selected, p.sort_order
  from tmp_products p
  join public.categories c on c.name = p.category_name
  left join public.stores s on s.name = p.store_name
  order by c.sort_order, p.sort_order, p.name;
end;
$$;

grant execute on function public.replace_shopping_master(jsonb) to anon;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
  ) then
    alter publication supabase_realtime drop table public.categories;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stores'
  ) then
    alter publication supabase_realtime drop table public.stores;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime drop table public.products;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_events'
  ) then
    alter publication supabase_realtime add table public.shopping_events;
  end if;
end;
$$;

-- Run this after replacing the value with the same 32+ character key used in FAMILY_SHARE_KEY:
-- insert into private.app_config(key, value)
-- values ('family_share_key', 'replace-with-a-random-32-plus-character-share-key')
-- on conflict (key) do update set value = excluded.value;
