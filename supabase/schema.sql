-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- once you've created your project. This sets up the first real table:
-- the pipeline of clients/deals.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  stage text not null default 'lead' check (stage in ('lead', 'proposal_sent', 'negotiating', 'won', 'lost')),
  value_pence integer, -- store money as integer pence to avoid float rounding issues
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security: every freelancer only ever sees their own clients.
alter table public.clients enable row level security;

create policy "Users can view their own clients"
  on public.clients for select
  using (auth.uid() = user_id);

create policy "Users can insert their own clients"
  on public.clients for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own clients"
  on public.clients for update
  using (auth.uid() = user_id);

create policy "Users can delete their own clients"
  on public.clients for delete
  using (auth.uid() = user_id);
