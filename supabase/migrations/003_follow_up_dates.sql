-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Adds a follow-up date to clients: the day you next intend to chase this
-- deal. Overdue invoices already answer "who owes me money"; this answers
-- "who haven't I chased", which is the other half of what a freelancer opens
-- a CRM to find out.
--
-- Deliberately a plain date rather than a reminder system — no scheduling, no
-- notifications, nothing to run in the background. The board reads it and
-- flags anything due.

alter table public.clients add column if not exists follow_up_on date;

-- The board filters on this across every client on each render, so it is
-- worth an index even at small scale.
create index if not exists clients_follow_up_on_idx
  on public.clients (user_id, follow_up_on)
  where follow_up_on is not null;
