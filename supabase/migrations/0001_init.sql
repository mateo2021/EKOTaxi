-- Eko Taxi: schema, RLS, realtime, heartbeat

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  default_class text not null default 'economy' check (default_class in ('economy', 'comfort', 'xl')),
  notify_ride_status boolean not null default true,
  notify_promos boolean not null default true,
  discord_webhook_url text,
  is_admin boolean not null default false
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  car text not null,
  plate text not null,
  rating numeric(2,1) not null check (rating between 1 and 5),
  class text not null check (class in ('economy', 'comfort', 'xl'))
);

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_address text not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  class text not null check (class in ('economy', 'comfort', 'xl')),
  distance_km numeric(6,1) not null,
  price_pln integer not null,
  status text not null default 'searching'
    check (status in ('searching', 'accepted', 'in_progress', 'completed', 'cancelled')),
  driver_id uuid references public.drivers (id),
  last_notified_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 500),
  answer text,
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create table if not exists public.worker_heartbeat (
  id int primary key check (id = 1),
  last_seen timestamptz not null
);

create index if not exists rides_user_created_idx on public.rides (user_id, created_at desc);
create index if not exists chat_messages_user_created_idx on public.chat_messages (user_id, created_at);

-- Profile auto-creation on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.rides enable row level security;
alter table public.promos enable row level security;
alter table public.chat_messages enable row level security;
alter table public.worker_heartbeat enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Users cannot grant themselves is_admin: only these columns are updatable
revoke update on public.profiles from authenticated;
grant update (display_name, theme, default_class, notify_ride_status, notify_promos, discord_webhook_url)
  on public.profiles to authenticated;

drop policy if exists rides_select_own on public.rides;
create policy rides_select_own on public.rides
  for select to authenticated using (user_id = auth.uid());

drop policy if exists chat_messages_select_own on public.chat_messages;
create policy chat_messages_select_own on public.chat_messages
  for select to authenticated using (user_id = auth.uid());

drop policy if exists chat_messages_insert_own on public.chat_messages;
create policy chat_messages_insert_own on public.chat_messages
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and answer is null);

drop policy if exists drivers_select_authenticated on public.drivers;
create policy drivers_select_authenticated on public.drivers
  for select to authenticated using (true);

drop policy if exists promos_select_authenticated on public.promos;
create policy promos_select_authenticated on public.promos
  for select to authenticated using (true);

drop policy if exists worker_heartbeat_select_authenticated on public.worker_heartbeat;
create policy worker_heartbeat_select_authenticated on public.worker_heartbeat
  for select to authenticated using (true);

-- Realtime for the chat
alter publication supabase_realtime add table public.chat_messages;

-- Initial heartbeat row
insert into public.worker_heartbeat (id, last_seen) values (1, 'epoch')
on conflict (id) do nothing;
