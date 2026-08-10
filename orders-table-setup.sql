-- Run this once in Supabase → SQL Editor → New query → paste this whole thing → Run
-- Safe to re-run: uses "if not exists" / "or replace" everywhere.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  courier_id uuid references auth.users(id),
  created_at timestamptz default now(),
  items text,
  vehicle text,
  from_address text,
  to_address text,
  price numeric,
  status text default 'Booked'
);

-- If you already created this table before courier support was added,
-- this adds the missing column without touching existing data.
alter table public.orders add column if not exists courier_id uuid references auth.users(id);

-- Lock the table down
alter table public.orders enable row level security;

-- CUSTOMERS: can see their own orders
drop policy if exists "Users can view their own orders" on public.orders;
create policy "Users can view their own orders"
  on public.orders for select
  using (auth.uid() = user_id);

-- CUSTOMERS: can create their own orders
drop policy if exists "Users can create their own orders" on public.orders;
create policy "Users can create their own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

-- COURIERS: can see unassigned jobs (available board) and jobs assigned to them
drop policy if exists "Couriers can view available or own jobs" on public.orders;
create policy "Couriers can view available or own jobs"
  on public.orders for select
  using (courier_id is null or auth.uid() = courier_id);

-- COURIERS: can accept an unassigned job (assign themselves) or update a job already theirs
drop policy if exists "Couriers can accept or update their jobs" on public.orders;
create policy "Couriers can accept or update their jobs"
  on public.orders for update
  using (courier_id is null or auth.uid() = courier_id)
  with check (auth.uid() = courier_id);
