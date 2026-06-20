-- Run this once in Supabase SQL Editor before using products from Supabase.
-- It keeps the public product catalog readable, while checkout still validates prices server-side.

alter table public.products
add column if not exists description_de text,
add column if not exists category text not null default 'tech',
add column if not exists rating numeric not null default 4,
add column if not exists is_active boolean not null default true;

alter table public.products enable row level security;

drop policy if exists "Anyone can read active products" on public.products;
create policy "Anyone can read active products"
on public.products
for select
using (is_active = true);

grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;

notify pgrst, 'reload schema';
