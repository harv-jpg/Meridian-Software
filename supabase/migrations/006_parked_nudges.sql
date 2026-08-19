-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Adds the table behind drafts written while you are not here.
--
-- Until now nothing in this app ran unless a browser was open and you were
-- looking at it. A nightly job now finds clients that have gone quiet and
-- invoices that are overdue, writes a follow-up for each, and parks it here.
-- You open the app to drafts already waiting.
--
-- "Parked" is the whole point: a nudge is never sent by the job that wrote
-- it. It sits until you read it, edit it and send it yourself, or dismiss it.
-- Nothing in this schema can put an email in front of a client on its own.

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,

  -- Why this nudge was written. 'silence' means the deal went quiet;
  -- 'payment' means an invoice passed its due date.
  kind text not null check (kind in ('silence', 'payment')),

  subject text not null,
  body text not null,
  -- One line naming the fact the draft leans on. Shown above it, for you.
  angle text not null,

  -- 'waiting' until you deal with it. Dismissing keeps the row so the job
  -- does not write the same nudge again tomorrow.
  status text not null default 'waiting' check (status in ('waiting', 'sent', 'dismissed')),

  -- Set when you send or dismiss, so "how long did this sit" is answerable.
  resolved_at timestamptz,

  created_at timestamptz not null default now()
);

-- The dashboard asks for one user's waiting nudges on every load.
create index if not exists nudges_user_status_idx
  on public.nudges (user_id, status, created_at desc);

-- The job asks "is there already an unresolved nudge for this client?" once
-- per candidate client per run, which is the hot path of the whole job.
create index if not exists nudges_client_waiting_idx
  on public.nudges (client_id, kind)
  where status = 'waiting';

alter table public.nudges enable row level security;

-- No insert policy, deliberately. Nudges are written by the nightly job using
-- the service role, which bypasses RLS entirely; nothing signed in as a user
-- has any business creating one. The policies below still scope reading and
-- resolving to the owner, so the service role is the only way in.
drop policy if exists "Users can view their own nudges" on public.nudges;
create policy "Users can view their own nudges"
  on public.nudges for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own nudges" on public.nudges;
create policy "Users can update their own nudges"
  on public.nudges for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own nudges" on public.nudges;
create policy "Users can delete their own nudges"
  on public.nudges for delete
  using (auth.uid() = user_id);
