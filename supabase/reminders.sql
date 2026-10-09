-- Throttle table for dose reminders (one row per due item; the edge function updates it)
create table if not exists public.reminder_state (
  key text primary key,
  last_sent timestamptz not null default now()
);
alter table public.reminder_state enable row level security;
-- No client access: only the service role (edge function) touches it.
