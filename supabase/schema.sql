-- PurpleLog shared database (Supabase / Postgres)
-- One shared household: every signed-in user listed in `members` can read and write everything.
-- Documents are stored as JSON bodies keyed by the app's own ids, mirroring the local Dexie tables.

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

-- Emails allowed to join (the owner adds the partner's email here).
create table if not exists public.allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.docs (
  tbl text not null,
  id text not null,
  dog_id text,
  body jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted boolean not null default false,
  primary key (tbl, id)
);
create index if not exists docs_tbl_updated_idx on public.docs (tbl, updated_at);
create index if not exists docs_dog_idx on public.docs (dog_id);

-- Push subscriptions for dose reminders (one row per device)
create table if not exists public.push_subscriptions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- Who may do what -----------------------------------------------------------
alter table public.members enable row level security;
alter table public.allowlist enable row level security;
alter table public.docs enable row level security;
alter table public.push_subscriptions enable row level security;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.user_id = auth.uid());
$$;

create or replace function public.email_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowlist a
    where lower(a.email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );
$$;

-- A signed-in user whose email is on the allowlist can register themselves as a member.
create or replace function public.join_household() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.email_allowed() then
    raise exception 'email not allowed';
  end if;
  insert into public.members (user_id, email)
  values (auth.uid(), auth.jwt() ->> 'email')
  on conflict (user_id) do nothing;
end;
$$;

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (public.is_member());

drop policy if exists allowlist_read on public.allowlist;
create policy allowlist_read on public.allowlist for select to authenticated using (public.is_member());
drop policy if exists allowlist_write on public.allowlist;
create policy allowlist_write on public.allowlist for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists docs_rw on public.docs;
create policy docs_rw on public.docs for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Keep updated_at / updated_by current on every write
create or replace function public.docs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.docs_touch();

-- Live updates to every open app
alter publication supabase_realtime add table public.docs;

-- Image storage for lab reports
insert into storage.buckets (id, name, public) values ('lab-images', 'lab-images', false)
on conflict (id) do nothing;
drop policy if exists lab_images_rw on storage.objects;
create policy lab_images_rw on storage.objects for all to authenticated
  using (bucket_id = 'lab-images' and public.is_member())
  with check (bucket_id = 'lab-images' and public.is_member());

-- Bootstrap: the first allowed email (the owner)
insert into public.allowlist (email) values ('koz2030@gmail.com') on conflict do nothing;
