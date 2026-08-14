-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Three things:
--   1. your own business details, so an invoice is a document a client's
--      bookkeeper will accept rather than a summary of an amount
--   2. VAT, and a client address to send it to
--   3. archiving, so finishing with a client no longer means destroying the
--      financial record of the work

-- ---------------------------------------------------------------------------
-- 1. Business details — one row per user
-- ---------------------------------------------------------------------------
-- Keyed by user_id rather than carrying its own id: there is exactly one of
-- these per account, and making that a primary key means it cannot drift into
-- two half-filled rows.

create table if not exists public.business_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  address text,
  vat_number text,
  -- Free text rather than structured sort code / account number, because
  -- this has to cover bank transfer, PayPal, international details and
  -- whatever else people actually use.
  payment_details text,
  -- Appended to every invoice: late-payment terms, company number, anything
  -- else that has to appear.
  invoice_footer text,
  /** Default VAT rate for new invoices, in basis points: 2000 = 20%. */
  default_vat_rate_bp integer not null default 0 check (default_vat_rate_bp >= 0),
  updated_at timestamptz not null default now()
);

alter table public.business_profiles enable row level security;

drop policy if exists "Users can view their own business profile" on public.business_profiles;
create policy "Users can view their own business profile"
  on public.business_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own business profile" on public.business_profiles;
create policy "Users can insert their own business profile"
  on public.business_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own business profile" on public.business_profiles;
create policy "Users can update their own business profile"
  on public.business_profiles for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. VAT and client addresses
-- ---------------------------------------------------------------------------
-- `amount_pence` stays the NET total of the line items — the existing trigger
-- keeps it that way. VAT is derived from it and the rate, so no third column
-- can fall out of step with the other two.

alter table public.invoices
  add column if not exists vat_rate_bp integer not null default 0
  check (vat_rate_bp >= 0);

alter table public.clients add column if not exists address text;

-- ---------------------------------------------------------------------------
-- 3. Archiving
-- ---------------------------------------------------------------------------
-- Deleting a client cascades to its time entries, invoices, invoice items and
-- contracts. That is the correct behaviour for a mistyped lead and a disaster
-- for a client you have actually billed — those records are ones you are
-- expected to keep for years. Archiving is now the ordinary action; the UI
-- only offers deletion for a client with nothing of record value attached.

alter table public.clients add column if not exists archived_at timestamptz;

-- The board reads only unarchived clients, so index for that.
create index if not exists clients_active_idx
  on public.clients (user_id)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- 4. Make updated_at tell the truth
-- ---------------------------------------------------------------------------
-- `clients.updated_at` has existed since the first migration and nothing has
-- ever written to it, so every row claims to have been updated when it was
-- created. Either it means something or it should not be there.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_touch_updated_at on public.clients;
create trigger clients_touch_updated_at
  before update on public.clients
  for each row execute function public.touch_updated_at();

drop trigger if exists business_profiles_touch_updated_at on public.business_profiles;
create trigger business_profiles_touch_updated_at
  before update on public.business_profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Everything the public invoice page needs, in one call
-- ---------------------------------------------------------------------------
-- Replaces the earlier get_invoice_by_token. Same rules: the token is the only
-- credential, drafts stay unreachable, and nothing is returned that the page
-- does not display.

create or replace function public.get_invoice_by_token(p_token uuid)
returns table (
  invoice_number integer,
  amount_pence integer,
  vat_rate_bp integer,
  basis text,
  status text,
  due_date date,
  created_at timestamptz,
  client_name text,
  client_address text,
  issuer_email text,
  business_name text,
  business_address text,
  vat_number text,
  payment_details text,
  invoice_footer text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.invoice_number,
         i.amount_pence,
         i.vat_rate_bp,
         i.basis,
         i.status,
         i.due_date,
         i.created_at,
         c.name,
         c.address,
         u.email::text,
         b.business_name,
         b.address,
         b.vat_number,
         b.payment_details,
         b.invoice_footer
    from public.invoices i
    join public.clients c on c.id = i.client_id
    join auth.users u on u.id = i.user_id
    left join public.business_profiles b on b.user_id = i.user_id
   where i.share_token = p_token
     and i.status <> 'draft';
$$;

grant execute on function public.get_invoice_by_token(uuid) to anon, authenticated;
