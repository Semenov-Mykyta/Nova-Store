-- Run this once in Supabase SQL Editor if you want My Orders to show products inside each order.
-- This table matches supabase/functions/checkout/index.ts and js/my-orders.js.

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  title text,
  quantity integer not null default 1 check (quantity > 0),
  price numeric not null default 0,
  created_at timestamptz default now()
);

alter table public.order_items enable row level security;

drop policy if exists "Users can read own order items" on public.order_items;
create policy "Users can read own order items"
on public.order_items for select
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own order items" on public.order_items;
create policy "Users can insert own order items"
on public.order_items for insert
with check (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
  )
);
