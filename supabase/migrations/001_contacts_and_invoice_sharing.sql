-- Run this in the Supabase SQL Editor against your existing project.
-- Safe to re-run: every step is guarded.
--
-- Adds:
--   1. contact details on clients (email, phone, company)
--   2. invoice numbers, due dates, and a public share link per invoice
--
-- `supabase/schema.sql` already includes all of this, so a *fresh* project
-- needs only that file, not this one.

-- ---------------------------------------------------------------------------
-- 1. Contact details
-- ---------------------------------------------------------------------------

alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists company text;

-- ---------------------------------------------------------------------------
-- 2. Invoice numbers, due dates, share tokens
-- ---------------------------------------------------------------------------

alter table public.invoices add column if not exists invoice_number integer;
alter table public.invoices add column if not exists due_date date;

-- The default is volatile, so Postgres rewrites the table and evaluates it
-- once per existing row — every invoice gets its own token, not a shared one.
alter table public.invoices
  add column if not exists share_token uuid not null default gen_random_uuid();

create unique index if not exists invoices_share_token_key
  on public.invoices (share_token);

-- Number any invoices that predate this migration, per user, oldest first.
with numbered as (
  select id,
         row_number() over (partition by user_id order by created_at, id) as n
  from public.invoices
  where invoice_number is null
)
update public.invoices i
   set invoice_number = numbered.n
  from numbered
 where numbered.id = i.id;

-- New invoices get the next number for that user. Sequential per freelancer,
-- so numbering doesn't jump around or leak how many other users exist.
--
-- Two invoices created in the same instant could in principle collide here;
-- at one user raising invoices by hand that is not a real risk, and the fix
-- (a per-user counter row with a lock) is not worth the complexity yet.
create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invoice_number is null then
    select coalesce(max(invoice_number), 0) + 1
      into new.invoice_number
      from public.invoices
     where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_assign_number on public.invoices;
create trigger invoices_assign_number
  before insert on public.invoices
  for each row execute function public.assign_invoice_number();

-- ---------------------------------------------------------------------------
-- 3. Public invoice view
-- ---------------------------------------------------------------------------
-- Same shape as the contract signing flow: the client has no account, so RLS
-- blocks them from `invoices` entirely. This function is the only way in, it
-- takes the token as its sole credential, and it returns just the fields the
-- invoice page displays — never the row's ids or the owner's other invoices.
--
-- Drafts are deliberately excluded: an unsent invoice must not be reachable
-- even by someone holding its link.

create or replace function public.get_invoice_by_token(p_token uuid)
returns table (
  invoice_number integer,
  amount_pence integer,
  basis text,
  status text,
  due_date date,
  created_at timestamptz,
  client_name text,
  issuer_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.invoice_number,
         i.amount_pence,
         i.basis,
         i.status,
         i.due_date,
         i.created_at,
         c.name,
         u.email::text
    from public.invoices i
    join public.clients c on c.id = i.client_id
    join auth.users u on u.id = i.user_id
   where i.share_token = p_token
     and i.status <> 'draft';
$$;

grant execute on function public.get_invoice_by_token(uuid) to anon, authenticated;
