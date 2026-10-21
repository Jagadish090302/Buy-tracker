-- JASHxp Buy Tracker — Supabase setup
-- IMPORTANT:
-- 1) Create your owner account first in Supabase Dashboard > Authentication > Users.
-- 2) Copy that user's UUID.
-- 3) Replace c10f077f-b57f-437b-abf7-66e52a0210ef below with the UUID (keep the single quotes).
-- 4) Run this whole script in Supabase SQL Editor.
-- Never put a service_role key in app.js or GitHub.

create extension if not exists pgcrypto;

create table if not exists public.tracker_config (
  singleton boolean primary key default true check (singleton),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_tracker_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tracker_config c
    where c.singleton = true and c.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.is_tracker_owner() from public;
grant execute on function public.is_tracker_owner() to anon, authenticated;

create table if not exists public.tracker_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null default 'Other',
  status text not null default 'planning'
    check (status in ('planning','purchased','repair_needed','under_repair','repaired','retired')),
  priority text not null default 'medium'
    check (priority in ('low','medium','high','critical')),
  planned_price numeric(12,2) not null default 0 check (planned_price >= 0),
  actual_price numeric(12,2) not null default 0 check (actual_price >= 0),
  repair_cost numeric(12,2) not null default 0 check (repair_cost >= 0),
  target_date date,
  purchase_date date,
  warranty_end date,
  model text not null default '',
  notes text not null default '',
  photo_url text,
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  repairs jsonb not null default '[]'::jsonb check (jsonb_typeof(repairs) = 'array'),
  price_history jsonb not null default '[]'::jsonb check (jsonb_typeof(price_history) = 'array'),
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  quality_rating integer not null default 0 check (quality_rating between 0 and 5),
  value_rating integer not null default 0 check (value_rating between 0 and 5),
  durability_rating integer not null default 0 check (durability_rating between 0 and 5),
  last_repaired_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracker_items_created_at_idx on public.tracker_items(created_at desc);
create index if not exists tracker_items_status_idx on public.tracker_items(status);
create index if not exists tracker_items_category_idx on public.tracker_items(category);

create or replace function public.set_tracker_item_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists tracker_items_updated_at on public.tracker_items;
create trigger tracker_items_updated_at before update on public.tracker_items
for each row execute function public.set_tracker_item_updated_at();

alter table public.tracker_config enable row level security;
alter table public.tracker_items enable row level security;

-- No direct config-table reads or writes from browsers.
revoke all on public.tracker_config from anon, authenticated;
grant select, insert, update, delete on public.tracker_items to anon, authenticated;

drop policy if exists "Public can read tracker items" on public.tracker_items;
create policy "Public can read tracker items" on public.tracker_items
for select to anon, authenticated using (true);

drop policy if exists "Owner can insert tracker items" on public.tracker_items;
create policy "Owner can insert tracker items" on public.tracker_items
for insert to authenticated with check (public.is_tracker_owner() and owner_id = (select auth.uid()));

drop policy if exists "Owner can update tracker items" on public.tracker_items;
create policy "Owner can update tracker items" on public.tracker_items
for update to authenticated using (public.is_tracker_owner() and owner_id = (select auth.uid()))
with check (public.is_tracker_owner() and owner_id = (select auth.uid()));

drop policy if exists "Owner can delete tracker items" on public.tracker_items;
create policy "Owner can delete tracker items" on public.tracker_items
for delete to authenticated using (public.is_tracker_owner() and owner_id = (select auth.uid()));

-- Public bucket for item images. Do not upload private receipts containing sensitive data.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tracker-photos','tracker-photos',true,8388608,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=true, file_size_limit=8388608,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "Public can view tracker photos" on storage.objects;
create policy "Public can view tracker photos" on storage.objects
for select to anon, authenticated using (bucket_id = 'tracker-photos');

drop policy if exists "Owner can upload tracker photos" on storage.objects;
create policy "Owner can upload tracker photos" on storage.objects
for insert to authenticated with check (bucket_id = 'tracker-photos' and public.is_tracker_owner());

drop policy if exists "Owner can update tracker photos" on storage.objects;
create policy "Owner can update tracker photos" on storage.objects
for update to authenticated using (bucket_id = 'tracker-photos' and public.is_tracker_owner())
with check (bucket_id = 'tracker-photos' and public.is_tracker_owner());

drop policy if exists "Owner can delete tracker photos" on storage.objects;
create policy "Owner can delete tracker photos" on storage.objects
for delete to authenticated using (bucket_id = 'tracker-photos' and public.is_tracker_owner());

-- Configure the owner account. Replace UUID before running.
insert into public.tracker_config(singleton, owner_id)
values (true, 'c10f077f-b57f-437b-abf7-66e52a0210ef')
on conflict (singleton) do update set owner_id = excluded.owner_id;

-- Seed the handwritten list. Re-running this seed does not duplicate names.
insert into public.tracker_items(owner_id,name,category,status,priority,notes)
select c.owner_id, seed.name, seed.category, 'planning', seed.priority, seed.notes
from public.tracker_config c
cross join (values
  ('Monitor','PC & tech','high','Monitor upgrade.'),
  ('8 GB DDR4 RAM','PC & tech','high','Check laptop compatibility and available memory slot before buying.'),
  ('1 TB SSD','PC & tech','high','Storage upgrade.'),
  ('Android Box','Home','medium','TV streaming box.'),
  ('New headlight / front part for Unicorn bike','Bike','medium','Confirm exact model and fitment before ordering.'),
  ('New mobile','Mobile','high','Compare current models, storage and software support.'),
  ('Mic / gaming headphones','Gaming','medium','Prioritise a good microphone and comfort.'),
  ('Parrot toy','Other','low','Toy from the handwritten list.'),
  ('Shoes','Clothing','medium',''),
  ('Slippers','Clothing','low',''),
  ('Projector','Home','medium',''),
  ('RE GT 650','Bike','high','Royal Enfield Continental GT 650 goal.')
) as seed(name,category,priority,notes)
where c.singleton = true
and not exists (
  select 1 from public.tracker_items i
  where i.owner_id = c.owner_id and lower(i.name) = lower(seed.name)
);

-- Verification queries (optional):
-- select public.is_tracker_owner();
-- select id,name,status,owner_id from public.tracker_items order by created_at;
