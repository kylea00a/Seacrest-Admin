-- Seacrest Admin — backup mirror for local JSON under data/admin/
-- Run in Supabase: SQL Editor → New query → paste → Run
-- Or: supabase db push (if using Supabase CLI linked to this project)

-- Key-value store: one row per logical file (e.g. settings.json, orders/2026-04-07.json)
create table if not exists public.admin_storage_backup (
  storage_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.admin_storage_backup is 'Backup of data/admin JSON files for disaster recovery.';

create index if not exists idx_admin_storage_backup_updated_at
  on public.admin_storage_backup (updated_at desc);

alter table public.admin_storage_backup enable row level security;

-- anon/authenticated: no policies (no direct client access).
-- Server scripts using the service_role key bypass RLS.
