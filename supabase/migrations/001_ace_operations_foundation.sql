-- Ace Collectibles central operations foundation.
-- Run this in a NEW Supabase project. It does not read or modify Google Sheets.

create extension if not exists pgcrypto;

create table if not exists public.ace_system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.ace_system_settings (key, value)
values ('schema_version', '{"version":1}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'worker' check (role in ('owner', 'manager', 'worker', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  inventory_id text primary key,
  item_name text not null,
  category text not null check (category in ('Pokémon Products', 'Warehouse Supplies')),
  quantity integer not null check (quantity >= 0),
  low_stock_level integer not null default 0 check (low_stock_level >= 0),
  reorder_amount integer not null default 0 check (reorder_amount >= 0),
  source_system text not null default 'GOOGLE_SHEETS',
  source_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists inventory_items_name_idx on public.inventory_items (lower(item_name));

create table if not exists public.inventory_movements (
  movement_id text primary key,
  occurred_at timestamptz not null,
  transaction_id text not null,
  item_name text not null,
  category text not null,
  previous_quantity integer not null,
  quantity_changed integer not null,
  new_quantity integer not null check (new_quantity >= 0),
  action_type text not null check (action_type in ('DEDUCTION', 'RECEIVED', 'ADJUSTMENT', 'CORRECTION')),
  reason text not null default '',
  actor_user_id uuid references auth.users(id),
  actor_name text not null,
  source_system text not null default 'GOOGLE_SHEETS',
  created_at timestamptz not null default now(),
  check (previous_quantity + quantity_changed = new_quantity)
);

create index if not exists inventory_movements_item_time_idx on public.inventory_movements (lower(item_name), occurred_at desc);
create index if not exists inventory_movements_transaction_idx on public.inventory_movements (transaction_id);

create table if not exists public.packing_batches (
  batch_id text primary key check (batch_id ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null,
  status text not null,
  total_orders integer not null default 0,
  processed_pages integer not null default 0,
  orders_needing_review integer not null default 0,
  verification_passed boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by_user_id uuid references auth.users(id),
  confirmed_by_name text,
  source_system text not null default 'PACKING_APP',
  updated_at timestamptz not null default now()
);

create table if not exists public.packing_batch_runs (
  run_id text primary key,
  batch_id text not null references public.packing_batches(batch_id) on delete cascade,
  created_at timestamptz not null,
  status text not null,
  zip_object_path text,
  artifact_count integer not null default 0,
  mirrored_at timestamptz not null default now()
);

create index if not exists packing_batch_runs_batch_time_idx on public.packing_batch_runs (batch_id, created_at desc);

create table if not exists public.packing_batch_orders (
  batch_order_id text primary key,
  batch_id text not null references public.packing_batches(batch_id) on delete cascade,
  order_key text not null,
  order_id text,
  tracking_number text,
  packing_group text not null default '',
  needs_review boolean not null default false,
  order_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (batch_id, order_key)
);

create index if not exists packing_batch_orders_order_key_idx on public.packing_batch_orders (order_key);

create table if not exists public.packing_batch_artifacts (
  artifact_id text primary key,
  batch_id text not null references public.packing_batches(batch_id) on delete cascade,
  run_id text not null references public.packing_batch_runs(run_id) on delete cascade,
  object_path text not null unique,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.packing_activity (
  activity_id text primary key,
  occurred_at timestamptz not null,
  batch_id text not null,
  order_id text not null,
  worker_user_id uuid references auth.users(id),
  worker_name text not null,
  action text not null check (action in ('START', 'DONE', 'ISSUE')),
  buyer_nickname text not null default '',
  packing_group text not null default '',
  source_system text not null default 'GOOGLE_SHEETS',
  created_at timestamptz not null default now()
);

create index if not exists packing_activity_batch_order_idx on public.packing_activity (batch_id, order_id, occurred_at desc);

create table if not exists public.inventory_receipts (
  receipt_id uuid primary key,
  status text not null check (status in ('awaiting_confirmation', 'confirmed', 'cancelled', 'failed')),
  reason text not null,
  created_by_user_id uuid references auth.users(id),
  created_by_name text not null,
  receipt_data jsonb not null,
  created_at timestamptz not null,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.current_ace_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where user_id = auth.uid() and active = true
$$;

create or replace function public.create_ace_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''), 'worker')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_ace_profile on auth.users;
create trigger on_auth_user_created_create_ace_profile
after insert on auth.users for each row execute procedure public.create_ace_profile();

alter table public.ace_system_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.packing_batches enable row level security;
alter table public.packing_batch_runs enable row level security;
alter table public.packing_batch_orders enable row level security;
alter table public.packing_batch_artifacts enable row level security;
alter table public.packing_activity enable row level security;
alter table public.inventory_receipts enable row level security;

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles for select to authenticated using (user_id = auth.uid() or public.current_ace_role() in ('owner', 'manager'));
drop policy if exists "owners manage profiles" on public.profiles;
create policy "owners manage profiles" on public.profiles for all to authenticated using (public.current_ace_role() = 'owner') with check (public.current_ace_role() = 'owner');

drop policy if exists "authenticated read operational records" on public.inventory_items;
create policy "authenticated read operational records" on public.inventory_items for select to authenticated using (public.current_ace_role() is not null);
drop policy if exists "authenticated read inventory movements" on public.inventory_movements;
create policy "authenticated read inventory movements" on public.inventory_movements for select to authenticated using (public.current_ace_role() is not null);
drop policy if exists "authenticated read packing batches" on public.packing_batches;
create policy "authenticated read packing batches" on public.packing_batches for select to authenticated using (public.current_ace_role() is not null);
drop policy if exists "authenticated read packing runs" on public.packing_batch_runs;
create policy "authenticated read packing runs" on public.packing_batch_runs for select to authenticated using (public.current_ace_role() is not null);
drop policy if exists "authenticated read packing orders" on public.packing_batch_orders;
create policy "authenticated read packing orders" on public.packing_batch_orders for select to authenticated using (public.current_ace_role() is not null);
drop policy if exists "authenticated read artifact index" on public.packing_batch_artifacts;
create policy "authenticated read artifact index" on public.packing_batch_artifacts for select to authenticated using (public.current_ace_role() is not null);
drop policy if exists "authenticated read packing activity" on public.packing_activity;
create policy "authenticated read packing activity" on public.packing_activity for select to authenticated using (public.current_ace_role() is not null);
drop policy if exists "authenticated read receipts" on public.inventory_receipts;
create policy "authenticated read receipts" on public.inventory_receipts for select to authenticated using (public.current_ace_role() is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('packing-files', 'packing-files', false, 524288000, array['application/json', 'application/pdf', 'application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated read packing files" on storage.objects;
create policy "authenticated read packing files" on storage.objects for select to authenticated using (bucket_id = 'packing-files' and public.current_ace_role() is not null);

-- Browser clients never receive the server secret. All writes currently flow through
-- the Ace Node server, which uses the secret key and preserves existing validations.
